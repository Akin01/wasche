//! Persistent SQLite storage for campaigns, recipient queues, and contacts.

use anyhow::{Context, Result};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Arc, Mutex};
use tracing::warn;

pub const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS broadcast_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL,
    template_body TEXT NOT NULL,
    attachment_path TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    total_count INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    min_delay_secs INTEGER NOT NULL DEFAULT 25,
    max_delay_secs INTEGER NOT NULL DEFAULT 90,
    scheduled_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS broadcast_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
    jid TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    display_name TEXT,
    custom_fields_json TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    error_reason TEXT,
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 2,
    claimed_at INTEGER,
    outbound_stanza_id TEXT,
    scheduled_at INTEGER,
    sent_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_queue 
    ON broadcast_recipients (campaign_id, status);

CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    full_name TEXT,
    first_name TEXT,
    push_name TEXT,
    phone_number TEXT,
    avatar_url TEXT,
    updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_contacts_search 
    ON contacts (full_name, phone_number);

CREATE TABLE IF NOT EXISTS managed_accounts (
    account_id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS account_contacts (
    account_id TEXT NOT NULL,
    contact_id TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (account_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_account_contacts_acc 
    ON account_contacts (account_id);
CREATE TABLE IF NOT EXISTS broadcast_campaign_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
    run_number INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'running',
    total_count INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS broadcast_delivery_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
    run_id INTEGER REFERENCES broadcast_campaign_runs(id) ON DELETE CASCADE,
    recipient_id INTEGER,
    jid TEXT NOT NULL,
    phone_number TEXT NOT NULL,
    display_name TEXT,
    status TEXT NOT NULL,
    error_reason TEXT,
    message_id TEXT,
    sender_account TEXT,
    timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_broadcast_runs_camp 
    ON broadcast_campaign_runs (campaign_id, run_number);

CREATE INDEX IF NOT EXISTS idx_delivery_logs_run 
    ON broadcast_delivery_logs (run_id);
";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct BroadcastCampaign {
    pub id: i64,
    pub account_id: String,
    pub name: String,
    pub template_body: String,
    pub attachment_path: Option<String>,
    pub status: String,
    pub total_count: i64,
    pub sent_count: i64,
    pub failed_count: i64,
    pub min_delay_secs: u32,
    pub max_delay_secs: u32,
    pub scheduled_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct BroadcastRecipient {
    pub id: i64,
    pub campaign_id: i64,
    pub jid: String,
    pub phone_number: String,
    pub display_name: Option<String>,
    pub custom_fields_json: Option<String>,
    pub status: String,
    pub error_reason: Option<String>,
    pub retry_count: u32,
    pub max_retries: u32,
    pub claimed_at: Option<i64>,
    pub outbound_stanza_id: Option<String>,
    pub scheduled_at: Option<i64>,
    pub sent_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct NewRecipient {
    pub jid: String,
    pub phone_number: String,
    pub display_name: Option<String>,
    pub custom_fields_json: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct CampaignAttachment {
    pub file_name: String,
    pub file_path: String,
    pub mime_type: String,
    pub file_size: u64,
    pub thumbnail_path: Option<String>,
    #[serde(default)]
    pub send_as: Option<String>,
}

pub fn parse_campaign_attachments(attachment_path: Option<&str>) -> Vec<CampaignAttachment> {
    let Some(raw) = attachment_path else {
        return Vec::new();
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    if trimmed.starts_with('[') {
        if let Ok(list) = serde_json::from_str::<Vec<CampaignAttachment>>(trimmed) {
            return list;
        }
    }
    let p = std::path::Path::new(trimmed);
    let file_name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("file")
        .to_string();
    let file_size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "txt" => "text/plain",
        "csv" => "text/csv",
        _ => "application/octet-stream",
    }
    .to_string();
    let thumb_p = p.with_extension("thumb.jpg");
    let thumbnail_path = if thumb_p.exists() {
        Some(thumb_p.to_string_lossy().to_string())
    } else {
        None
    };

    vec![CampaignAttachment {
        file_name,
        file_path: trimmed.to_string(),
        mime_type: mime,
        file_size,
        thumbnail_path,
        send_as: None,
    }]
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Contact {
    pub id: String,
    pub full_name: Option<String>,
    pub first_name: Option<String>,
    pub push_name: Option<String>,
    pub phone_number: Option<String>,
    pub avatar_url: Option<String>,
    pub updated_at: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct CampaignRun {
    pub id: i64,
    pub campaign_id: i64,
    pub run_number: i64,
    pub status: String,
    pub total_count: i64,
    pub sent_count: i64,
    pub failed_count: i64,
    pub started_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeliveryLog {
    pub id: i64,
    pub campaign_id: i64,
    pub run_id: Option<i64>,
    pub recipient_id: Option<i64>,
    pub jid: String,
    pub phone_number: String,
    pub display_name: Option<String>,
    pub status: String,
    pub error_reason: Option<String>,
    pub message_id: Option<String>,
    pub sender_account: Option<String>,
    pub timestamp: i64,
}

#[derive(Clone)]
pub struct Archive {
    conn: Arc<Mutex<Connection>>,
}

impl Archive {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path_ref = path.as_ref();
        if let Some(parent) = path_ref.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let connection = Connection::open(path_ref)
            .with_context(|| format!("Failed to open archive at {:?}", path_ref))?;

        connection.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA foreign_keys = ON;
             PRAGMA busy_timeout = 5000;",
        )?;

        connection.execute_batch(SCHEMA)?;

        let _ = connection.execute(
            "ALTER TABLE broadcast_campaigns ADD COLUMN account_id TEXT NOT NULL DEFAULT 'default'",
            [],
        );
        let _ = connection.execute("ALTER TABLE contacts ADD COLUMN avatar_url TEXT", []);
        let _ = connection.execute(
            "UPDATE broadcast_recipients SET status = 'queued', claimed_at = NULL WHERE status = 'typing'",
            [],
        );
        let _ = connection.execute(
            "ALTER TABLE broadcast_recipients ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0",
            [],
        );
        let _ = connection.execute(
            "ALTER TABLE broadcast_recipients ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 2",
            [],
        );
        let _ = connection.execute(
            "ALTER TABLE broadcast_recipients ADD COLUMN claimed_at INTEGER",
            [],
        );
        let _ = connection.execute(
            "ALTER TABLE broadcast_recipients ADD COLUMN outbound_stanza_id TEXT",
            [],
        );
        let _ = connection.execute(
            "ALTER TABLE broadcast_delivery_logs ADD COLUMN sender_account TEXT",
            [],
        );
        let _ = connection.execute_batch(
            "CREATE TABLE IF NOT EXISTS broadcast_campaign_runs (
                campaign_id INTEGER NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
                run_number INTEGER NOT NULL DEFAULT 1,
                status TEXT NOT NULL DEFAULT 'running',
                total_count INTEGER NOT NULL DEFAULT 0,
                sent_count INTEGER NOT NULL DEFAULT 0,
                failed_count INTEGER NOT NULL DEFAULT 0,
                started_at INTEGER NOT NULL,
                completed_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS broadcast_delivery_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                campaign_id INTEGER NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
                run_id INTEGER REFERENCES broadcast_campaign_runs(id) ON DELETE CASCADE,
                recipient_id INTEGER,
                jid TEXT NOT NULL,
                phone_number TEXT NOT NULL,
                display_name TEXT,
                status TEXT NOT NULL,
                error_reason TEXT,
                message_id TEXT,
                timestamp INTEGER NOT NULL
            );
            INSERT INTO broadcast_campaign_runs (campaign_id, run_number, status, total_count, sent_count, failed_count, started_at, completed_at)
            SELECT c.id, 1, c.status, c.total_count, c.sent_count, c.failed_count, c.created_at, c.updated_at
            FROM broadcast_campaigns c
            WHERE NOT EXISTS (SELECT 1 FROM broadcast_campaign_runs r WHERE r.campaign_id = c.id);
            UPDATE broadcast_campaigns SET 
                total_count = (SELECT COUNT(*) FROM broadcast_recipients WHERE campaign_id = broadcast_campaigns.id),
                sent_count = (SELECT COUNT(*) FROM broadcast_recipients WHERE campaign_id = broadcast_campaigns.id AND status = 'sent'),
                failed_count = (SELECT COUNT(*) FROM broadcast_recipients WHERE campaign_id = broadcast_campaigns.id AND status = 'failed');
            UPDATE broadcast_campaign_runs 
                SET status = 'aborted', completed_at = strftime('%s','now') 
                WHERE status = 'running' AND campaign_id IN (SELECT id FROM broadcast_campaigns WHERE status = 'aborted');
            UPDATE broadcast_campaign_runs 
                SET status = 'completed', completed_at = strftime('%s','now') 
                WHERE status = 'running' AND campaign_id IN (SELECT id FROM broadcast_campaigns WHERE status = 'completed');
            UPDATE broadcast_recipients 
                SET status = 'cancelled', error_reason = 'Cancelled - campaign aborted by user' 
                WHERE status IN ('queued', 'typing') AND campaign_id IN (SELECT id FROM broadcast_campaigns WHERE status = 'aborted');",
        );
        Ok(Self {
            conn: Arc::new(Mutex::new(connection)),
        })
    }

    pub fn in_memory() -> Result<Self> {
        let connection = Connection::open_in_memory()?;
        connection.execute_batch(SCHEMA)?;
        Ok(Self {
            conn: Arc::new(Mutex::new(connection)),
        })
    }

    pub fn create_campaign(
        &self,
        account_id: &str,
        name: &str,
        template_body: &str,
        attachment_path: Option<&str>,
        min_delay_secs: u32,
        max_delay_secs: u32,
        scheduled_at: Option<i64>,
        now: i64,
    ) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let initial_status = if scheduled_at.is_some() && scheduled_at.unwrap() > now {
            "scheduled"
        } else {
            "draft"
        };

        conn.execute(
            "INSERT INTO broadcast_campaigns (
                account_id, name, template_body, attachment_path, status,
                min_delay_secs, max_delay_secs, scheduled_at, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                account_id,
                name,
                template_body,
                attachment_path,
                initial_status,
                min_delay_secs,
                max_delay_secs,
                scheduled_at,
                now,
                now,
            ],
        )?;

        Ok(conn.last_insert_rowid())
    }

    pub fn add_recipients(&self, campaign_id: i64, recipients: &[NewRecipient]) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        for r in recipients {
            tx.execute(
                "INSERT INTO broadcast_recipients (
                    campaign_id, jid, phone_number, display_name, custom_fields_json, status
                ) 
                SELECT ?1, ?2, ?3, ?4, ?5, 'queued'
                WHERE NOT EXISTS (
                    SELECT 1 FROM broadcast_recipients 
                    WHERE campaign_id = ?1 
                      AND (
                        (?2 != '' AND jid = ?2) 
                        OR (?3 != '' AND phone_number = ?3)
                      )
                )",
                params![
                    campaign_id,
                    r.jid,
                    r.phone_number,
                    r.display_name,
                    r.custom_fields_json,
                ],
            )?;
        }

        let count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM broadcast_recipients WHERE campaign_id = ?1",
            params![campaign_id],
            |row| row.get(0),
        )?;

        tx.execute(
            "UPDATE broadcast_campaigns SET total_count = ?1 WHERE id = ?2",
            params![count, campaign_id],
        )?;

        tx.commit()?;
        Ok(())
    }

    pub fn get_campaign(&self, campaign_id: i64) -> Result<Option<BroadcastCampaign>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, account_id, name, template_body, attachment_path, status,
                    total_count, sent_count, failed_count, min_delay_secs,
                    max_delay_secs, scheduled_at, created_at, updated_at
             FROM broadcast_campaigns WHERE id = ?1",
        )?;

        stmt.query_row(params![campaign_id], Self::map_campaign_row)
            .optional()
            .map_err(Into::into)
    }

    pub fn list_campaigns(
        &self,
        account_id: Option<&str>,
        status_filter: Option<&str>,
    ) -> Result<Vec<BroadcastCampaign>> {
        let conn = self.conn.lock().unwrap();
        let mut sql = "SELECT id, account_id, name, template_body, attachment_path, status,
                              total_count, sent_count, failed_count, min_delay_secs,
                              max_delay_secs, scheduled_at, created_at, updated_at
                       FROM broadcast_campaigns WHERE 1=1"
            .to_string();

        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        if let Some(acc) = account_id {
            sql.push_str(" AND account_id = ?");
            params_vec.push(Box::new(acc.to_string()));
        }
        if let Some(status) = status_filter {
            sql.push_str(" AND status = ?");
            params_vec.push(Box::new(status.to_string()));
        }
        sql.push_str(" ORDER BY id DESC");

        let mut stmt = conn.prepare(&sql)?;
        let params_refs: Vec<&dyn rusqlite::ToSql> =
            params_vec.iter().map(|p| p.as_ref()).collect();
        let rows = stmt.query_map(params_refs.as_slice(), Self::map_campaign_row)?;

        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    fn map_campaign_row(row: &rusqlite::Row) -> rusqlite::Result<BroadcastCampaign> {
        Ok(BroadcastCampaign {
            id: row.get(0)?,
            account_id: row.get(1)?,
            name: row.get(2)?,
            template_body: row.get(3)?,
            attachment_path: row.get(4)?,
            status: row.get(5)?,
            total_count: row.get(6)?,
            sent_count: row.get(7)?,
            failed_count: row.get(8)?,
            min_delay_secs: row.get(9)?,
            max_delay_secs: row.get(10)?,
            scheduled_at: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
        })
    }

    pub fn update_campaign_status(&self, campaign_id: i64, status: &str, now: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE broadcast_campaigns SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, now, campaign_id],
        )?;
        Ok(())
    }

    pub fn abort_campaign(&self, campaign_id: i64, now: i64) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        // 1. Update campaign status to aborted
        tx.execute(
            "UPDATE broadcast_campaigns SET status = 'aborted', updated_at = ?1 WHERE id = ?2",
            params![now, campaign_id],
        )?;

        // 2. Mark any active running or paused run as aborted with completed timestamp
        tx.execute(
            "UPDATE broadcast_campaign_runs 
             SET status = 'aborted', completed_at = ?1 
             WHERE campaign_id = ?2 AND status IN ('running', 'paused')",
            params![now, campaign_id],
        )?;

        // 3. Cancel all remaining queued or typing recipients in the queue
        tx.execute(
            "UPDATE broadcast_recipients 
             SET status = 'cancelled', error_reason = 'Cancelled - campaign aborted by user' 
             WHERE campaign_id = ?1 AND status IN ('queued', 'typing')",
            params![campaign_id],
        )?;

        tx.commit()?;
        Ok(())
    }

    pub fn rerun_campaign(&self, campaign_id: i64, now: i64) -> Result<i64> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        // Complete any active run
        let _ = tx.execute(
            "UPDATE broadcast_campaign_runs SET status = 'completed', completed_at = ?1 WHERE campaign_id = ?2 AND status = 'running'",
            params![now, campaign_id],
        );

        let total_count: i64 = tx
            .query_row(
                "SELECT total_count FROM broadcast_campaigns WHERE id = ?1",
                params![campaign_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let next_run: i64 = tx.query_row(
            "SELECT COALESCE(MAX(run_number), 0) + 1 FROM broadcast_campaign_runs WHERE campaign_id = ?1",
            params![campaign_id],
            |row| row.get(0),
        ).unwrap_or(1);

        tx.execute(
            "INSERT INTO broadcast_campaign_runs (
                campaign_id, run_number, status, total_count, sent_count, failed_count, started_at
            ) VALUES (?1, ?2, 'running', ?3, 0, 0, ?4)",
            params![campaign_id, next_run, total_count, now],
        )?;
        let run_id = tx.last_insert_rowid();

        tx.execute(
            "UPDATE broadcast_campaigns 
             SET status = 'running', sent_count = 0, failed_count = 0, updated_at = ?1 
             WHERE id = ?2",
            params![now, campaign_id],
        )?;

        tx.execute(
            "UPDATE broadcast_recipients 
             SET status = 'queued', error_reason = NULL, sent_at = NULL, outbound_stanza_id = NULL 
             WHERE campaign_id = ?1",
            params![campaign_id],
        )?;

        tx.commit()?;
        Ok(run_id)
    }

    pub fn create_or_get_active_run(
        &self,
        campaign_id: i64,
        total_count: i64,
        now: i64,
    ) -> Result<CampaignRun> {
        let conn = self.conn.lock().unwrap();
        let draft_or_running = conn.query_row(
            "SELECT id, campaign_id, run_number, status, total_count, sent_count, failed_count, started_at, completed_at
             FROM broadcast_campaign_runs
             WHERE campaign_id = ?1 AND status IN ('running', 'draft', 'paused')
             ORDER BY id DESC LIMIT 1",
            params![campaign_id],
            Self::map_run_row,
        ).optional()?;

        if let Some(mut run) = draft_or_running {
            if run.status == "draft" || run.status == "paused" {
                conn.execute(
                    "UPDATE broadcast_campaign_runs SET status = 'running', total_count = ?1, started_at = ?2 WHERE id = ?3",
                    params![total_count, now, run.id],
                )?;
                run.status = "running".to_string();
                run.total_count = total_count;
                run.started_at = now;
            }
            return Ok(run);
        }

        let next_run: i64 = conn.query_row(
            "SELECT COALESCE(MAX(run_number), 0) + 1 FROM broadcast_campaign_runs WHERE campaign_id = ?1",
            params![campaign_id],
            |row| row.get(0),
        ).unwrap_or(1);

        conn.execute(
            "INSERT INTO broadcast_campaign_runs (
                campaign_id, run_number, status, total_count, sent_count, failed_count, started_at
            ) VALUES (?1, ?2, 'running', ?3, 0, 0, ?4)",
            params![campaign_id, next_run, total_count, now],
        )?;

        let id = conn.last_insert_rowid();
        Ok(CampaignRun {
            id,
            campaign_id,
            run_number: next_run,
            status: "running".to_string(),
            total_count,
            sent_count: 0,
            failed_count: 0,
            started_at: now,
            completed_at: None,
        })
    }

    pub fn record_delivery_log(&self, log: &DeliveryLog) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        tx.execute(
            "INSERT INTO broadcast_delivery_logs (
                campaign_id, run_id, recipient_id, jid, phone_number, display_name, status, error_reason, message_id, sender_account, timestamp
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                log.campaign_id,
                log.run_id,
                log.recipient_id,
                log.jid,
                log.phone_number,
                log.display_name,
                log.status,
                log.error_reason,
                log.message_id,
                log.sender_account,
                log.timestamp
            ],
        )?;

        if let Some(rid) = log.run_id {
            if log.status == "sent" {
                let _ = tx.execute(
                    "UPDATE broadcast_campaign_runs SET sent_count = sent_count + 1 WHERE id = ?1",
                    params![rid],
                );
            } else if log.status == "failed" {
                let _ = tx.execute(
                    "UPDATE broadcast_campaign_runs SET failed_count = failed_count + 1 WHERE id = ?1",
                    params![rid],
                );
            }
        }

        tx.commit()?;
        Ok(())
    }

    pub fn complete_run(&self, run_id: i64, status: &str, now: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE broadcast_campaign_runs SET status = ?1, completed_at = ?2 WHERE id = ?3",
            params![status, now, run_id],
        )?;
        Ok(())
    }

    pub fn list_runs_for_campaign(&self, campaign_id: i64) -> Result<Vec<CampaignRun>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, campaign_id, run_number, status, total_count, sent_count, failed_count, started_at, completed_at
             FROM broadcast_campaign_runs
             WHERE campaign_id = ?1
             ORDER BY run_number DESC",
        )?;
        let rows = stmt.query_map(params![campaign_id], Self::map_run_row)?;
        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    fn map_run_row(row: &rusqlite::Row) -> rusqlite::Result<CampaignRun> {
        Ok(CampaignRun {
            id: row.get(0)?,
            campaign_id: row.get(1)?,
            run_number: row.get(2)?,
            status: row.get(3)?,
            total_count: row.get(4)?,
            sent_count: row.get(5)?,
            failed_count: row.get(6)?,
            started_at: row.get(7)?,
            completed_at: row.get(8)?,
        })
    }

    pub fn list_logs_for_run(&self, run_id: i64, limit: usize) -> Result<Vec<DeliveryLog>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, campaign_id, run_id, recipient_id, jid, phone_number, display_name, status, error_reason, message_id, sender_account, timestamp
             FROM broadcast_delivery_logs
             WHERE run_id = ?1
             ORDER BY timestamp DESC, id DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![run_id, limit as i64], Self::map_delivery_log_row)?;
        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    pub fn list_logs_for_campaign(
        &self,
        campaign_id: i64,
        limit: usize,
    ) -> Result<Vec<DeliveryLog>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, campaign_id, run_id, recipient_id, jid, phone_number, display_name, status, error_reason, message_id, sender_account, timestamp
             FROM broadcast_delivery_logs
             WHERE campaign_id = ?1
             ORDER BY timestamp DESC, id DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(
            params![campaign_id, limit as i64],
            Self::map_delivery_log_row,
        )?;
        let mut result = Vec::new();
        for r in rows {
            result.push(r?);
        }
        Ok(result)
    }

    fn map_delivery_log_row(row: &rusqlite::Row) -> rusqlite::Result<DeliveryLog> {
        Ok(DeliveryLog {
            id: row.get(0)?,
            campaign_id: row.get(1)?,
            run_id: row.get(2)?,
            recipient_id: row.get(3)?,
            jid: row.get(4)?,
            phone_number: row.get(5)?,
            display_name: row.get(6)?,
            status: row.get(7)?,
            error_reason: row.get(8)?,
            message_id: row.get(9)?,
            sender_account: row.get(10)?,
            timestamp: row.get(11)?,
        })
    }

    pub fn update_campaign_template(
        &self,
        campaign_id: i64,
        template_body: &str,
        now: i64,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE broadcast_campaigns SET template_body = ?1, updated_at = ?2 WHERE id = ?3",
            params![template_body, now, campaign_id],
        )?;
        Ok(())
    }

    pub fn update_campaign_attachment(
        &self,
        campaign_id: i64,
        attachment_path: Option<&str>,
        now: i64,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE broadcast_campaigns SET attachment_path = ?1, updated_at = ?2 WHERE id = ?3",
            params![attachment_path, now, campaign_id],
        )?;
        Ok(())
    }

    pub fn rename_campaign(&self, campaign_id: i64, new_name: &str, now: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE broadcast_campaigns SET name = ?1, updated_at = ?2 WHERE id = ?3",
            params![new_name, now, campaign_id],
        )?;
        Ok(())
    }

    pub fn delete_recipients(&self, campaign_id: i64, recipient_ids: &[i64]) -> Result<usize> {
        if recipient_ids.is_empty() {
            return Ok(0);
        }
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let mut deleted = 0;
        for id in recipient_ids {
            deleted += tx.execute(
                "DELETE FROM broadcast_recipients WHERE id = ?1 AND campaign_id = ?2",
                params![id, campaign_id],
            )?;
        }
        let total_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM broadcast_recipients WHERE campaign_id = ?1",
            params![campaign_id],
            |row| row.get(0),
        )?;
        let sent_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM broadcast_recipients WHERE campaign_id = ?1 AND status = 'sent'",
            params![campaign_id],
            |row| row.get(0),
        )?;
        let failed_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM broadcast_recipients WHERE campaign_id = ?1 AND status = 'failed'",
            params![campaign_id],
            |row| row.get(0),
        )?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        tx.execute(
            "UPDATE broadcast_campaigns SET total_count = ?1, sent_count = ?2, failed_count = ?3, updated_at = ?4 WHERE id = ?5",
            params![total_count, sent_count, failed_count, now, campaign_id],
        )?;
        tx.commit()?;
        Ok(deleted)
    }

    pub fn delete_campaign(&self, campaign_id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM broadcast_campaigns WHERE id = ?1",
            params![campaign_id],
        )?;
        Ok(())
    }

    pub fn next_runnable_recipient(
        &self,
        campaign_id: i64,
        now: i64,
    ) -> Result<Option<BroadcastRecipient>> {
        let conn = self.conn.lock().unwrap();

        let mut stmt = conn.prepare(
            "SELECT id, campaign_id, jid, phone_number, display_name,
                    custom_fields_json, status, error_reason, retry_count, max_retries,
                    claimed_at, outbound_stanza_id, scheduled_at, sent_at
             FROM broadcast_recipients
             WHERE campaign_id = ?1 AND status = 'queued' AND (scheduled_at IS NULL OR scheduled_at <= ?2)
             ORDER BY id ASC LIMIT 1",
        )?;

        stmt.query_row(params![campaign_id, now], |row| {
            Ok(BroadcastRecipient {
                id: row.get(0)?,
                campaign_id: row.get(1)?,
                jid: row.get(2)?,
                phone_number: row.get(3)?,
                display_name: row.get(4)?,
                custom_fields_json: row.get(5)?,
                status: row.get(6)?,
                error_reason: row.get(7)?,
                retry_count: row.get(8)?,
                max_retries: row.get(9)?,
                claimed_at: row.get(10)?,
                outbound_stanza_id: row.get(11)?,
                scheduled_at: row.get(12)?,
                sent_at: row.get(13)?,
            })
        })
        .optional()
        .map_err(Into::into)
    }

    pub fn claim_next_recipient(
        &self,
        campaign_id: i64,
        now: i64,
    ) -> Result<Option<BroadcastRecipient>> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        let mut recipient_opt = {
            let mut stmt = tx.prepare(
                "SELECT id, campaign_id, jid, phone_number, display_name,
                        custom_fields_json, status, error_reason, retry_count, max_retries,
                        claimed_at, outbound_stanza_id, scheduled_at, sent_at
                 FROM broadcast_recipients
                 WHERE campaign_id = ?1 AND status = 'queued' AND (scheduled_at IS NULL OR scheduled_at <= ?2)
                 ORDER BY id ASC LIMIT 1",
            )?;

            stmt.query_row(params![campaign_id, now], |row| {
                Ok(BroadcastRecipient {
                    id: row.get(0)?,
                    campaign_id: row.get(1)?,
                    jid: row.get(2)?,
                    phone_number: row.get(3)?,
                    display_name: row.get(4)?,
                    custom_fields_json: row.get(5)?,
                    status: row.get(6)?,
                    error_reason: row.get(7)?,
                    retry_count: row.get(8)?,
                    max_retries: row.get(9)?,
                    claimed_at: row.get(10)?,
                    outbound_stanza_id: row.get(11)?,
                    scheduled_at: row.get(12)?,
                    sent_at: row.get(13)?,
                })
            })
            .optional()?
        };

        if let Some(ref mut r) = recipient_opt {
            let stanza_id = r.outbound_stanza_id.clone().unwrap_or_else(|| {
                let rnd: u64 = rand::random();
                format!("3EB0{:018X}", rnd)
            });

            tx.execute(
                "UPDATE broadcast_recipients 
                 SET status = 'typing', claimed_at = ?1, outbound_stanza_id = ?2 
                 WHERE id = ?3",
                params![now, stanza_id, r.id],
            )?;

            r.status = "typing".to_string();
            r.claimed_at = Some(now);
            r.outbound_stanza_id = Some(stanza_id);
        }

        tx.commit()?;
        Ok(recipient_opt)
    }

    pub fn recover_stale_leases(
        &self,
        campaign_id: i64,
        timeout_secs: i64,
        now: i64,
    ) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let affected = conn.execute(
            "UPDATE broadcast_recipients 
             SET status = 'queued', 
                 error_reason = 'Worker lease expired; auto-requeued', 
                 claimed_at = NULL 
             WHERE campaign_id = ?1 
               AND status = 'typing' 
               AND (?2 - claimed_at > ?3)",
            params![campaign_id, now, timeout_secs],
        )?;
        Ok(affected)
    }

    pub fn get_account_sent_count_24h(&self, account_id: &str, now: i64) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT count(*) 
             FROM broadcast_delivery_logs 
             WHERE sender_account = ?1 AND status = 'sent' AND timestamp > (?2 - 86400)",
            params![account_id, now],
            |row| row.get(0),
        )?;
        Ok(count)
    }

    pub fn get_account_consecutive_errors(&self, account_id: &str) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT status 
             FROM broadcast_delivery_logs 
             WHERE sender_account = ?1 
             ORDER BY timestamp DESC, id DESC 
             LIMIT 5",
        )?;
        let rows = stmt.query_map(params![account_id], |row| row.get::<_, String>(0))?;
        let mut consecutive_fails = 0;
        for r in rows {
            if r.as_deref() == Ok("failed") {
                consecutive_fails += 1;
            } else {
                break;
            }
        }
        Ok(consecutive_fails)
    }
    pub fn reset_account_circuit_breaker(&self, account_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let _ = conn.execute(
            "UPDATE broadcast_delivery_logs SET status = 'failed_acknowledged' WHERE sender_account = ?1 AND status = 'failed'",
            params![account_id],
        );
        Ok(())
    }

    pub fn wal_checkpoint(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let _ = conn.execute_batch("PRAGMA wal_checkpoint(PASSIVE);")?;
        Ok(())
    }

    pub fn vacuum_into(&self, backup_path: &Path) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let path_str = backup_path.to_string_lossy();
        conn.execute("VACUUM INTO ?1", params![path_str])?;
        Ok(())
    }
    pub fn record_recipient_retry(
        &self,
        recipient_id: i64,
        next_retry_count: u32,
        delay_secs: u64,
        error_reason: &str,
        now: i64,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let scheduled_at = now + delay_secs as i64;
        conn.execute(
            "UPDATE broadcast_recipients 
             SET status = 'queued', retry_count = ?1, scheduled_at = ?2, error_reason = ?3 
             WHERE id = ?4",
            params![next_retry_count, scheduled_at, error_reason, recipient_id],
        )?;
        Ok(())
    }

    pub fn retry_failed_recipients(&self, campaign_id: i64, now: i64) -> Result<i64> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        let failed_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM broadcast_recipients WHERE campaign_id = ?1 AND status = 'failed'",
            params![campaign_id],
            |row| row.get(0),
        ).unwrap_or(0);

        if failed_count == 0 {
            return Err(anyhow::anyhow!(
                "No failed recipients to retry for campaign #{}",
                campaign_id
            ));
        }

        let _ = tx.execute(
            "UPDATE broadcast_campaign_runs SET status = 'completed', completed_at = ?1 WHERE campaign_id = ?2 AND status = 'running'",
            params![now, campaign_id],
        );

        let next_run: i64 = tx.query_row(
            "SELECT COALESCE(MAX(run_number), 0) + 1 FROM broadcast_campaign_runs WHERE campaign_id = ?1",
            params![campaign_id],
            |row| row.get(0),
        ).unwrap_or(1);

        tx.execute(
            "INSERT INTO broadcast_campaign_runs (
                campaign_id, run_number, status, total_count, sent_count, failed_count, started_at
            ) VALUES (?1, ?2, 'running', ?3, 0, 0, ?4)",
            params![campaign_id, next_run, failed_count, now],
        )?;
        let run_id = tx.last_insert_rowid();

        tx.execute(
            "UPDATE broadcast_campaigns 
             SET status = 'running', failed_count = failed_count - ?1, updated_at = ?2 
             WHERE id = ?3",
            params![failed_count, now, campaign_id],
        )?;

        tx.execute(
            "UPDATE broadcast_recipients 
             SET status = 'queued', error_reason = NULL, retry_count = 0, scheduled_at = NULL, sent_at = NULL, outbound_stanza_id = NULL 
             WHERE campaign_id = ?1 AND status = 'failed'",
            params![campaign_id],
        )?;

        tx.commit()?;
        Ok(run_id)
    }

    pub fn retry_aborted_recipients(&self, campaign_id: i64, now: i64) -> Result<i64> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        let aborted_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM broadcast_recipients WHERE campaign_id = ?1 AND status IN ('cancelled', 'aborted')",
            params![campaign_id],
            |row| row.get(0),
        ).unwrap_or(0);

        if aborted_count == 0 {
            return Err(anyhow::anyhow!(
                "No aborted/cancelled recipients to resend for campaign #{}",
                campaign_id
            ));
        }

        let _ = tx.execute(
            "UPDATE broadcast_campaign_runs SET status = 'aborted', completed_at = ?1 WHERE campaign_id = ?2 AND status IN ('running', 'paused')",
            params![now, campaign_id],
        );

        let next_run: i64 = tx.query_row(
            "SELECT COALESCE(MAX(run_number), 0) + 1 FROM broadcast_campaign_runs WHERE campaign_id = ?1",
            params![campaign_id],
            |row| row.get(0),
        ).unwrap_or(1);

        tx.execute(
            "INSERT INTO broadcast_campaign_runs (
                campaign_id, run_number, status, total_count, sent_count, failed_count, started_at
            ) VALUES (?1, ?2, 'running', ?3, 0, 0, ?4)",
            params![campaign_id, next_run, aborted_count, now],
        )?;
        let run_id = tx.last_insert_rowid();

        tx.execute(
            "UPDATE broadcast_campaigns 
             SET status = 'running', updated_at = ?1 
             WHERE id = ?2",
            params![now, campaign_id],
        )?;

        tx.execute(
            "UPDATE broadcast_recipients 
             SET status = 'queued', error_reason = NULL, retry_count = 0, scheduled_at = NULL, sent_at = NULL, outbound_stanza_id = NULL 
             WHERE campaign_id = ?1 AND status IN ('cancelled', 'aborted')",
            params![campaign_id],
        )?;

        tx.commit()?;
        Ok(run_id)
    }

    pub fn requeue_recipient(&self, campaign_id: i64, recipient_id: i64, now: i64) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        tx.execute(
            "UPDATE broadcast_recipients 
             SET status = 'queued', error_reason = NULL, retry_count = 0, scheduled_at = NULL, sent_at = NULL, outbound_stanza_id = NULL 
             WHERE id = ?1 AND campaign_id = ?2",
            params![recipient_id, campaign_id],
        )?;

        tx.execute(
            "UPDATE broadcast_campaigns SET status = 'running', updated_at = ?1 WHERE id = ?2",
            params![now, campaign_id],
        )?;

        let has_active_run: bool = tx.query_row(
            "SELECT COUNT(*) > 0 FROM broadcast_campaign_runs WHERE campaign_id = ?1 AND status = 'running'",
            params![campaign_id],
            |row| row.get(0),
        ).unwrap_or(false);

        if !has_active_run {
            let next_run: i64 = tx.query_row(
                "SELECT COALESCE(MAX(run_number), 0) + 1 FROM broadcast_campaign_runs WHERE campaign_id = ?1",
                params![campaign_id],
                |row| row.get(0),
            ).unwrap_or(1);

            tx.execute(
                "INSERT INTO broadcast_campaign_runs (
                    campaign_id, run_number, status, total_count, sent_count, failed_count, started_at
                ) VALUES (?1, ?2, 'running', 1, 0, 0, ?3)",
                params![campaign_id, next_run, now],
            )?;
        }

        tx.commit()?;
        Ok(())
    }
    pub fn has_pending_recipients(&self, campaign_id: i64) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM broadcast_recipients WHERE campaign_id = ?1 AND status IN ('queued', 'typing')",
            params![campaign_id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn update_recipient_status(
        &self,
        recipient_id: i64,
        status: &str,
        error_reason: Option<&str>,
        sent_at: Option<i64>,
    ) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        tx.execute(
            "UPDATE broadcast_recipients 
             SET status = ?1, error_reason = ?2, sent_at = ?3 
             WHERE id = ?4",
            params![status, error_reason, sent_at, recipient_id],
        )?;

        let campaign_id: i64 = tx.query_row(
            "SELECT campaign_id FROM broadcast_recipients WHERE id = ?1",
            params![recipient_id],
            |row| row.get(0),
        )?;

        let sent_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM broadcast_recipients WHERE campaign_id = ?1 AND status = 'sent'",
            params![campaign_id],
            |row| row.get(0),
        ).unwrap_or(0);

        let failed_count: i64 = tx.query_row(
            "SELECT COUNT(*) FROM broadcast_recipients WHERE campaign_id = ?1 AND status = 'failed'",
            params![campaign_id],
            |row| row.get(0),
        ).unwrap_or(0);

        let total_count: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM broadcast_recipients WHERE campaign_id = ?1",
                params![campaign_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        let update_time = sent_at.unwrap_or_else(|| {
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64
        });

        tx.execute(
            "UPDATE broadcast_campaigns 
             SET total_count = ?1, sent_count = ?2, failed_count = ?3, updated_at = ?4 
             WHERE id = ?5",
            params![
                total_count,
                sent_count,
                failed_count,
                update_time,
                campaign_id
            ],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn promote_due_scheduled_campaigns(&self, now: i64) -> Result<Vec<i64>> {
        let mut conn = self.conn.lock().unwrap();
        let ids: Vec<i64> = {
            let mut stmt = conn.prepare(
                "SELECT id FROM broadcast_campaigns 
                 WHERE status = 'scheduled' AND scheduled_at IS NOT NULL AND scheduled_at <= ?1",
            )?;
            stmt.query_map(params![now], |row| row.get(0))?
                .collect::<rusqlite::Result<Vec<_>>>()?
        };

        if ids.is_empty() {
            return Ok(ids);
        }

        let tx = conn.transaction()?;
        for id in &ids {
            tx.execute(
                "UPDATE broadcast_campaigns SET status = 'running', updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )?;
        }
        tx.commit()?;
        Ok(ids)
    }

    pub fn list_recipients_for_campaign(
        &self,
        campaign_id: i64,
        limit: usize,
    ) -> Result<Vec<BroadcastRecipient>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, campaign_id, jid, phone_number, display_name,
                    custom_fields_json, status, error_reason, retry_count, max_retries,
                    claimed_at, outbound_stanza_id, scheduled_at, sent_at
             FROM broadcast_recipients
             WHERE campaign_id = ?1
             ORDER BY id ASC LIMIT ?2",
        )?;

        let rows = stmt.query_map(params![campaign_id, limit as i64], |row| {
            Ok(BroadcastRecipient {
                id: row.get(0)?,
                campaign_id: row.get(1)?,
                jid: row.get(2)?,
                phone_number: row.get(3)?,
                display_name: row.get(4)?,
                custom_fields_json: row.get(5)?,
                status: row.get(6)?,
                error_reason: row.get(7)?,
                retry_count: row.get(8)?,
                max_retries: row.get(9)?,
                claimed_at: row.get(10)?,
                outbound_stanza_id: row.get(11)?,
                scheduled_at: row.get(12)?,
                sent_at: row.get(13)?,
            })
        })?;

        let mut recipients = Vec::new();
        for r in rows {
            recipients.push(r?);
        }
        Ok(recipients)
    }

    pub fn upsert_contact(&self, contact: &Contact) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO contacts (id, full_name, first_name, push_name, phone_number, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET
                full_name = coalesce(excluded.full_name, full_name),
                first_name = coalesce(excluded.first_name, first_name),
                push_name = coalesce(excluded.push_name, push_name),
                phone_number = coalesce(excluded.phone_number, phone_number),
                updated_at = excluded.updated_at",
            params![
                contact.id,
                contact.full_name,
                contact.first_name,
                contact.push_name,
                contact.phone_number,
                contact.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_contact(&self, id_or_phone: &str) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let target = id_or_phone.trim();
        let rows = conn.execute(
            "DELETE FROM contacts WHERE id = ?1 OR phone_number = ?1",
            params![target],
        )?;
        Ok(rows)
    }

    pub fn get_managed_accounts(&self) -> Result<Vec<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt =
            conn.prepare("SELECT account_id FROM managed_accounts ORDER BY created_at ASC")?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        let mut accounts = Vec::new();
        for r in rows {
            accounts.push(r?);
        }
        Ok(accounts)
    }

    pub fn add_managed_account(&self, account_id: &str, now: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO managed_accounts (account_id, created_at) VALUES (?1, ?2)",
            params![account_id, now],
        )?;
        Ok(())
    }

    pub fn remove_managed_account(&self, account_id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "DELETE FROM managed_accounts WHERE account_id = ?1",
            params![account_id],
        )?;
        let _ = conn.execute(
            "DELETE FROM account_contacts WHERE account_id = ?1",
            params![account_id],
        );
        Ok(())
    }

    pub fn rename_managed_account(&self, old_id: &str, new_id: &str) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;

        tx.execute(
            "UPDATE managed_accounts SET account_id = ?1 WHERE account_id = ?2",
            params![new_id, old_id],
        )?;

        tx.execute(
            "UPDATE broadcast_campaigns SET account_id = ?1 WHERE account_id = ?2",
            params![new_id, old_id],
        )?;

        tx.execute(
            "UPDATE account_contacts SET account_id = ?1 WHERE account_id = ?2",
            params![new_id, old_id],
        )?;

        tx.commit()?;
        Ok(())
    }

    pub fn sync_account_contacts(&self, account_id: &str, session_db_path: &Path) -> Result<usize> {
        if !session_db_path.exists() {
            return Ok(0);
        }
        let uri = format!(
            "file:{}?mode=ro&immutable=1",
            session_db_path.to_string_lossy().replace('\\', "/")
        );
        let src_conn = match rusqlite::Connection::open_with_flags(
            &uri,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
        ) {
            Ok(c) => c,
            Err(e) => {
                warn!("Could not open session db at {:?}: {}", session_db_path, e);
                return Ok(0);
            }
        };

        let mut stmt = match src_conn
            .prepare("SELECT DISTINCT phone_number FROM lid_pn_mapping WHERE phone_number != ''")
        {
            Ok(s) => s,
            Err(_) => return Ok(0),
        };
        let pns = match stmt.query_map([], |row| row.get::<_, String>(0)) {
            Ok(rows) => rows.filter_map(std::result::Result::ok).collect::<Vec<_>>(),
            Err(_) => return Ok(0),
        };

        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;

        let mut inserted = 0;
        {
            let mut stmt_contacts = tx.prepare_cached(
                "INSERT OR IGNORE INTO contacts (id, phone_number, full_name, first_name, push_name, updated_at) VALUES (?1, ?2, ?2, ?2, NULL, ?3)"
            )?;
            let mut stmt_acc = tx.prepare_cached(
                "INSERT OR IGNORE INTO account_contacts (account_id, contact_id, phone_number) VALUES (?1, ?2, ?3)"
            )?;

            for pn in pns {
                let jid = format!("{}@s.whatsapp.net", pn);
                let formatted_phone = if pn.starts_with('+') {
                    pn
                } else {
                    format!("+{}", pn)
                };
                let _ = stmt_contacts.execute(params![jid, formatted_phone, now]);
                inserted += stmt_acc.execute(params![account_id, jid, formatted_phone])?;
            }
        }
        tx.commit()?;
        Ok(inserted)
    }

    pub fn sync_from_session_db(&self, session_db_path: &Path) -> Result<usize> {
        self.sync_account_contacts("default", session_db_path)
    }

    pub fn list_contacts(
        &self,
        account_id: Option<&str>,
        query: Option<&str>,
        limit: usize,
        offset: usize,
    ) -> Result<Vec<Contact>> {
        let conn = self.conn.lock().unwrap();
        let q_clean = query.map(|s| s.trim()).filter(|s| !s.is_empty());
        let acc_clean = account_id
            .map(|s| s.trim())
            .filter(|s| !s.is_empty() && *s != "all");

        match (acc_clean, q_clean) {
            (Some(acc), Some(q)) => {
                let like = format!("%{}%", q);
                let mut stmt = conn.prepare(
                    "SELECT c.id, c.full_name, c.first_name, c.push_name, c.phone_number, c.avatar_url, c.updated_at
                     FROM contacts c
                     JOIN account_contacts ac ON c.id = ac.contact_id
                     WHERE ac.account_id = ?1 AND (c.full_name LIKE ?2 OR c.push_name LIKE ?2 OR c.first_name LIKE ?2 OR c.phone_number LIKE ?2 OR c.id LIKE ?2)
                     ORDER BY c.updated_at DESC LIMIT ?3 OFFSET ?4",
                )?;
                let items: Vec<Contact> = stmt
                    .query_map(
                        params![acc, like, limit as i64, offset as i64],
                        Self::map_contact_row,
                    )?
                    .collect::<rusqlite::Result<Vec<_>>>()?;
                Ok(items)
            }
            (Some(acc), None) => {
                let mut stmt = conn.prepare(
                    "SELECT c.id, c.full_name, c.first_name, c.push_name, c.phone_number, c.avatar_url, c.updated_at
                     FROM contacts c
                     JOIN account_contacts ac ON c.id = ac.contact_id
                     WHERE ac.account_id = ?1
                     ORDER BY c.updated_at DESC LIMIT ?2 OFFSET ?3",
                )?;
                let items: Vec<Contact> = stmt
                    .query_map(
                        params![acc, limit as i64, offset as i64],
                        Self::map_contact_row,
                    )?
                    .collect::<rusqlite::Result<Vec<_>>>()?;
                Ok(items)
            }
            (None, Some(q)) => {
                let like = format!("%{}%", q);
                let mut stmt = conn.prepare(
                    "SELECT id, full_name, first_name, push_name, phone_number, avatar_url, updated_at
                     FROM contacts
                     WHERE full_name LIKE ?1 OR push_name LIKE ?1 OR first_name LIKE ?1 OR phone_number LIKE ?1 OR id LIKE ?1
                     ORDER BY updated_at DESC LIMIT ?2 OFFSET ?3",
                )?;
                let items: Vec<Contact> = stmt
                    .query_map(
                        params![like, limit as i64, offset as i64],
                        Self::map_contact_row,
                    )?
                    .collect::<rusqlite::Result<Vec<_>>>()?;
                Ok(items)
            }
            (None, None) => {
                let mut stmt = conn.prepare(
                    "SELECT id, full_name, first_name, push_name, phone_number, avatar_url, updated_at
                     FROM contacts
                     ORDER BY updated_at DESC LIMIT ?1 OFFSET ?2",
                )?;
                let items: Vec<Contact> = stmt
                    .query_map(params![limit as i64, offset as i64], Self::map_contact_row)?
                    .collect::<rusqlite::Result<Vec<_>>>()?;
                Ok(items)
            }
        }
    }

    pub fn get_contacts_count(
        &self,
        account_id: Option<&str>,
        query: Option<&str>,
    ) -> Result<usize> {
        let conn = self.conn.lock().unwrap();
        let acc_clean = account_id
            .map(|s| s.trim())
            .filter(|s| !s.is_empty() && *s != "all");
        let q_clean = query.map(|s| s.trim()).filter(|s| !s.is_empty());

        match (acc_clean, q_clean) {
            (Some(acc), Some(q)) => {
                let like = format!("%{}%", q);
                let count: i64 = conn.query_row(
                    "SELECT count(*) FROM contacts c
                     JOIN account_contacts ac ON c.id = ac.contact_id
                     WHERE ac.account_id = ?1 AND (c.full_name LIKE ?2 OR c.push_name LIKE ?2 OR c.first_name LIKE ?2 OR c.phone_number LIKE ?2 OR c.id LIKE ?2)",
                    params![acc, like],
                    |r| r.get(0),
                )?;
                Ok(count as usize)
            }
            (Some(acc), None) => {
                let count: i64 = conn.query_row(
                    "SELECT count(*) FROM account_contacts WHERE account_id = ?1",
                    params![acc],
                    |r| r.get(0),
                )?;
                Ok(count as usize)
            }
            (None, Some(q)) => {
                let like = format!("%{}%", q);
                let count: i64 = conn.query_row(
                    "SELECT count(*) FROM contacts
                     WHERE full_name LIKE ?1 OR push_name LIKE ?1 OR first_name LIKE ?1 OR phone_number LIKE ?1 OR id LIKE ?1",
                    params![like],
                    |r| r.get(0),
                )?;
                Ok(count as usize)
            }
            (None, None) => {
                let count: i64 =
                    conn.query_row("SELECT count(*) FROM contacts", [], |r| r.get(0))?;
                Ok(count as usize)
            }
        }
    }

    fn map_contact_row(row: &rusqlite::Row) -> rusqlite::Result<Contact> {
        Ok(Contact {
            id: row.get(0)?,
            full_name: row.get(1)?,
            first_name: row.get(2)?,
            push_name: row.get(3)?,
            phone_number: row.get(4)?,
            avatar_url: row.get(5)?,
            updated_at: row.get(6)?,
        })
    }

    pub fn get_contact_avatar(&self, jid: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn
            .prepare("SELECT avatar_url FROM contacts WHERE id = ?1 AND avatar_url IS NOT NULL")?;
        stmt.query_row(params![jid], |row| row.get(0))
            .optional()
            .map_err(Into::into)
    }

    pub fn update_contact_avatar(&self, jid: &str, avatar_url: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE contacts SET avatar_url = ?1 WHERE id = ?2",
            params![avatar_url, jid],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_campaign_lifecycle() {
        let archive = Archive::in_memory().unwrap();
        let now = 1000;
        let campaign_id = archive
            .create_campaign(
                "default",
                "Test Campaign",
                "Hello {{name}}!",
                None,
                25,
                90,
                None,
                now,
            )
            .unwrap();

        let recipients = vec![
            NewRecipient {
                jid: "123456789@s.whatsapp.net".to_string(),
                phone_number: "+123456789".to_string(),
                display_name: Some("Alice".to_string()),
                custom_fields_json: None,
            },
            NewRecipient {
                jid: "987654321@s.whatsapp.net".to_string(),
                phone_number: "+987654321".to_string(),
                display_name: Some("Bob".to_string()),
                custom_fields_json: None,
            },
        ];

        archive.add_recipients(campaign_id, &recipients).unwrap();

        let campaign = archive.get_campaign(campaign_id).unwrap().unwrap();
        assert_eq!(campaign.total_count, 2);
        assert_eq!(campaign.status, "draft");

        // Next runnable recipient
        let r1 = archive
            .next_runnable_recipient(campaign_id, now)
            .unwrap()
            .unwrap();
        assert_eq!(r1.display_name.as_deref(), Some("Alice"));

        archive
            .update_recipient_status(r1.id, "sent", None, Some(1010))
            .unwrap();

        let campaign = archive.get_campaign(campaign_id).unwrap().unwrap();
        assert_eq!(campaign.sent_count, 1);

        let r2 = archive
            .next_runnable_recipient(campaign_id, now)
            .unwrap()
            .unwrap();
        assert_eq!(r2.display_name.as_deref(), Some("Bob"));
    }
}
