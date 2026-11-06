//! WhatsApp protocol integration, client lifecycle, QR pairing, and message transmission.

use anyhow::{Context, Result, anyhow};
use qrcode::QrCode;
use qrcode::render::unicode;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::Arc;
use tokio::sync::{RwLock, mpsc};
use tracing::{debug, info, warn};

use whatsapp_rust::pair::NATIVE_CAMERA_DEEP_LINK_PREFIX;
use whatsapp_rust::prelude::{Bot, BotHandle, Client, Jid, MessageBuilderExt, SendOptions, wa};
use whatsapp_rust::store::SqliteStore;
use whatsapp_rust::types::events as wa_events;
use whatsapp_rust::wacore::store::DevicePropsOverride;
use whatsapp_rust::wacore_binary::JidExt;
use whatsapp_rust::{
    AppStateResyncMode, ProfilePictureRequest, ProfilePictureTarget, ProfilePictureType,
    WAPatchName,
};

use crate::archive::{Archive, Contact};
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "state", content = "details")]
pub enum ConnectionStatus {
    Disconnected,
    PairingQr {
        code: String,
        deep_link: String,
        ascii_qr: String,
    },
    Connecting,
    Connected {
        phone_number: Option<String>,
        push_name: Option<String>,
    },
    Failed {
        error: String,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct QrInfo {
    pub raw_code: String,
    pub deep_link: String,
    pub ascii_qr: String,
    pub svg_qr: String,
    pub html_path: Option<String>,
}

pub struct WhatsAppEngine {
    archive: Archive,
    session_db_path: PathBuf,
    client: Arc<RwLock<Option<Arc<Client>>>>,
    status: Arc<RwLock<ConnectionStatus>>,
    qr_info: Arc<RwLock<Option<QrInfo>>>,
    bot_handle: Arc<tokio::sync::Mutex<Option<BotHandle>>>,
    event_tx: mpsc::UnboundedSender<Arc<wa_events::Event>>,
}

struct EngineEventHandler {
    tx: mpsc::UnboundedSender<Arc<wa_events::Event>>,
}

impl wa_events::EventHandler for EngineEventHandler {
    fn handle_event(&self, event: Arc<wa_events::Event>) {
        let _ = self.tx.send(event);
    }
}

impl WhatsAppEngine {
    pub fn new(
        session_db_path: PathBuf,
        archive: Archive,
    ) -> (Arc<Self>, mpsc::UnboundedReceiver<Arc<wa_events::Event>>) {
        let (tx, rx) = mpsc::unbounded_channel();
        let engine = Arc::new(Self {
            archive,
            session_db_path,
            client: Arc::new(RwLock::new(None)),
            status: Arc::new(RwLock::new(ConnectionStatus::Disconnected)),
            qr_info: Arc::new(RwLock::new(None)),
            bot_handle: Arc::new(tokio::sync::Mutex::new(None)),
            event_tx: tx,
        });

        (engine, rx)
    }

    pub async fn shutdown(&self) {
        let release = if let Some(client) = self.client.read().await.as_ref() {
            Some(client.store_release())
        } else {
            None
        };

        if let Some(handle) = self.bot_handle.lock().await.take() {
            let _ = handle.shutdown().await;
        }

        *self.client.write().await = None;
        *self.status.write().await = ConnectionStatus::Disconnected;
        *self.qr_info.write().await = None;

        if let Some(r) = release {
            let _ = tokio::time::timeout(tokio::time::Duration::from_millis(1500), r.wait()).await;
        }
    }
    pub async fn start(
        self: &Arc<Self>,
        mut event_rx: mpsc::UnboundedReceiver<Arc<wa_events::Event>>,
    ) -> Result<()> {
        if let Some(parent) = self.session_db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        info!(
            "Opening WhatsApp device store at {:?}",
            self.session_db_path
        );
        let store = SqliteStore::open(&self.session_db_path.to_string_lossy())
            .await
            .context("Could not open WhatsApp SQLite device store")?;

        let event_handler = EngineEventHandler {
            tx: self.event_tx.clone(),
        };

        let bot = Bot::builder()
            .with_backend(store)
            .with_device_props(
                DevicePropsOverride::new()
                    .with_os("Windows".to_string())
                    .with_platform_type(wa::device_props::PlatformType::CHROME),
            )
            .with_event_handler(event_handler)
            .build()
            .await
            .context("Failed to build WhatsApp Bot")?;

        let handle = bot.spawn();
        let client = handle.client();

        *self.client.write().await = Some(client);
        *self.bot_handle.lock().await = Some(handle);
        *self.status.write().await = ConnectionStatus::Connecting;

        // Process incoming events in a background loop
        let this = Arc::clone(self);
        tokio::spawn(async move {
            while let Some(event) = event_rx.recv().await {
                this.handle_protocol_event(event).await;
            }
        });

        Ok(())
    }

    async fn handle_protocol_event(&self, event: Arc<wa_events::Event>) {
        use wa_events::Event as E;

        match event.as_ref() {
            E::PairingQrCode(qr) => {
                let deep_link = format!("{NATIVE_CAMERA_DEEP_LINK_PREFIX}{}", qr.code);
                let ascii =
                    render_ascii_qr(&qr.code).unwrap_or_else(|_| "[QR render failed]".to_string());
                let svg = render_svg_qr(&qr.code).unwrap_or_default();

                let html_path = if let Some(parent) = self.session_db_path.parent() {
                    let p = parent.join("qr.html");
                    let html = format!(
                        r#"<!DOCTYPE html><html><head><meta charset="utf-8"><title>WhatsApp Pairing QR</title><style>body{{font-family:system-ui,-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0b141a;color:#e9edef}}h2{{margin:0 0 8px}}p{{color:#8696a0;margin:0 0 24px}}.card{{background:#fff;padding:24px;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.4)}}</style></head><body><h2>Link WhatsApp</h2><p>Open WhatsApp &gt; Settings &gt; Linked Devices &gt; Link a Device</p><div class="card">{}</div></body></html>"#,
                        svg
                    );
                    let _ = std::fs::write(&p, html);
                    Some(p.to_string_lossy().to_string())
                } else {
                    None
                };

                let info = QrInfo {
                    raw_code: qr.code.clone(),
                    deep_link: deep_link.clone(),
                    ascii_qr: ascii.clone(),
                    svg_qr: svg,
                    html_path,
                };

                *self.qr_info.write().await = Some(info);
                *self.status.write().await = ConnectionStatus::PairingQr {
                    code: qr.code.clone(),
                    deep_link,
                    ascii_qr: ascii,
                };
                info!("WhatsApp pairing QR code received (saved to qr.html)");
            }
            E::PairSuccess(pair) => {
                *self.qr_info.write().await = None;
                *self.status.write().await = ConnectionStatus::Connecting;
                info!("WhatsApp successfully paired with device id: {}", pair.id);
            }
            E::PairingQrCodesExhausted(exhausted) => {
                *self.qr_info.write().await = None;
                warn!(
                    "WhatsApp pairing QR codes exhausted (disconnected: {})",
                    exhausted.disconnected
                );
                if exhausted.disconnected {
                    if let Some(client) = self.client.read().await.clone() {
                        tokio::spawn(async move {
                            let _ = client.reconnect_immediately().await;
                        });
                    }
                }
            }
            E::Connected(_) => {
                *self.qr_info.write().await = None;
                let client_guard = self.client.read().await;
                let (phone, name) = if let Some(client) = client_guard.as_ref() {
                    let pn = client.pn().map(|jid| jid.user.to_string());
                    let name = Some(client.push_name());
                    (pn, name)
                } else {
                    (None, None)
                };

                info!(
                    "WhatsApp connected and synchronized! Phone: {:?}, Push Name: {:?}",
                    phone, name
                );
                *self.status.write().await = ConnectionStatus::Connected {
                    phone_number: phone,
                    push_name: name,
                };

                // Peer AppState contact synchronization (CriticalUnblockLow pattern)
                if let Some(client) = client_guard.clone() {
                    let archive = self.archive.clone();
                    let session_path = self.session_db_path.clone();
                    tokio::spawn(async move {
                        let _ = archive.sync_from_session_db(&session_path);
                        info!(
                            "Triggering WhatsApp peer AppState contact sync (CriticalUnblockLow)"
                        );
                        let _ = client
                            .resync_app_state(
                                [WAPatchName::CriticalUnblockLow],
                                AppStateResyncMode::Snapshot,
                            )
                            .await;
                    });
                }
            }
            E::ContactUpdate(update) => {
                let raw_jid = update.jid.to_string();
                let identity = if let Some(pn_jid) = &update.action.pn_jid {
                    self.resolve_contact_identity(pn_jid)
                        .or_else(|| self.resolve_contact_identity(&raw_jid))
                } else {
                    self.resolve_contact_identity(&raw_jid)
                };

                let (canonical_jid, phone_opt) = match identity {
                    Some(id) => id,
                    None => return,
                };

                let full_name = update
                    .action
                    .full_name
                    .clone()
                    .filter(|s| !s.trim().is_empty());
                let first_name = update
                    .action
                    .first_name
                    .clone()
                    .filter(|s| !s.trim().is_empty());
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64;

                let contact = Contact {
                    id: canonical_jid,
                    full_name,
                    first_name,
                    push_name: None,
                    phone_number: phone_opt,
                    avatar_url: None,
                    updated_at: now,
                };
                let _ = self.archive.upsert_contact(&contact);
            }
            E::Messages(batch) => {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64;
                for msg in batch.messages.iter() {
                    let push_name = (!msg.info.push_name.trim().is_empty())
                        .then(|| msg.info.push_name.to_string());
                    if let Some(push) = push_name {
                        let sender_jid = msg.info.source.sender.to_string();
                        if let Some((canonical_jid, phone_opt)) =
                            self.resolve_contact_identity(&sender_jid)
                        {
                            let contact = Contact {
                                id: canonical_jid,
                                full_name: None,
                                first_name: None,
                                push_name: Some(push),
                                phone_number: phone_opt,
                                avatar_url: None,
                                updated_at: now,
                            };
                            let _ = self.archive.upsert_contact(&contact);
                        }
                    }
                }
            }
            E::Disconnected(d) => {
                info!("WhatsApp client disconnected: {:?}", d);
                let (stored_phone, _) = self.read_stored_identity();
                if stored_phone.is_some() {
                    *self.status.write().await = ConnectionStatus::Connecting;
                } else {
                    *self.status.write().await = ConnectionStatus::Disconnected;
                }
                if let Some(client) = self.client.read().await.clone() {
                    let status_ref = Arc::clone(&self.status);
                    tokio::spawn(async move {
                        let mut backoff_secs = 2u64;
                        const MAX_BACKOFF_SECS: u64 = 60u64;
                        loop {
                            tokio::time::sleep(tokio::time::Duration::from_secs(backoff_secs))
                                .await;
                            {
                                let current_status = status_ref.read().await;
                                if matches!(
                                    *current_status,
                                    ConnectionStatus::Connected { .. }
                                        | ConnectionStatus::Disconnected
                                ) {
                                    break;
                                }
                            }
                            info!(
                                "Attempting to reconnect WhatsApp client (backoff: {}s)...",
                                backoff_secs
                            );
                            let _ = client.reconnect_immediately().await;
                            backoff_secs = std::cmp::min(backoff_secs * 2, MAX_BACKOFF_SECS);
                        }
                    });
                }
            }
            E::LoggedOut(l) => {
                warn!("WhatsApp client logged out (reason: {:?})", l.reason);
                *self.status.write().await = ConnectionStatus::Disconnected;
            }
            _ => {}
        }
    }

    pub fn read_stored_identity(&self) -> (Option<String>, Option<String>) {
        read_device_identity(&self.session_db_path)
    }

    pub fn resolve_lid_to_phone(&self, lid_user: &str) -> Option<String> {
        let uri = format!(
            "file:{}?mode=ro&immutable=1",
            self.session_db_path.to_string_lossy().replace('\\', "/")
        );
        let conn = rusqlite::Connection::open_with_flags(
            &uri,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
        )
        .ok()?;
        conn.query_row(
            "SELECT phone_number FROM lid_pn_mapping WHERE lid = ?1 AND phone_number != '' LIMIT 1",
            rusqlite::params![lid_user],
            |row| row.get::<_, String>(0),
        )
        .ok()
    }

    pub fn resolve_contact_identity(&self, raw_jid: &str) -> Option<(String, Option<String>)> {
        let clean = normalize_user_jid(raw_jid)?;
        if clean.ends_with("@s.whatsapp.net") {
            let digits = clean.strip_suffix("@s.whatsapp.net")?;
            let formatted_phone = if digits.chars().all(|c| c.is_ascii_digit()) && digits.len() >= 7
            {
                Some(format!("+{}", digits))
            } else {
                None
            };
            Some((clean, formatted_phone))
        } else if clean.ends_with("@lid") {
            let lid_user = clean.strip_suffix("@lid")?;
            if let Some(digits) = self.resolve_lid_to_phone(lid_user) {
                let clean_digits: String = digits.chars().filter(|c| c.is_ascii_digit()).collect();
                if clean_digits.len() >= 7 {
                    let canonical_jid = format!("{}@s.whatsapp.net", clean_digits);
                    let formatted_phone = format!("+{}", clean_digits);
                    return Some((canonical_jid, Some(formatted_phone)));
                }
            }
            None
        } else {
            None
        }
    }

    pub async fn get_status(&self) -> ConnectionStatus {
        self.status.read().await.clone()
    }

    pub async fn is_connected(&self) -> bool {
        let status = self.get_status().await;
        matches!(status, ConnectionStatus::Connected { .. })
    }

    pub async fn wait_until_connected(&self, timeout_secs: u64) -> Result<()> {
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);
        while std::time::Instant::now() < deadline {
            if self.is_connected().await {
                return Ok(());
            }
            tokio::time::sleep(std::time::Duration::from_millis(200)).await;
        }
        Err(anyhow!(
            "WhatsApp client connection timed out after {}s",
            timeout_secs
        ))
    }

    pub async fn get_qr_info(&self) -> Option<QrInfo> {
        let in_memory = self.qr_info.read().await.clone();
        if in_memory.is_some() {
            return in_memory;
        }

        if let Some(parent) = self.session_db_path.parent() {
            let html_path = parent.join("qr.html");
            if html_path.exists() {
                if let Ok(html) = std::fs::read_to_string(&html_path) {
                    if let Some(start) = html.find("<svg") {
                        if let Some(end) = html.find("</svg>") {
                            let svg = html[start..=end + 5].to_string();
                            let info = QrInfo {
                                raw_code: String::new(),
                                deep_link: String::new(),
                                ascii_qr: String::new(),
                                svg_qr: svg,
                                html_path: Some(html_path.to_string_lossy().to_string()),
                            };
                            return Some(info);
                        }
                    }
                }
            }
        }
        None
    }

    pub fn archive(&self) -> &Archive {
        &self.archive
    }

    pub async fn get_client(&self) -> Result<Arc<Client>> {
        self.client
            .read()
            .await
            .clone()
            .ok_or_else(|| anyhow!("WhatsApp client is not initialized"))
    }

    pub async fn send_composing(&self, target_jid_str: &str) -> Result<()> {
        let client = self.get_client().await?;
        let jid = resolve_target_jid(target_jid_str)?;
        client.chatstate().send_composing(&jid).await?;
        Ok(())
    }

    pub async fn send_paused(&self, target_jid_str: &str) -> Result<()> {
        let client = self.get_client().await?;
        let jid = resolve_target_jid(target_jid_str)?;
        client.chatstate().send_paused(&jid).await?;
        Ok(())
    }

    pub async fn send_text(&self, target_jid_str: &str, text: &str) -> Result<String> {
        self.send_text_with_id(target_jid_str, text, None).await
    }

    pub async fn send_text_with_id(
        &self,
        target_jid_str: &str,
        text: &str,
        stanza_id: Option<&str>,
    ) -> Result<String> {
        let client = self.get_client().await?;
        let jid = resolve_target_jid(target_jid_str)?;

        let message = wa::Message::text(text.to_string());
        let message_id = stanza_id
            .and_then(|s| whatsapp_rust::MessageId::try_from(s.to_string()).ok())
            .unwrap_or_else(|| client.generate_message_id());
        let options = SendOptions::default().with_message_id(message_id.clone());

        let req = whatsapp_rust::SendRequest::new(&jid, message).with_options(options);
        client
            .send(req)
            .await
            .map_err(|e| anyhow!("Send failed: {}", e))?;

        Ok(message_id.into_string())
    }

    pub async fn send_media(
        &self,
        target_jid_str: &str,
        data: Vec<u8>,
        file_name: &str,
        mime_type: &str,
        caption: Option<&str>,
        thumbnail: Option<Vec<u8>>,
        as_document: bool,
    ) -> Result<String> {
        self.send_media_with_id(
            target_jid_str,
            data,
            file_name,
            mime_type,
            caption,
            thumbnail,
            as_document,
            None,
        )
        .await
    }

    pub async fn send_media_with_id(
        &self,
        target_jid_str: &str,
        data: Vec<u8>,
        file_name: &str,
        mime_type: &str,
        caption: Option<&str>,
        thumbnail: Option<Vec<u8>>,
        as_document: bool,
        stanza_id: Option<&str>,
    ) -> Result<String> {
        use whatsapp_rust::download::MediaType;
        use whatsapp_rust::media::{
            DocumentOptions, ImageOptions, VideoOptions, document_message, image_message,
            video_message,
        };

        let client = self.get_client().await?;
        let jid = resolve_target_jid(target_jid_str)?;

        let is_image = !as_document && mime_type.starts_with("image/");
        let is_video = !as_document && mime_type.starts_with("video/");

        let media_type = if is_image {
            MediaType::Image
        } else if is_video {
            MediaType::Video
        } else {
            MediaType::Document
        };

        let upload = client
            .upload(
                data,
                media_type,
                whatsapp_rust::upload::UploadOptions::default(),
            )
            .await
            .map_err(|e| anyhow!("Media upload failed: {}", e))?;

        let message = if is_image {
            let mut opts = ImageOptions::default();
            opts.caption = caption.map(ToString::to_string);
            opts.mimetype = Some(mime_type.to_string());
            opts.jpeg_thumbnail = thumbnail;
            image_message(upload, opts)
        } else if is_video {
            let mut opts = VideoOptions::default();
            opts.caption = caption.map(ToString::to_string);
            opts.mimetype = Some(mime_type.to_string());
            opts.jpeg_thumbnail = thumbnail;
            video_message(upload, opts)
        } else {
            let mut opts = DocumentOptions::default();
            opts.caption = caption.map(ToString::to_string);
            opts.file_name = Some(file_name.to_string());
            opts.mimetype = Some(mime_type.to_string());
            opts.jpeg_thumbnail = thumbnail;
            document_message(upload, opts)
        };

        let message_id = stanza_id
            .and_then(|s| whatsapp_rust::MessageId::try_from(s.to_string()).ok())
            .unwrap_or_else(|| client.generate_message_id());
        let options = SendOptions::default().with_message_id(message_id.clone());
        let req = whatsapp_rust::SendRequest::new(&jid, message).with_options(options);
        client
            .send(req)
            .await
            .map_err(|e| anyhow!("Send media failed: {}", e))?;

        Ok(message_id.into_string())
    }

    pub async fn pair_with_phone(&self, phone: &str) -> Result<String> {
        let client = self.get_client().await?;
        let code = client
            .pair_with_code(whatsapp_rust::pair_code::PairCodeOptions {
                phone_number: phone.to_string(),
                ..Default::default()
            })
            .await
            .map_err(|e| anyhow!("Failed to pair with phone number: {}", e))?;
        Ok(code)
    }

    pub fn session_db_path(&self) -> &Path {
        &self.session_db_path
    }

    pub async fn sync_contacts(&self) -> Result<()> {
        let client = self.get_client().await?;
        let archive = self.archive.clone();
        let session_path = self.session_db_path.clone();

        let _ = archive.sync_from_session_db(&session_path);

        tokio::spawn(async move {
            info!("Triggering WhatsApp peer AppState contact sync (CriticalUnblockLow)");
            let _ = client
                .resync_app_state(
                    [WAPatchName::CriticalUnblockLow],
                    AppStateResyncMode::Snapshot,
                )
                .await;
        });

        Ok(())
    }

    pub async fn get_contact_avatar_url(&self, jid_str: &str) -> Result<Option<String>> {
        let client = self.get_client().await?;
        let mut candidates = Vec::new();
        if let Ok(j) = jid_str.parse::<Jid>() {
            candidates.push(j);
        }
        if let Some((_, j)) = crate::pacing::normalize_phone_number(jid_str) {
            if let Ok(pj) = j.parse::<Jid>() {
                if !candidates.contains(&pj) {
                    candidates.push(pj);
                }
            }
        }
        if candidates.is_empty() {
            return Ok(None);
        }

        for jid in &candidates {
            let target = if jid.is_group() {
                ProfilePictureTarget::Group(jid)
            } else {
                ProfilePictureTarget::Contact(jid)
            };
            for ptype in [ProfilePictureType::Preview, ProfilePictureType::Full] {
                let req = ProfilePictureRequest::new(target, ptype);
                match client.pictures().lookup(req).await {
                    Ok(lookup) => {
                        if let Some(found) = lookup.into_found() {
                            let _ = self.archive.update_contact_avatar(jid_str, &found.url);
                            return Ok(Some(found.url));
                        }
                    }
                    Err(e) => {
                        debug!(
                            "Profile picture lookup for {:?} {:?} returned: {}",
                            jid, ptype, e
                        );
                    }
                }
            }
        }
        Ok(None)
    }
}
fn resolve_target_jid(target: &str) -> Result<Jid> {
    let trimmed = target.trim();
    if trimmed.contains('@') {
        Jid::from_str(trimmed).map_err(|e| anyhow!("Invalid JID: {}", e))
    } else if let Some((_, jid_str)) = crate::pacing::normalize_phone_number(trimmed) {
        Jid::from_str(&jid_str).map_err(|e| anyhow!("Invalid JID: {}", e))
    } else {
        let digits: String = trimmed.chars().filter(|c| c.is_ascii_digit()).collect();
        if !digits.is_empty() {
            Jid::from_str(&format!("{}@s.whatsapp.net", digits))
                .map_err(|e| anyhow!("Invalid JID: {}", e))
        } else {
            Err(anyhow!("Invalid target phone/JID: '{}'", target))
        }
    }
}

fn read_device_identity(path: &Path) -> (Option<String>, Option<String>) {
    if !path.exists() {
        return (None, None);
    }
    if let Ok(conn) = rusqlite::Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    ) {
        if let Ok(mut stmt) =
            conn.prepare("SELECT pn, push_name FROM device ORDER BY id ASC LIMIT 1")
        {
            if let Ok(mut rows) = stmt.query([]) {
                if let Ok(Some(row)) = rows.next() {
                    let pn_raw: String = row.get(0).unwrap_or_default();
                    let push_name: String = row.get(1).unwrap_or_default();
                    let phone = if !pn_raw.trim().is_empty() {
                        let clean = pn_raw
                            .split(':')
                            .next()
                            .unwrap_or(&pn_raw)
                            .split('@')
                            .next()
                            .unwrap_or(&pn_raw)
                            .to_string();
                        Some(clean)
                    } else {
                        None
                    };
                    let name = if !push_name.trim().is_empty() {
                        Some(push_name)
                    } else {
                        None
                    };
                    return (phone, name);
                }
            }
        }
    }
    (None, None)
}

pub fn render_ascii_qr(data: &str) -> Result<String> {
    let code = QrCode::new(data.as_bytes()).context("Failed to generate QR code")?;
    let image = code
        .render::<unicode::Dense1x2>()
        .dark_color(unicode::Dense1x2::Dark)
        .light_color(unicode::Dense1x2::Light)
        .build();
    Ok(image)
}

pub fn render_svg_qr(data: &str) -> Result<String> {
    let code = QrCode::new(data.as_bytes()).context("Failed to generate QR code")?;
    let svg = code.render::<qrcode::render::svg::Color>().build();
    Ok(svg)
}

pub fn normalize_user_jid(jid_str: &str) -> Option<String> {
    let trimmed = jid_str.trim();
    if trimmed.is_empty()
        || trimmed.ends_with("@g.us")
        || trimmed.ends_with("@broadcast")
        || trimmed.ends_with("@newsletter")
    {
        return None;
    }
    let (user_part, server_part) = trimmed.split_once('@')?;
    let clean_user = match user_part.split_once(':') {
        Some((u, _device)) => u,
        None => user_part,
    };
    Some(format!("{}@{}", clean_user, server_part))
}
