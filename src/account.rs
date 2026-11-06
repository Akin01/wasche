//! Multi-account manager for handling concurrent WhatsApp numbers and sessions.

use anyhow::{Context, Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{error, info, warn};

use crate::archive::Archive;
use crate::whatsapp::{ConnectionStatus, WhatsAppEngine};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AccountSummary {
    pub account_id: String,
    pub status: ConnectionStatus,
    pub phone_number: Option<String>,
    pub push_name: Option<String>,
    pub is_active: bool,
}

pub struct AccountManager {
    base_data_dir: PathBuf,
    archive: Archive,
    accounts: Arc<RwLock<HashMap<String, Arc<WhatsAppEngine>>>>,
    active_account: Arc<RwLock<String>>,
}

impl AccountManager {
    pub async fn init(base_data_dir: PathBuf, archive: Archive) -> Result<Arc<Self>> {
        let accounts_dir = base_data_dir.join("accounts");
        std::fs::create_dir_all(&accounts_dir).with_context(|| {
            format!("Failed to create accounts directory at {:?}", accounts_dir)
        })?;

        // 1. Migrate legacy root session.db into accounts/default if needed
        let legacy_session = base_data_dir.join("session.db");
        let default_account_dir = accounts_dir.join("default");
        if legacy_session.exists() && !default_account_dir.exists() {
            info!("Migrating legacy single-account session.db to accounts/default");
            std::fs::create_dir_all(&default_account_dir)?;
            let _ = std::fs::rename(&legacy_session, default_account_dir.join("session.db"));
            let legacy_wal = base_data_dir.join("session.db-wal");
            let legacy_shm = base_data_dir.join("session.db-shm");
            if legacy_wal.exists() {
                let _ = std::fs::rename(&legacy_wal, default_account_dir.join("session.db-wal"));
            }
            if legacy_shm.exists() {
                let _ = std::fs::rename(&legacy_shm, default_account_dir.join("session.db-shm"));
            }
        }

        // Always ensure 'default' directory exists
        std::fs::create_dir_all(&default_account_dir)?;

        let manager = Arc::new(Self {
            base_data_dir,
            archive: archive.clone(),
            accounts: Arc::new(RwLock::new(HashMap::new())),
            active_account: Arc::new(RwLock::new("default".to_string())),
        });

        // 2. Discover registered accounts from database
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let mut db_accounts = archive.get_managed_accounts().unwrap_or_default();

        // Initial migration only: If database has no managed_accounts, scan disk once
        if db_accounts.is_empty() {
            if let Ok(entries) = std::fs::read_dir(&accounts_dir) {
                for entry in entries.flatten() {
                    if entry.path().is_dir() {
                        if let Some(name) = entry.file_name().to_str() {
                            let name = name.trim();
                            if !name.is_empty() && entry.path().join("session.db").exists() {
                                if !db_accounts.contains(&name.to_string()) {
                                    let _ = archive.add_managed_account(name, now);
                                    db_accounts.push(name.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }

        // Purge any residual/orphaned account directories on disk not in managed_accounts
        if let Ok(entries) = std::fs::read_dir(&accounts_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    if let Some(name) = entry.file_name().to_str() {
                        let name = name.trim();
                        if !name.is_empty() && !db_accounts.contains(&name.to_string()) {
                            info!(
                                "Purging unmanaged account workspace on startup: {:?}",
                                entry.path()
                            );
                            let _ = std::fs::remove_dir_all(entry.path());
                        }
                    }
                }
            }
        }
        for acc_id in &db_accounts {
            if let Err(e) = manager.spawn_account_engine(&acc_id).await {
                error!("Failed to initialize WhatsApp account '{}': {}", acc_id, e);
            }
        }

        if let Some(first_acc) = db_accounts.first() {
            let mut active = manager.active_account.write().await;
            if !db_accounts.contains(&*active) {
                *active = first_acc.clone();
            }
        }

        Ok(manager)
    }

    async fn spawn_account_engine(&self, account_id: &str) -> Result<Arc<WhatsAppEngine>> {
        let account_dir = self.base_data_dir.join("accounts").join(account_id);
        std::fs::create_dir_all(&account_dir)?;
        let session_path = account_dir.join("session.db");

        info!(
            "Spawning WhatsApp engine for account '{}' at {:?}",
            account_id, session_path
        );
        let _ = self
            .archive
            .sync_account_contacts(account_id, &session_path);
        let (engine, event_rx) = WhatsAppEngine::new(session_path, self.archive.clone());
        let engine_clone = Arc::clone(&engine);
        let acc_name = account_id.to_string();
        tokio::spawn(async move {
            if let Err(e) = engine_clone.start(event_rx).await {
                error!("Account '{}' WhatsApp engine error: {}", acc_name, e);
            }
        });

        let mut lock = self.accounts.write().await;
        lock.insert(account_id.to_string(), Arc::clone(&engine));
        Ok(engine)
    }

    pub async fn reset_account_pairing(&self, account_id: &str) -> Result<Arc<WhatsAppEngine>> {
        let clean_id = account_id.trim();
        let mut lock = self.accounts.write().await;
        if let Some(engine) = lock.remove(clean_id) {
            engine.shutdown().await;
            drop(engine);
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;

        let account_dir = self.base_data_dir.join("accounts").join(clean_id);
        let session_path = account_dir.join("session.db");
        if session_path.exists() {
            if let Ok(conn) = rusqlite::Connection::open(&session_path) {
                let _ = conn.execute("UPDATE device SET pn = '', lid = '', push_name = ''", []);
                let _ = conn.execute("DELETE FROM sessions", []);
                let _ = conn.execute("DELETE FROM prekeys", []);
                let _ = conn.execute("DELETE FROM signed_prekeys", []);
                let _ = conn.execute("DELETE FROM sender_keys", []);
                let _ = conn.execute("DELETE FROM app_state_keys", []);
                let _ = conn.execute("DELETE FROM lid_pn_mapping", []);
            }
            let _ = std::fs::remove_file(&session_path);
            let _ = std::fs::remove_file(account_dir.join("session.db-wal"));
            let _ = std::fs::remove_file(account_dir.join("session.db-shm"));
            let _ = std::fs::remove_file(account_dir.join("qr.html"));
        }
        std::fs::create_dir_all(&account_dir)?;
        drop(lock);

        info!("Reset session and pairing store for account '{}'", clean_id);
        self.spawn_account_engine(clean_id).await
    }

    pub async fn add_account(&self, account_id: &str) -> Result<Arc<WhatsAppEngine>> {
        let clean_id = account_id.trim();
        if clean_id.is_empty() {
            return Err(anyhow!("Account ID cannot be empty"));
        }
        if !clean_id
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
        {
            return Err(anyhow!(
                "Account ID must be alphanumeric or contain '-' and '_'"
            ));
        }

        let lock = self.accounts.read().await;
        if lock.contains_key(clean_id) {
            return Err(anyhow!("Account '{}' already exists", clean_id));
        }
        drop(lock);

        let account_dir = self.base_data_dir.join("accounts").join(clean_id);
        let session_path = account_dir.join("session.db");
        if session_path.exists() {
            if let Ok(conn) = rusqlite::Connection::open(&session_path) {
                let _ = conn.execute("UPDATE device SET pn = '', lid = '', push_name = ''", []);
                let _ = conn.execute("DELETE FROM sessions", []);
                let _ = conn.execute("DELETE FROM prekeys", []);
                let _ = conn.execute("DELETE FROM signed_prekeys", []);
                let _ = conn.execute("DELETE FROM sender_keys", []);
                let _ = conn.execute("DELETE FROM app_state_keys", []);
                let _ = conn.execute("DELETE FROM lid_pn_mapping", []);
            }
            let _ = std::fs::remove_file(&session_path);
            let _ = std::fs::remove_file(account_dir.join("session.db-wal"));
            let _ = std::fs::remove_file(account_dir.join("session.db-shm"));
            let _ = std::fs::remove_file(account_dir.join("qr.html"));
        }

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let _ = self.archive.add_managed_account(clean_id, now);

        let engine = self.spawn_account_engine(clean_id).await?;
        info!("Added new WhatsApp account '{}'", clean_id);
        Ok(engine)
    }

    pub async fn remove_account(&self, account_id: &str) -> Result<()> {
        let clean_id = account_id.trim();
        let _ = self.archive.remove_managed_account(clean_id);

        let maybe_engine = {
            let mut lock = self.accounts.write().await;
            lock.remove(clean_id)
        };

        if let Some(engine) = maybe_engine {
            engine.shutdown().await;
            drop(engine);
        }

        let _ = self.archive.remove_managed_account(clean_id);

        let mut active = self.active_account.write().await;
        if *active == clean_id {
            let lock = self.accounts.read().await;
            *active = lock
                .keys()
                .next()
                .cloned()
                .unwrap_or_else(|| "default".to_string());
        }

        tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;

        let account_dir = self.base_data_dir.join("accounts").join(clean_id);
        if account_dir.exists() {
            let session_path = account_dir.join("session.db");
            if session_path.exists() {
                if let Ok(conn) = rusqlite::Connection::open(&session_path) {
                    let _ = conn.execute_batch(
                        "
                        DELETE FROM device;
                        DELETE FROM identities;
                        DELETE FROM sessions;
                        DELETE FROM prekeys;
                        DELETE FROM sender_keys;
                        DELETE FROM signed_prekeys;
                    ",
                    );
                    drop(conn);
                }
            }
            for i in 1..=6 {
                tokio::time::sleep(tokio::time::Duration::from_millis(250)).await;
                if let Err(e) = std::fs::remove_dir_all(&account_dir) {
                    if i == 6 {
                        warn!(
                            "Could not completely remove account workspace directory {:?}: {}",
                            account_dir, e
                        );
                    }
                } else {
                    info!(
                        "Successfully removed account directory workspace {:?}",
                        account_dir
                    );
                    break;
                }
            }
        }

        info!("Removed WhatsApp account '{}'", clean_id);
        Ok(())
    }

    pub async fn rename_account(&self, old_id: &str, new_id: &str) -> Result<()> {
        let old_clean = old_id.trim();
        let new_clean = new_id.trim();

        if new_clean.is_empty() {
            return Err(anyhow!("New account ID cannot be empty"));
        }
        if !new_clean
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
        {
            return Err(anyhow!(
                "Account ID must be alphanumeric or contain '-' and '_'"
            ));
        }
        if old_clean == new_clean {
            return Ok(());
        }

        let mut lock = self.accounts.write().await;
        if lock.contains_key(new_clean) {
            return Err(anyhow!("Account '{}' already exists", new_clean));
        }

        let engine = lock
            .remove(old_clean)
            .ok_or_else(|| anyhow!("Account '{}' not found", old_clean))?;

        self.archive.rename_managed_account(old_clean, new_clean)?;

        let old_dir = self.base_data_dir.join("accounts").join(old_clean);
        let new_dir = self.base_data_dir.join("accounts").join(new_clean);
        if old_dir.exists() && !new_dir.exists() {
            let _ = std::fs::rename(&old_dir, &new_dir);
        }

        lock.insert(new_clean.to_string(), engine);
        drop(lock);

        let mut active = self.active_account.write().await;
        if *active == old_clean {
            *active = new_clean.to_string();
        }

        info!(
            "Renamed WhatsApp account '{}' to '{}'",
            old_clean, new_clean
        );
        Ok(())
    }

    pub async fn set_active_account(&self, account_id: &str) -> Result<()> {
        let clean_id = account_id.trim();
        let lock = self.accounts.read().await;
        if !lock.contains_key(clean_id) {
            return Err(anyhow!(
                "Account '{}' not found. Available accounts: {:?}",
                clean_id,
                lock.keys().collect::<Vec<_>>()
            ));
        }
        drop(lock);

        let mut active = self.active_account.write().await;
        *active = clean_id.to_string();
        info!("Switched active WhatsApp account to '{}'", clean_id);
        Ok(())
    }

    pub fn base_data_dir(&self) -> &Path {
        &self.base_data_dir
    }

    pub async fn get_active_account_id(&self) -> String {
        self.active_account.read().await.clone()
    }

    pub async fn get_account(&self, account_id: Option<&str>) -> Result<Arc<WhatsAppEngine>> {
        let target_id = match account_id {
            Some(id) if !id.trim().is_empty() => id.trim().to_string(),
            _ => self.get_active_account_id().await,
        };

        let lock = self.accounts.read().await;
        match lock.get(&target_id) {
            Some(engine) => Ok(Arc::clone(engine)),
            None => Err(anyhow!(
                "Account '{}' not found. Use 'whatsapp_list_accounts' to see configured accounts or 'whatsapp_add_account' to create it.",
                target_id
            )),
        }
    }

    pub async fn list_accounts(&self) -> Vec<AccountSummary> {
        let active_id = self.get_active_account_id().await;
        // Auto-heal: Ensure all registered accounts in managed_accounts are active in memory
        let db_accs = self.archive.get_managed_accounts().unwrap_or_default();
        let mut missing = Vec::new();
        let mut deleted = Vec::new();
        {
            let lock = self.accounts.read().await;
            for acc_id in &db_accs {
                if !lock.contains_key(acc_id) {
                    missing.push(acc_id.clone());
                }
            }
            for id in lock.keys() {
                if !db_accs.contains(id) {
                    deleted.push(id.clone());
                }
            }
        }
        for acc_id in missing {
            let _ = self.spawn_account_engine(&acc_id).await;
        }
        if !deleted.is_empty() {
            let mut lock = self.accounts.write().await;
            for id in deleted {
                if let Some(engine) = lock.remove(&id) {
                    engine.shutdown().await;
                }
            }
        }

        let lock = self.accounts.read().await;

        let mut summaries = Vec::new();
        for (id, engine) in lock.iter() {
            if !db_accs.contains(id) {
                continue;
            }
            let status = engine.get_status().await;
            let (stored_phone, stored_name) = engine.read_stored_identity();
            let (phone, name) = match &status {
                ConnectionStatus::Connected {
                    phone_number,
                    push_name,
                } => (
                    phone_number.clone().or(stored_phone),
                    push_name.clone().or(stored_name),
                ),
                _ => (stored_phone, stored_name),
            };
            summaries.push(AccountSummary {
                account_id: id.clone(),
                status,
                phone_number: phone,
                push_name: name,
                is_active: *id == active_id,
            });
        }

        summaries.sort_by(|a, b| a.account_id.cmp(&b.account_id));
        summaries
    }

    pub async fn sync_account_contacts(&self, account_id: Option<&str>) -> Result<usize> {
        let target_id = match account_id {
            Some(id) if !id.trim().is_empty() && id != "all" => id.trim().to_string(),
            _ => self.get_active_account_id().await,
        };

        let engine = self.get_account(Some(&target_id)).await?;
        let count = self
            .archive
            .sync_account_contacts(&target_id, engine.session_db_path())?;
        Ok(count)
    }

    pub async fn sync_all_contacts(&self) -> Result<usize> {
        let lock = self.accounts.read().await;
        let mut total = 0;
        for (acc_id, engine) in lock.iter() {
            let count = self
                .archive
                .sync_account_contacts(acc_id, engine.session_db_path())?;
            total += count;
        }
        Ok(total)
    }

    pub async fn get_contact_avatar_url(&self, jid_str: &str) -> Result<Option<String>> {
        if let Ok(Some(cached_url)) = self.archive.get_contact_avatar(jid_str) {
            return Ok(Some(cached_url));
        }

        let active_id = self.get_active_account_id().await;
        if let Ok(engine) = self.get_account(Some(&active_id)).await {
            if let Ok(Some(url)) = engine.get_contact_avatar_url(jid_str).await {
                return Ok(Some(url));
            }
        }

        let lock = self.accounts.read().await;
        for (acc_id, engine) in lock.iter() {
            if *acc_id == active_id {
                continue;
            }
            if let Ok(Some(url)) = engine.get_contact_avatar_url(jid_str).await {
                return Ok(Some(url));
            }
        }

        Ok(None)
    }

    pub async fn shutdown_all(&self) {
        let mut lock = self.accounts.write().await;
        for (id, engine) in lock.drain() {
            info!("Gracefully shutting down WhatsApp engine for account '{}'...", id);
            engine.shutdown().await;
        }
    }
}
