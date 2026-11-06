//! Background scheduler and broadcast queue worker sidecar.

use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use tracing::{error, info, warn};

use crate::account::AccountManager;
use crate::archive::{Archive, BroadcastCampaign, BroadcastRecipient, NewRecipient};
use crate::pacing::{
    calculate_jitter_delay_secs, calculate_typing_duration_ms, interpolate_template,
};

#[derive(Clone)]
pub struct SidecarHandle {
    archive: Archive,
    account_manager: Arc<AccountManager>,
    active_campaign: Arc<RwLock<Option<i64>>>,
    notify_wake: Arc<tokio::sync::Notify>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CampaignStatusDetails {
    pub campaign: BroadcastCampaign,
    pub recent_recipients: Vec<BroadcastRecipient>,
    pub runs: Vec<crate::archive::CampaignRun>,
    pub recent_logs: Vec<crate::archive::DeliveryLog>,
}

impl SidecarHandle {
    pub fn new(archive: Archive, account_manager: Arc<AccountManager>) -> (Self, SidecarWorker) {
        let active_campaign = Arc::new(RwLock::new(None));
        let notify_wake = Arc::new(tokio::sync::Notify::new());
        let handle = Self {
            archive: archive.clone(),
            account_manager: Arc::clone(&account_manager),
            active_campaign: Arc::clone(&active_campaign),
            notify_wake: Arc::clone(&notify_wake),
        };

        let worker = SidecarWorker {
            archive,
            account_manager,
            active_campaign,
            notify_wake,
        };

        (handle, worker)
    }

    pub fn archive(&self) -> &Archive {
        &self.archive
    }

    pub fn account_manager(&self) -> &Arc<AccountManager> {
        &self.account_manager
    }

    pub async fn create_and_schedule_campaign(
        &self,
        account_id: Option<&str>,
        name: &str,
        template_body: &str,
        attachment_path: Option<&str>,
        recipients: Vec<NewRecipient>,
        scheduled_at: Option<i64>,
        min_delay_secs: Option<u32>,
        max_delay_secs: Option<u32>,
    ) -> Result<i64> {
        let acc_id = match account_id {
            Some(id) if !id.trim().is_empty() => id.trim().to_string(),
            _ => self.account_manager.get_active_account_id().await,
        };

        // Validate account(s) exist
        if !acc_id.trim().eq_ignore_ascii_case("all") {
            for sub in acc_id.split(',') {
                let clean = sub.trim();
                if !clean.is_empty() {
                    let _ = self.account_manager.get_account(Some(clean)).await?;
                }
            }
        }
        let now = now_secs();
        let min_delay = min_delay_secs.unwrap_or(25);
        let max_delay = max_delay_secs.unwrap_or(90);

        let campaign_id = self.archive.create_campaign(
            &acc_id,
            name,
            template_body,
            attachment_path,
            min_delay,
            max_delay,
            scheduled_at,
            now,
        )?;

        self.archive.add_recipients(campaign_id, &recipients)?;

        // Initial status is draft (or scheduled if future timestamp). Never immediately run.
        info!(
            "Created broadcast campaign #{} on account '{}' with {} recipients in '{}' status",
            campaign_id,
            acc_id,
            recipients.len(),
            if scheduled_at.is_some() && scheduled_at.unwrap() > now {
                "scheduled"
            } else {
                "draft"
            }
        );
        Ok(campaign_id)
    }

    pub async fn get_campaign_status(&self, campaign_id: i64) -> Result<CampaignStatusDetails> {
        let campaign = self
            .archive
            .get_campaign(campaign_id)?
            .ok_or_else(|| anyhow!("Campaign #{} not found", campaign_id))?;

        let recent_recipients =
            self.archive
                .list_recipients_for_campaign(campaign_id, None, None, 1000, 0)?;
        let runs = self.archive.list_runs_for_campaign(campaign_id)?;
        let recent_logs = self
            .archive
            .list_logs_for_campaign(campaign_id, None, None, 300)?;

        Ok(CampaignStatusDetails {
            campaign,
            recent_recipients,
            runs,
            recent_logs,
        })
    }

    pub async fn control_campaign(&self, campaign_id: i64, action: &str) -> Result<()> {
        let now = now_secs();
        let current = self
            .archive
            .get_campaign(campaign_id)?
            .ok_or_else(|| anyhow!("Campaign #{} not found", campaign_id))?;

        match action.to_lowercase().as_str() {
            "pause" => {
                self.archive
                    .update_campaign_status(campaign_id, "paused", now)?;
                let mut active = self.active_campaign.write().await;
                if *active == Some(campaign_id) {
                    *active = None;
                }
                info!("Paused broadcast campaign #{}", campaign_id);
                self.notify_wake.notify_waiters();
            }
            "resume" | "start" => {
                if current.status == "completed" || current.status == "aborted" {
                    return Err(anyhow!(
                        "Cannot resume campaign in '{}' state",
                        current.status
                    ));
                }
                for acc in current
                    .account_id
                    .split(',')
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                {
                    let _ = self.archive.reset_account_circuit_breaker(acc);
                }
                self.archive
                    .update_campaign_status(campaign_id, "running", now)?;
                let mut active = self.active_campaign.write().await;
                *active = Some(campaign_id);
                info!("Resumed broadcast campaign #{}", campaign_id);
                self.notify_wake.notify_waiters();
            }
            "abort" | "cancel" => {
                self.archive.abort_campaign(campaign_id, now)?;
                let mut active = self.active_campaign.write().await;
                if *active == Some(campaign_id) {
                    *active = None;
                }
                info!(
                    "Aborted broadcast campaign #{} and cancelled all remaining queues",
                    campaign_id
                );
                self.notify_wake.notify_waiters();
            }
            "delete" | "remove" => {
                let mut active = self.active_campaign.write().await;
                if *active == Some(campaign_id) {
                    *active = None;
                }
                self.archive.delete_campaign(campaign_id)?;
                info!("Deleted broadcast campaign #{}", campaign_id);
                self.notify_wake.notify_waiters();
            }
            "rerun" | "restart" => {
                for acc in current
                    .account_id
                    .split(',')
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                {
                    let _ = self.archive.reset_account_circuit_breaker(acc);
                }
                let run_id = self.archive.rerun_campaign(campaign_id, now)?;
                let mut active = self.active_campaign.write().await;
                *active = Some(campaign_id);
                info!(
                    "Re-running broadcast campaign #{} (started run #{})",
                    campaign_id, run_id
                );
                self.notify_wake.notify_waiters();
            }
            "retry_failed" | "retry-failed" => {
                for acc in current
                    .account_id
                    .split(',')
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                {
                    let _ = self.archive.reset_account_circuit_breaker(acc);
                }
                let run_id = self.archive.retry_failed_recipients(campaign_id, now)?;
                let mut active = self.active_campaign.write().await;
                *active = Some(campaign_id);
                info!(
                    "Retrying failed recipients for campaign #{} (started run #{})",
                    campaign_id, run_id
                );
                self.notify_wake.notify_waiters();
            }
            "resend_aborted" | "retry_aborted" | "resend-aborted" => {
                for acc in current
                    .account_id
                    .split(',')
                    .map(|s| s.trim())
                    .filter(|s| !s.is_empty())
                {
                    let _ = self.archive.reset_account_circuit_breaker(acc);
                }
                let run_id = self.archive.retry_aborted_recipients(campaign_id, now)?;
                let mut active = self.active_campaign.write().await;
                *active = Some(campaign_id);
                info!(
                    "Resending aborted recipients for campaign #{} (started run #{})",
                    campaign_id, run_id
                );
                self.notify_wake.notify_waiters();
            }
            other => {
                return Err(anyhow!(
                    "Unknown control action: '{}' (expected: pause, resume, abort, delete, rerun)",
                    other
                ));
            }
        };
        Ok(())
    }

    pub async fn update_campaign_template(
        &self,
        campaign_id: i64,
        new_template: &str,
    ) -> Result<()> {
        let now = now_secs();
        let _ = self
            .archive
            .get_campaign(campaign_id)?
            .ok_or_else(|| anyhow!("Campaign #{} not found", campaign_id))?;

        self.archive
            .update_campaign_template(campaign_id, new_template, now)?;
        info!("Updated template for campaign #{}", campaign_id);
        Ok(())
    }

    pub async fn update_campaign_attachment(
        &self,
        campaign_id: i64,
        attachment_path: Option<&str>,
    ) -> Result<()> {
        let now = now_secs();
        self.archive
            .update_campaign_attachment(campaign_id, attachment_path, now)?;
        info!(
            "Updated attachment for campaign #{}: {:?}",
            campaign_id, attachment_path
        );
        Ok(())
    }

    pub async fn rename_campaign(&self, campaign_id: i64, new_name: &str) -> Result<()> {
        let now = now_secs();
        let _ = self
            .archive
            .get_campaign(campaign_id)?
            .ok_or_else(|| anyhow!("Campaign #{} not found", campaign_id))?;

        self.archive.rename_campaign(campaign_id, new_name, now)?;
        info!("Renamed campaign #{} to '{}'", campaign_id, new_name);
        Ok(())
    }

    pub async fn update_campaign_delay_range(
        &self,
        campaign_id: i64,
        min_delay_secs: u32,
        max_delay_secs: u32,
    ) -> Result<()> {
        let now = now_secs();
        let _ = self
            .archive
            .get_campaign(campaign_id)?
            .ok_or_else(|| anyhow!("Campaign #{} not found", campaign_id))?;

        self.archive.update_campaign_delay_range(
            campaign_id,
            min_delay_secs,
            max_delay_secs,
            now,
        )?;
        info!(
            "Updated campaign #{} anti-ban jitter delay range to {}s - {}s",
            campaign_id, min_delay_secs, max_delay_secs
        );
        Ok(())
    }

    pub async fn add_campaign_sender(&self, campaign_id: i64, account_id: &str) -> Result<String> {
        let now = now_secs();
        let current = self
            .archive
            .get_campaign(campaign_id)?
            .ok_or_else(|| anyhow!("Campaign #{} not found", campaign_id))?;

        let clean_acc = account_id.trim();
        if clean_acc.is_empty() {
            return Err(anyhow!("Account ID cannot be empty"));
        }

        let mut existing: Vec<String> = current
            .account_id
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();

        if existing.iter().any(|a| a.eq_ignore_ascii_case(clean_acc)) {
            return Ok(existing.join(", "));
        }

        existing.push(clean_acc.to_string());
        let updated_str = existing.join(", ");
        self.archive
            .update_campaign_account_id(campaign_id, &updated_str, now)?;
        info!(
            "Added sender '{}' to campaign #{}; new sender pool: {}",
            clean_acc, campaign_id, updated_str
        );
        Ok(updated_str)
    }

    pub async fn remove_campaign_sender(
        &self,
        campaign_id: i64,
        account_id: &str,
    ) -> Result<String> {
        let now = now_secs();
        let current = self
            .archive
            .get_campaign(campaign_id)?
            .ok_or_else(|| anyhow!("Campaign #{} not found", campaign_id))?;

        let clean_acc = account_id.trim();
        let mut existing: Vec<String> = if current.account_id.trim().eq_ignore_ascii_case("all") {
            let all_accs = self.account_manager.list_accounts().await;
            all_accs.into_iter().map(|a| a.account_id).collect()
        } else {
            current
                .account_id
                .split(',')
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        };

        existing.retain(|a| !a.eq_ignore_ascii_case(clean_acc));
        if existing.is_empty() {
            return Err(anyhow!(
                "Cannot remove sender '{}': Campaign #{} must have at least one sender account",
                clean_acc,
                campaign_id
            ));
        }

        let updated_str = existing.join(", ");
        self.archive
            .update_campaign_account_id(campaign_id, &updated_str, now)?;
        info!(
            "Removed sender '{}' from campaign #{}; new sender pool: {}",
            clean_acc, campaign_id, updated_str
        );
        Ok(updated_str)
    }

    pub async fn resend_recipient(&self, campaign_id: i64, recipient_id: i64) -> Result<()> {
        let now = now_secs();
        self.archive
            .requeue_recipient(campaign_id, recipient_id, now)?;
        let mut active = self.active_campaign.write().await;
        *active = Some(campaign_id);
        info!(
            "Requeued recipient #{} for campaign #{}",
            recipient_id, campaign_id
        );
        self.notify_wake.notify_waiters();
        Ok(())
    }

    pub async fn list_campaign_recipients(
        &self,
        campaign_id: i64,
        query: Option<&str>,
        status: Option<&str>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<crate::archive::BroadcastRecipient>> {
        self.archive
            .list_recipients_for_campaign(campaign_id, query, status, limit, offset)
    }

    pub async fn add_campaign_recipients(
        &self,
        campaign_id: i64,
        recipients: &[crate::archive::NewRecipient],
    ) -> Result<()> {
        let _ = self
            .archive
            .get_campaign(campaign_id)?
            .ok_or_else(|| anyhow!("Campaign #{} not found", campaign_id))?;

        self.archive.add_recipients(campaign_id, recipients)?;
        info!(
            "Added {} recipients to campaign #{}",
            recipients.len(),
            campaign_id
        );
        Ok(())
    }

    pub async fn delete_campaign_recipients(
        &self,
        campaign_id: i64,
        recipient_ids: &[i64],
    ) -> Result<usize> {
        let _ = self
            .archive
            .get_campaign(campaign_id)?
            .ok_or_else(|| anyhow!("Campaign #{} not found", campaign_id))?;

        let deleted = self.archive.delete_recipients(campaign_id, recipient_ids)?;
        info!(
            "Deleted {} recipients from campaign #{}",
            deleted, campaign_id
        );
        Ok(deleted)
    }
}

pub struct SidecarWorker {
    archive: Archive,
    account_manager: Arc<AccountManager>,
    active_campaign: Arc<RwLock<Option<i64>>>,
    notify_wake: Arc<tokio::sync::Notify>,
}

impl SidecarWorker {
    pub async fn run(self, cancel_token: tokio_util::sync::CancellationToken) {
        info!(
            "Starting Wasche background scheduler and queue worker sidecar (Parallel Multi-Worker Pipeline)"
        );
        let mut interval = tokio::time::interval(Duration::from_secs(2));
        let active_workers = Arc::new(tokio::sync::Mutex::new(std::collections::HashSet::<(
            i64,
            String,
        )>::new()));
        let mut checkpoint_counter: usize = 0;

        loop {
            tokio::select! {
                _ = interval.tick() => {},
                _ = self.notify_wake.notified() => {
                    info!("Sidecar scheduler tick triggered via control notification");
                }
                _ = cancel_token.cancelled() => {
                    info!("Sidecar scheduler received shutdown cancellation signal; exiting scheduler loop");
                    break;
                }
            }

            let now = now_secs();

            // 1. Promote scheduled campaigns that have reached their scheduled start time
            match self.archive.promote_due_scheduled_campaigns(now) {
                Ok(promoted) if !promoted.is_empty() => {
                    info!(
                        "Promoted {} scheduled campaign(s) to running",
                        promoted.len()
                    );
                    let mut active = self.active_campaign.write().await;
                    if active.is_none() {
                        *active = promoted.first().copied();
                    }
                }
                Err(e) => {
                    error!("Error promoting scheduled campaigns: {}", e);
                }
                _ => {}
            }

            // 2. Recover stale in-flight leases (> 120s) across running campaigns
            let running_campaigns = self
                .archive
                .list_campaigns(None, Some("running"))
                .unwrap_or_default();

            for campaign in &running_campaigns {
                if let Ok(stale_count) = self.archive.recover_stale_leases(campaign.id, 120, now) {
                    if stale_count > 0 {
                        warn!(
                            "Recovered {} stale in-flight lease(s) for campaign #{}",
                            stale_count, campaign.id
                        );
                        self.notify_wake.notify_waiters();
                    }
                }
            }

            // Periodic WAL maintenance
            checkpoint_counter += 1;
            if checkpoint_counter >= 30 {
                checkpoint_counter = 0;
                let _ = self.archive.wal_checkpoint();
            }

            if running_campaigns.is_empty() {
                let mut active = self.active_campaign.write().await;
                *active = None;
                continue;
            }
            // Keep active_campaign indicator updated
            {
                let mut active = self.active_campaign.write().await;
                if active.is_none() || !running_campaigns.iter().any(|c| Some(c.id) == *active) {
                    *active = running_campaigns.first().map(|c| c.id);
                }
            }

            // 3. For each running campaign, spawn parallel worker tasks for its sender accounts
            for campaign in running_campaigns {
                let mut pool_accounts: Vec<String> =
                    if campaign.account_id.trim().eq_ignore_ascii_case("all") {
                        self.account_manager
                            .list_accounts()
                            .await
                            .into_iter()
                            .map(|a| a.account_id)
                            .collect()
                    } else {
                        campaign
                            .account_id
                            .split(',')
                            .map(|s| s.trim().to_string())
                            .filter(|s| !s.is_empty())
                            .collect()
                    };
                if pool_accounts.is_empty() {
                    pool_accounts.push("default".to_string());
                }

                for acc in pool_accounts {
                    let mut workers = active_workers.lock().await;
                    let key = (campaign.id, acc.clone());
                    if !workers.contains(&key) {
                        workers.insert(key);
                        let archive_c = self.archive.clone();
                        let account_manager_c = Arc::clone(&self.account_manager);
                        let notify_wake_c = Arc::clone(&self.notify_wake);
                        let active_workers_c = Arc::clone(&active_workers);
                        let active_campaign_c = Arc::clone(&self.active_campaign);
                        let cancel_token_c = cancel_token.clone();
                        let cid = campaign.id;
                        let acc_id = acc.clone();

                        tokio::spawn(async move {
                            Self::run_account_worker(
                                archive_c,
                                account_manager_c,
                                notify_wake_c,
                                active_workers_c,
                                active_campaign_c,
                                cancel_token_c,
                                cid,
                                acc_id,
                            )
                            .await;
                        });
                    }
                }
            }
        }
    }

    async fn run_account_worker(
        archive: Archive,
        account_manager: Arc<AccountManager>,
        notify_wake: Arc<tokio::sync::Notify>,
        active_workers: Arc<tokio::sync::Mutex<std::collections::HashSet<(i64, String)>>>,
        active_campaign: Arc<RwLock<Option<i64>>>,
        cancel_token: tokio_util::sync::CancellationToken,
        campaign_id: i64,
        account_id: String,
    ) {
        info!(
            "Spawned parallel pipeline worker for account '{}' on campaign #{}",
            account_id, campaign_id
        );

        let now_init = now_secs();
        let total_count = archive
            .get_campaign(campaign_id)
            .ok()
            .flatten()
            .map(|c| c.total_count)
            .unwrap_or(0);

        let active_run = archive
            .create_or_get_active_run(campaign_id, total_count, now_init)
            .unwrap_or_else(|_| crate::archive::CampaignRun {
                id: 0,
                campaign_id,
                run_number: 1,
                status: "running".to_string(),
                total_count,
                sent_count: 0,
                failed_count: 0,
                started_at: now_init,
                completed_at: None,
            });

        loop {
            if cancel_token.is_cancelled() {
                info!(
                    "Worker for account '{}' detected cancellation signal; exiting",
                    account_id
                );
                break;
            }

            // Check campaign status: if paused, aborted, or completed, stop worker immediately
            let campaign = match archive.get_campaign(campaign_id) {
                Ok(Some(c)) if c.status == "running" => c,
                _ => break,
            };

            // Resolve WhatsApp engine for this account
            let engine = match account_manager.get_account(Some(&account_id)).await {
                Ok(e) => e,
                Err(err) => {
                    warn!(
                        "Account '{}' unavailable: {}; worker waiting 4s",
                        account_id, err
                    );
                    tokio::time::sleep(Duration::from_secs(4)).await;
                    continue;
                }
            };

            if !engine.is_connected().await {
                warn!(
                    "WhatsApp account '{}' not connected; waiting up to 10s...",
                    account_id
                );
                if let Ok(client) = engine.get_client().await {
                    let _ = client.reconnect_immediately().await;
                }
                if let Err(e) = engine.wait_until_connected(10).await {
                    warn!(
                        "Account '{}' connection failed: {}; worker waiting 5s",
                        account_id, e
                    );
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    continue;
                }
            }

            let now = now_secs();

            // Durability Check: Rolling 24h velocity cap (250 msgs/account)
            let sent_24h = archive
                .get_account_sent_count_24h(&account_id, now)
                .unwrap_or(0);
            const DAILY_VELOCITY_CAP: i64 = 250;
            if sent_24h >= DAILY_VELOCITY_CAP {
                warn!(
                    "Account '{}' reached rolling 24h velocity cap ({}/{} msgs); worker resting 60s",
                    account_id, sent_24h, DAILY_VELOCITY_CAP
                );
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(60)) => {},
                    _ = notify_wake.notified() => {},
                    _ = cancel_token.cancelled() => break,
                }
                continue;
            }

            // Durability Check: Consecutive error circuit breaker (3 strikes)
            let consecutive_errors = archive
                .get_account_consecutive_errors(&account_id)
                .unwrap_or(0);
            if consecutive_errors >= 3 {
                warn!(
                    "Account '{}' tripped circuit breaker ({} consecutive errors); quarantining for 10 mins",
                    account_id, consecutive_errors
                );
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(600)) => {
                        continue;
                    },
                    _ = notify_wake.notified() => {
                        info!("Circuit breaker quarantine for account '{}' interrupted by operator action; resuming dispatch", account_id);
                        let _ = archive.reset_account_circuit_breaker(&account_id);
                    },
                    _ = cancel_token.cancelled() => break,
                }
            }

            // Atomically claim next recipient
            let recipient_opt = match archive.claim_next_recipient(campaign_id, &account_id, now) {
                Ok(r) => r,
                Err(e) => {
                    error!(
                        "Error claiming recipient for campaign #{}: {}",
                        campaign_id, e
                    );
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }
            };

            let recipient = match recipient_opt {
                Some(r) => r,
                None => {
                    // Check if any recipients are left in the campaign
                    if let Ok(false) = archive.has_pending_recipients(campaign_id) {
                        let completion_now = now_secs();
                        let (run_sent, run_failed) = if active_run.id > 0 {
                            archive
                                .get_run(active_run.id)
                                .ok()
                                .flatten()
                                .map(|r| (r.sent_count, r.failed_count))
                                .unwrap_or((0, 0))
                        } else {
                            (0, 0)
                        };
                        let run_status = if run_sent == 0 && run_failed > 0 {
                            "failed"
                        } else {
                            "completed"
                        };

                        let camp_status = if let Ok(Some(c)) = archive.get_campaign(campaign_id) {
                            if c.sent_count == 0 && c.failed_count > 0 {
                                "failed"
                            } else {
                                "completed"
                            }
                        } else {
                            run_status
                        };

                        let _ = archive.update_campaign_status(
                            campaign_id,
                            camp_status,
                            completion_now,
                        );
                        if active_run.id > 0 {
                            let _ = archive.complete_run(active_run.id, run_status, completion_now);
                        }
                        let mut active = active_campaign.write().await;
                        if *active == Some(campaign_id) {
                            *active = None;
                        }
                        info!(
                            "Campaign #{} ('{}') finished with status '{}' (run: '{}') via parallel workers!",
                            campaign_id, campaign.name, camp_status, run_status
                        );
                        break;
                    }

                    // There are pending recipients (e.g. other worker currently typing or future retry delay)
                    tokio::select! {
                        _ = tokio::time::sleep(Duration::from_secs(2)) => {},
                        _ = notify_wake.notified() => {}
                    }
                    continue;
                }
            };

            // Render personalized text
            let rendered_text = interpolate_template(
                &campaign.template_body,
                recipient.display_name.as_deref(),
                &recipient.phone_number,
                &recipient.jid,
                recipient.custom_fields_json.as_deref(),
            );

            // Dynamic typing presence simulation
            let typing_ms = calculate_typing_duration_ms(rendered_text.len());
            let wait_secs =
                calculate_jitter_delay_secs(campaign.min_delay_secs, campaign.max_delay_secs);

            let target_jid = if recipient.jid.contains('@') {
                recipient.jid.clone()
            } else if let Some((_, j)) =
                crate::pacing::normalize_phone_number(&recipient.phone_number)
            {
                j
            } else if let Some((_, j)) = crate::pacing::normalize_phone_number(&recipient.jid) {
                j
            } else {
                let digits: String = recipient
                    .phone_number
                    .chars()
                    .filter(|c| c.is_ascii_digit())
                    .collect();
                if digits.is_empty() {
                    recipient.jid.clone()
                } else {
                    format!("{}@s.whatsapp.net", digits)
                }
            };

            info!(
                "Campaign #{}: [Account '{}'] Simulating typing for recipient {} ({}) ({} ms)",
                campaign_id,
                account_id,
                recipient.display_name.as_deref().unwrap_or(""),
                target_jid,
                typing_ms
            );

            let _ = engine.send_composing(&target_jid).await;
            tokio::time::sleep(Duration::from_millis(typing_ms)).await;
            let _ = engine.send_paused(&target_jid).await;
            // Dispatch message (media or text)
            let send_now = now_secs();
            let attachments =
                crate::archive::parse_campaign_attachments(campaign.attachment_path.as_deref());
            let send_result = if !attachments.is_empty() {
                let mut last_msg_id = String::new();
                let mut send_err = None;

                for (idx, att) in attachments.iter().enumerate() {
                    if idx > 0 {
                        tokio::time::sleep(tokio::time::Duration::from_millis(1500)).await;
                    }
                    let path = Path::new(&att.file_path);
                    if path.exists() {
                        if let Ok(data) = std::fs::read(path) {
                            let thumbnail = att
                                .thumbnail_path
                                .as_ref()
                                .and_then(|tp| std::fs::read(tp).ok());
                            let caption = if idx == 0 && !rendered_text.trim().is_empty() {
                                Some(rendered_text.as_str())
                            } else {
                                None
                            };

                            let as_document = att.send_as.as_deref() == Some("document");
                            info!(
                                "Campaign #{}: [Account '{}'] Dispatching attachment #{}/{} ('{}', {} bytes, mime: '{}') to {}",
                                campaign_id,
                                account_id,
                                idx + 1,
                                attachments.len(),
                                att.file_name,
                                data.len(),
                                att.mime_type,
                                target_jid
                            );
                            match engine
                                .send_media(
                                    &target_jid,
                                    data,
                                    &att.file_name,
                                    &att.mime_type,
                                    caption,
                                    thumbnail,
                                    as_document,
                                )
                                .await
                            {
                                Ok(msg_id) => {
                                    info!(
                                        "Campaign #{}: Attachment #{}/{} sent successfully (msg_id: {})",
                                        campaign_id,
                                        idx + 1,
                                        attachments.len(),
                                        msg_id
                                    );
                                    last_msg_id = msg_id;
                                }
                                Err(e) => {
                                    error!(
                                        "Campaign #{}: Failed to send attachment #{}/{} ('{}'): {}",
                                        campaign_id,
                                        idx + 1,
                                        attachments.len(),
                                        att.file_name,
                                        e
                                    );
                                    send_err = Some(e);
                                    break;
                                }
                            }
                        }
                    } else {
                        warn!("Attachment file does not exist on disk: {:?}", path);
                    }
                }

                if let Some(err) = send_err {
                    Err(err)
                } else if !last_msg_id.is_empty() {
                    Ok(last_msg_id)
                } else {
                    engine
                        .send_text_with_id(
                            &target_jid,
                            &rendered_text,
                            recipient.outbound_stanza_id.as_deref(),
                        )
                        .await
                }
            } else {
                engine
                    .send_text_with_id(
                        &target_jid,
                        &rendered_text,
                        recipient.outbound_stanza_id.as_deref(),
                    )
                    .await
            };

            match send_result {
                Ok(msg_id) => {
                    let _ =
                        archive.update_recipient_status(recipient.id, "sent", None, Some(send_now));
                    let log = crate::archive::DeliveryLog {
                        id: 0,
                        campaign_id,
                        run_id: if active_run.id > 0 {
                            Some(active_run.id)
                        } else {
                            None
                        },
                        recipient_id: Some(recipient.id),
                        jid: recipient.jid.clone(),
                        phone_number: recipient.phone_number.clone(),
                        display_name: recipient.display_name.clone(),
                        status: "sent".to_string(),
                        error_reason: None,
                        message_id: Some(msg_id.clone()),
                        sender_account: Some(account_id.clone()),
                        timestamp: send_now,
                    };
                    let _ = archive.record_delivery_log(&log);
                    info!(
                        "Campaign #{}: [Account '{}'] Sent message {} to {} (cooldown: {}s)",
                        campaign_id, account_id, msg_id, recipient.jid, wait_secs
                    );
                }
                Err(e) => {
                    let err_msg = e.to_string();
                    let is_transient = err_msg.contains("timeout")
                        || err_msg.contains("timed out")
                        || err_msg.contains("client is not connected")
                        || err_msg.contains("NotConnected")
                        || err_msg.contains("IQ")
                        || err_msg.contains("rate limit")
                        || err_msg.contains("overload");

                    if is_transient && recipient.retry_count < recipient.max_retries {
                        let next_retry = recipient.retry_count + 1;
                        let backoff_secs = 15 * (1 << next_retry);
                        warn!(
                            "Campaign #{}: [Account '{}'] Transient error sending to {}: '{}'. Scheduling retry #{}/{} in {}s",
                            campaign_id,
                            account_id,
                            recipient.jid,
                            err_msg,
                            next_retry,
                            recipient.max_retries,
                            backoff_secs
                        );
                        let _ = archive.record_recipient_retry(
                            recipient.id,
                            next_retry,
                            backoff_secs,
                            &err_msg,
                            send_now,
                        );
                        let log = crate::archive::DeliveryLog {
                            id: 0,
                            campaign_id,
                            run_id: if active_run.id > 0 {
                                Some(active_run.id)
                            } else {
                                None
                            },
                            recipient_id: Some(recipient.id),
                            jid: recipient.jid.clone(),
                            phone_number: recipient.phone_number.clone(),
                            display_name: recipient.display_name.clone(),
                            status: "retrying".to_string(),
                            error_reason: Some(format!(
                                "Retry #{}/{} in {}s: {}",
                                next_retry, recipient.max_retries, backoff_secs, err_msg
                            )),
                            message_id: None,
                            sender_account: Some(account_id.clone()),
                            timestamp: send_now,
                        };
                        let _ = archive.record_delivery_log(&log);
                    } else {
                        error!(
                            "Campaign #{}: [Account '{}'] Permanent failure sending to {}: {}",
                            campaign_id, account_id, recipient.jid, err_msg
                        );
                        let _ = archive.update_recipient_status(
                            recipient.id,
                            "failed",
                            Some(&err_msg),
                            Some(send_now),
                        );
                        let log = crate::archive::DeliveryLog {
                            id: 0,
                            campaign_id,
                            run_id: if active_run.id > 0 {
                                Some(active_run.id)
                            } else {
                                None
                            },
                            recipient_id: Some(recipient.id),
                            jid: recipient.jid.clone(),
                            phone_number: recipient.phone_number.clone(),
                            display_name: recipient.display_name.clone(),
                            status: "failed".to_string(),
                            error_reason: Some(err_msg.clone()),
                            message_id: None,
                            sender_account: Some(account_id.clone()),
                            timestamp: send_now,
                        };
                        let _ = archive.record_delivery_log(&log);
                    }
                }
            }

            // Cooldown sleep for this account (independent of other accounts!)
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(wait_secs)) => {},
                _ = notify_wake.notified() => {
                    info!("Worker for account '{}' cooldown sleep interrupted by control action", account_id);
                }
                _ = cancel_token.cancelled() => {
                    info!("Worker for account '{}' cooldown sleep interrupted by cancellation", account_id);
                    break;
                }
            }
        }

        let mut workers = active_workers.lock().await;
        workers.remove(&(campaign_id, account_id.clone()));
        info!(
            "Parallel worker for account '{}' on campaign #{} finished",
            account_id, campaign_id
        );
    }
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
