//! Embedded HTTP Web Dashboard and REST API for real-time campaign monitoring.

use anyhow::{Result, anyhow};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tracing::{error, info};

use crate::account::AccountManager;
use crate::sidecar::SidecarHandle;

#[derive(rust_embed::RustEmbed)]
#[folder = "dashboard/dist/"]
pub struct DashboardAssets;

pub struct WebDashboard {
    account_manager: Arc<AccountManager>,
    sidecar: Arc<SidecarHandle>,
    port: u16,
    dist_dir: PathBuf,
}

impl WebDashboard {
    pub fn new(
        account_manager: Arc<AccountManager>,
        sidecar: Arc<SidecarHandle>,
        port: u16,
        dist_dir: PathBuf,
    ) -> Self {
        Self {
            account_manager,
            sidecar,
            port,
            dist_dir,
        }
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub async fn start(self: Arc<Self>) -> Result<u16> {
        let mut target_port = self.port;
        let mut listener_opt = None;
        let mut last_err = None;

        for _attempt in 1..=10 {
            let addr = format!("127.0.0.1:{}", target_port);
            match TcpListener::bind(&addr).await {
                Ok(l) => {
                    listener_opt = Some(l);
                    break;
                }
                Err(e) => {
                    last_err = Some(e);
                    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
                }
            }
        }

        if listener_opt.is_none() {
            for fallback_port in (target_port + 1)..=(target_port + 5) {
                let addr = format!("127.0.0.1:{}", fallback_port);
                if let Ok(l) = TcpListener::bind(&addr).await {
                    target_port = fallback_port;
                    listener_opt = Some(l);
                    break;
                }
            }
        }

        let listener = listener_opt.ok_or_else(|| {
            anyhow!(
                "Failed to bind dashboard listener to 127.0.0.1:{} or fallback ports: {}",
                self.port,
                last_err.map(|e| e.to_string()).unwrap_or_default()
            )
        })?;

        let actual_port = target_port;
        let addr = format!("127.0.0.1:{}", actual_port);
        info!("Wasche Web Dashboard is live at http://{}", addr);
        let this = Arc::clone(&self);
        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((mut stream, _)) => {
                        let dashboard = Arc::clone(&this);
                        tokio::spawn(async move {
                            let mut buf = Vec::with_capacity(32 * 1024);
                            let mut temp = [0u8; 16384];
                            let mut header_end = None;
                            let mut content_length = 0usize;

                            loop {
                                let n = match stream.read(&mut temp).await {
                                    Ok(n) if n > 0 => n,
                                    _ => break,
                                };
                                buf.extend_from_slice(&temp[..n]);

                                if header_end.is_none() {
                                    if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n")
                                    {
                                        let end = pos + 4;
                                        header_end = Some(end);
                                        let header_str = String::from_utf8_lossy(&buf[..end]);
                                        for line in header_str.lines() {
                                            if line
                                                .to_ascii_lowercase()
                                                .starts_with("content-length:")
                                            {
                                                if let Some(val) = line.split(':').nth(1) {
                                                    content_length =
                                                        val.trim().parse::<usize>().unwrap_or(0);
                                                }
                                            }
                                        }
                                    }
                                }

                                if let Some(end) = header_end {
                                    if buf.len() >= end + content_length {
                                        break;
                                    }
                                }

                                if buf.len() > 60 * 1024 * 1024 {
                                    break;
                                }
                            }

                            if buf.is_empty() {
                                return;
                            }

                            let request_str = String::from_utf8_lossy(&buf);
                            let mut lines = request_str.lines();
                            let first_line = match lines.next() {
                                Some(l) => l,
                                None => return,
                            };

                            let parts: Vec<&str> = first_line.split_whitespace().collect();
                            if parts.len() < 2 {
                                return;
                            }

                            let method = parts[0];
                            let uri = parts[1];

                            if method == "OPTIONS" {
                                let header = "HTTP/1.1 204 No Content\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Authorization\r\nConnection: close\r\n\r\n";
                                let _ = stream.write_all(header.as_bytes()).await;
                                let _ = stream.flush().await;
                                return;
                            }

                            let (status, content_type, body) =
                                dashboard.route_request(method, uri, &request_str).await;

                            let is_media = content_type.starts_with("video/")
                                || content_type.starts_with("audio/");
                            let range_header = if is_media && status.starts_with("200") {
                                request_str
                                    .lines()
                                    .find(|l| l.to_ascii_lowercase().starts_with("range:"))
                                    .and_then(|l| l.split(':').nth(1))
                                    .map(|s| s.trim().to_string())
                            } else {
                                None
                            };

                            if let Some(range_val) = range_header
                                .as_deref()
                                .and_then(|r| r.strip_prefix("bytes="))
                            {
                                let total = body.len();
                                let parts: Vec<&str> = range_val.split('-').collect();
                                let start = parts
                                    .first()
                                    .and_then(|s| s.parse::<usize>().ok())
                                    .unwrap_or(0);
                                let end = parts
                                    .get(1)
                                    .and_then(|s| s.parse::<usize>().ok())
                                    .unwrap_or(total.saturating_sub(1))
                                    .min(total.saturating_sub(1));

                                if start <= end && start < total {
                                    let chunk = &body[start..=end];
                                    let header = format!(
                                        "HTTP/1.1 206 Partial Content\r\nContent-Type: {}\r\nContent-Range: bytes {}-{}/{}\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Range, Authorization\r\nConnection: close\r\n\r\n",
                                        content_type,
                                        start,
                                        end,
                                        total,
                                        chunk.len()
                                    );
                                    let _ = stream.write_all(header.as_bytes()).await;
                                    let _ = stream.write_all(chunk).await;
                                    let _ = stream.flush().await;
                                    return;
                                } else {
                                    let header = format!(
                                        "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{}\r\nContent-Length: 0\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
                                        total
                                    );
                                    let _ = stream.write_all(header.as_bytes()).await;
                                    let _ = stream.flush().await;
                                    return;
                                }
                            }

                            let accept_ranges = if is_media {
                                "Accept-Ranges: bytes\r\n"
                            } else {
                                ""
                            };
                            let header = format!(
                                "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\n{}Access-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type, Range, Authorization\r\nConnection: close\r\n\r\n",
                                status,
                                content_type,
                                body.len(),
                                accept_ranges
                            );

                            let _ = stream.write_all(header.as_bytes()).await;
                            let _ = stream.write_all(&body).await;
                            let _ = stream.flush().await;
                        });
                    }
                    Err(e) => {
                        error!("TCP accept error in WebDashboard: {}", e);
                    }
                }
            }
        });

        Ok(actual_port)
    }

    async fn route_request(
        &self,
        method: &str,
        uri: &str,
        request_str: &str,
    ) -> (&'static str, &'static str, Vec<u8>) {
        let path = uri.split('?').next().unwrap_or("/");
        let clean_path = path.trim_end_matches('/');

        if method == "GET"
            && (clean_path.is_empty()
                || clean_path == "/index.html"
                || clean_path == "/campaign"
                || clean_path == "/devices"
                || clean_path == "/contacts")
        {
            let index_file = self.dist_dir.join("index.html");
            if index_file.exists() {
                if let Ok(bytes) = std::fs::read(&index_file) {
                    return ("200 OK", "text/html; charset=utf-8", bytes);
                }
            }
            if let Some(file) = DashboardAssets::get("index.html") {
                return ("200 OK", "text/html; charset=utf-8", file.data.to_vec());
            }
            (
                "404 Not Found",
                "text/plain",
                b"Dashboard Not Found".to_vec(),
            )
        } else if method == "GET"
            && (path.starts_with("/assets/")
                || path.starts_with("/_astro/")
                || path.ends_with(".js")
                || path.ends_with(".css")
                || path.ends_with(".svg")
                || path.ends_with(".ico")
                || path.ends_with(".png")
                || path.ends_with(".woff2"))
        {
            let rel_path = path.trim_start_matches('/');
            let file_path = self.dist_dir.join(rel_path);
            let (bytes, content_type) = if file_path.exists() {
                let b = std::fs::read(&file_path).ok();
                (b, get_content_type(path))
            } else if let Some(file) = DashboardAssets::get(rel_path) {
                (Some(file.data.to_vec()), get_content_type(path))
            } else {
                (None, "text/plain")
            };

            if let Some(data) = bytes {
                return ("200 OK", content_type, data);
            }
            ("404 Not Found", "text/plain", b"Asset Not Found".to_vec())
        } else if method == "GET" && path == "/api/accounts" {
            let accounts = self.account_manager.list_accounts().await;
            let json = serde_json::to_vec(&accounts).unwrap_or_else(|_| b"[]".to_vec());
            ("200 OK", "application/json", json)
        } else if method == "POST" && (path == "/api/accounts/add" || path == "/api/accounts") {
            let mut account_id = None;
            let mut phone = None;

            if let Some(query) = uri.split('?').nth(1) {
                for pair in query.split('&') {
                    if pair.starts_with("account_id=") || pair.starts_with("id=") {
                        account_id = pair.split('=').nth(1).map(percent_decode_str);
                    } else if pair.starts_with("phone=") || pair.starts_with("phone_number=") {
                        phone = pair.split('=').nth(1).map(percent_decode_str);
                    }
                }
            }

            if let Some(body_start) = request_str.split("\r\n\r\n").nth(1) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_start) {
                    if account_id.is_none() {
                        account_id = val
                            .get("account_id")
                            .or(val.get("id"))
                            .and_then(|t| t.as_str())
                            .map(ToString::to_string);
                    }
                    if phone.is_none() {
                        phone = val
                            .get("phone")
                            .or(val.get("phone_number"))
                            .and_then(|t| t.as_str())
                            .map(ToString::to_string);
                    }
                }
            }

            if let Some(id) = account_id {
                match self.account_manager.add_account(&id).await {
                    Ok(engine) => {
                        let mut pairing_code = None;
                        if let Some(p) = phone {
                            let digits: String = p.chars().filter(|c| c.is_ascii_digit()).collect();
                            if !digits.is_empty() {
                                match engine.pair_with_phone(&digits).await {
                                    Ok(code) => {
                                        pairing_code = Some(code);
                                    }
                                    Err(e) => {
                                        tracing::warn!(
                                            "Failed to generate pairing code for phone: {}",
                                            e
                                        );
                                    }
                                }
                            }
                        }

                        let res_json = serde_json::json!({
                            "success": true,
                            "account_id": id,
                            "pairing_code": pairing_code
                        });
                        (
                            "200 OK",
                            "application/json",
                            serde_json::to_vec(&res_json).unwrap(),
                        )
                    }
                    Err(e) => (
                        "400 Bad Request",
                        "application/json",
                        format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                    ),
                }
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Missing account_id parameter"}"#.to_vec(),
                )
            }
        } else if method == "POST"
            && path.starts_with("/api/accounts/")
            && path.ends_with("/pair-phone")
        {
            let id_str = path
                .trim_start_matches("/api/accounts/")
                .trim_end_matches("/pair-phone");
            let mut phone = None;
            if let Some(body_start) = request_str.split("\r\n\r\n").nth(1) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_start) {
                    phone = val
                        .get("phone")
                        .or(val.get("phone_number"))
                        .and_then(|t| t.as_str())
                        .map(ToString::to_string);
                }
            }
            if let Some(p) = phone {
                let digits: String = p.chars().filter(|c| c.is_ascii_digit()).collect();
                match self.account_manager.get_account(Some(id_str)).await {
                    Ok(engine) => match engine.pair_with_phone(&digits).await {
                        Ok(code) => (
                            "200 OK",
                            "application/json",
                            format!(r#"{{"success":true,"code":"{}"}}"#, code).into_bytes(),
                        ),
                        Err(e) => (
                            "400 Bad Request",
                            "application/json",
                            format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                        ),
                    },
                    Err(e) => (
                        "404 Not Found",
                        "application/json",
                        format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                    ),
                }
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Missing phone parameter"}"#.to_vec(),
                )
            }
        } else if method == "POST"
            && path.starts_with("/api/accounts/")
            && path.ends_with("/rename")
        {
            let old_id = path
                .trim_start_matches("/api/accounts/")
                .trim_end_matches("/rename");
            let new_id = if let Some(query) = uri.split('?').nth(1) {
                query
                    .split('&')
                    .find(|p| p.starts_with("new_id=") || p.starts_with("name="))
                    .and_then(|p| p.split('=').nth(1))
                    .map(percent_decode_str)
            } else {
                None
            }
            .or_else(|| {
                if let Some(body_start) = request_str.split("\r\n\r\n").nth(1) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_start) {
                        val.get("new_id")
                            .or(val.get("name"))
                            .and_then(|t| t.as_str())
                            .map(ToString::to_string)
                    } else {
                        None
                    }
                } else {
                    None
                }
            });

            if let Some(nid) = new_id {
                match self.account_manager.rename_account(old_id, &nid).await {
                    Ok(_) => ("200 OK", "application/json", b"{\"success\":true}".to_vec()),
                    Err(e) => (
                        "400 Bad Request",
                        "application/json",
                        format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                    ),
                }
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Missing new_id parameter"}"#.to_vec(),
                )
            }
        } else if method == "POST"
            && path.starts_with("/api/accounts/")
            && path.ends_with("/remove")
        {
            let acc_id = path
                .trim_start_matches("/api/accounts/")
                .trim_end_matches("/remove");
            let acc_id = percent_decode_str(acc_id);
            match self.account_manager.remove_account(&acc_id).await {
                Ok(_) => ("200 OK", "application/json", b"{\"success\":true}".to_vec()),
                Err(e) => (
                    "400 Bad Request",
                    "application/json",
                    format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                ),
            }
        } else if method == "POST"
            && path.starts_with("/api/accounts/")
            && path.ends_with("/reset-pairing")
        {
            let acc_id = path
                .trim_start_matches("/api/accounts/")
                .trim_end_matches("/reset-pairing");
            match self.account_manager.reset_account_pairing(acc_id).await {
                Ok(_) => ("200 OK", "application/json", b"{\"success\":true}".to_vec()),
                Err(e) => (
                    "400 Bad Request",
                    "application/json",
                    format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                ),
            }
        } else if method == "GET" && path.starts_with("/api/accounts/") && path.ends_with("/qr") {
            let acc_id = path
                .trim_start_matches("/api/accounts/")
                .trim_end_matches("/qr");
            let acc_id = percent_decode_str(acc_id);
            match self.account_manager.get_account(Some(&acc_id)).await {
                Ok(engine) => {
                    let qr_opt = engine.get_qr_info().await;
                    let status = engine.get_status().await;
                    let status_str = match &status {
                        crate::whatsapp::ConnectionStatus::Connected { .. } => "Connected",
                        crate::whatsapp::ConnectionStatus::PairingQr { .. } => "Pairing",
                        crate::whatsapp::ConnectionStatus::Connecting => "Connecting",
                        crate::whatsapp::ConnectionStatus::Disconnected => "Disconnected",
                        crate::whatsapp::ConnectionStatus::Failed { .. } => "Failed",
                    };
                    let res = serde_json::json!({
                        "status": status_str,
                        "raw_code": qr_opt.as_ref().map(|q| &q.raw_code),
                        "deep_link": qr_opt.as_ref().map(|q| &q.deep_link),
                        "ascii_qr": qr_opt.as_ref().map(|q| &q.ascii_qr),
                        "svg_qr": qr_opt.as_ref().map(|q| &q.svg_qr),
                        "html_path": qr_opt.as_ref().and_then(|q| q.html_path.as_ref()),
                    });
                    (
                        "200 OK",
                        "application/json",
                        serde_json::to_vec(&res).unwrap_or_default(),
                    )
                }
                Err(e) => (
                    "404 Not Found",
                    "application/json",
                    format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                ),
            }
        } else if method == "POST"
            && path.starts_with("/api/accounts/")
            && (path.ends_with("/set-active") || path.ends_with("/active"))
        {
            let acc_id = if path.ends_with("/set-active") {
                path.trim_start_matches("/api/accounts/")
                    .trim_end_matches("/set-active")
            } else {
                path.trim_start_matches("/api/accounts/")
                    .trim_end_matches("/active")
            };
            let acc_id = percent_decode_str(acc_id);
            match self.account_manager.set_active_account(&acc_id).await {
                Ok(_) => ("200 OK", "application/json", b"{\"success\":true}".to_vec()),
                Err(e) => (
                    "400 Bad Request",
                    "application/json",
                    format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                ),
            }
        } else if method == "GET" && path == "/api/contacts" {
            let account_id = uri.split('?').nth(1).and_then(|q| {
                q.split('&')
                    .find(|p| p.starts_with("account_id=") || p.starts_with("account="))
                    .and_then(|p| p.split('=').nth(1))
                    .map(percent_decode_str)
            });
            let query = uri.split('?').nth(1).and_then(|q| {
                q.split('&')
                    .find(|p| p.starts_with("query=") || p.starts_with("q="))
                    .and_then(|p| p.split('=').nth(1))
                    .map(percent_decode_str)
            });
            let limit = uri
                .split('?')
                .nth(1)
                .and_then(|q| {
                    q.split('&')
                        .find(|p| p.starts_with("limit="))
                        .and_then(|p| p.split('=').nth(1))
                        .and_then(|s| s.parse::<usize>().ok())
                })
                .unwrap_or(60);
            let offset = uri
                .split('?')
                .nth(1)
                .and_then(|q| {
                    q.split('&')
                        .find(|p| p.starts_with("offset="))
                        .and_then(|p| p.split('=').nth(1))
                        .and_then(|s| s.parse::<usize>().ok())
                })
                .unwrap_or(0);

            let contacts = self
                .sidecar
                .archive()
                .list_contacts(account_id.as_deref(), query.as_deref(), limit, offset)
                .unwrap_or_default();
            let total = self
                .sidecar
                .archive()
                .get_contacts_count(account_id.as_deref(), query.as_deref())
                .unwrap_or(contacts.len());

            let res = serde_json::json!({
                "contacts": contacts,
                "total": total,
                "account_id": account_id.unwrap_or_else(|| "all".to_string())
            });
            let json = serde_json::to_vec(&res).unwrap_or_else(|_| b"{}".to_vec());
            ("200 OK", "application/json", json)
        } else if method == "GET" && path.starts_with("/api/contacts/") && path.ends_with("/avatar")
        {
            let jid = path
                .trim_start_matches("/api/contacts/")
                .trim_end_matches("/avatar");
            let clean_jid = percent_decode_str(jid);
            let avatar = self
                .account_manager
                .get_contact_avatar_url(&clean_jid)
                .await
                .unwrap_or(None);
            let res = serde_json::json!({
                "jid": clean_jid,
                "avatar_url": avatar
            });
            let json = serde_json::to_vec(&res).unwrap_or_else(|_| b"{}".to_vec());
            ("200 OK", "application/json", json)
        } else if method == "GET"
            && path.starts_with("/api/contacts/")
            && path.ends_with("/avatar-image")
        {
            let jid = path
                .trim_start_matches("/api/contacts/")
                .trim_end_matches("/avatar-image");
            let clean_jid = percent_decode_str(jid);
            let avatar = self
                .account_manager
                .get_contact_avatar_url(&clean_jid)
                .await
                .unwrap_or(None);
            if let Some(url) = avatar {
                if let Ok(mut resp) = ureq::get(&url).call() {
                    let mut bytes = Vec::new();
                    if resp.body_mut().as_reader().read_to_end(&mut bytes).is_ok() {
                        return ("200 OK", "image/jpeg", bytes);
                    }
                }
            }
            ("404 Not Found", "text/plain", b"Avatar not found".to_vec())
        } else if method == "POST" && path == "/api/contacts/sync" {
            let account_id = uri.split('?').nth(1).and_then(|q| {
                q.split('&')
                    .find(|p| p.starts_with("account_id="))
                    .and_then(|p| p.split('=').nth(1))
                    .map(percent_decode_str)
            });

            let synced_result = if let Some(acc) = &account_id {
                if acc == "all" {
                    self.account_manager.sync_all_contacts().await
                } else {
                    self.account_manager.sync_account_contacts(Some(acc)).await
                }
            } else {
                self.account_manager.sync_all_contacts().await
            };

            match synced_result {
                Ok(count) => {
                    let res = serde_json::json!({ "success": true, "synced": count });
                    (
                        "200 OK",
                        "application/json",
                        serde_json::to_vec(&res).unwrap(),
                    )
                }
                Err(e) => (
                    "500 Internal Error",
                    "application/json",
                    format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                ),
            }
        } else if method == "POST" && path == "/api/messages/send" {
            let (recipient, message, account_id, attachments_list) = if let Some(body_start) =
                request_str.split("\r\n\r\n").nth(1)
            {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_start) {
                    let r = val
                        .get("recipient")
                        .or_else(|| val.get("jid"))
                        .or_else(|| val.get("phone"))
                        .or_else(|| val.get("to"))
                        .and_then(|t| t.as_str())
                        .map(ToString::to_string);
                    let m = val
                        .get("message")
                        .or_else(|| val.get("text"))
                        .and_then(|t| t.as_str())
                        .map(ToString::to_string);
                    let a = val
                        .get("account_id")
                        .or_else(|| val.get("account"))
                        .and_then(|t| t.as_str())
                        .map(ToString::to_string);
                    let mut atts = Vec::new();
                    if let Some(arr) = val
                        .get("attachments")
                        .or_else(|| val.get("files"))
                        .and_then(|v| v.as_array())
                    {
                        for item in arr {
                            atts.push(item.clone());
                        }
                    } else if let Some(att) = val.get("attachment").or_else(|| val.get("file")) {
                        if !att.is_null() {
                            atts.push(att.clone());
                        }
                    }
                    (r, m, a, atts)
                } else {
                    (None, None, None, Vec::new())
                }
            } else {
                (None, None, None, Vec::new())
            };

            let msg_text = message.as_deref().unwrap_or("");
            if let Some(rec) = recipient {
                if !msg_text.trim().is_empty() || !attachments_list.is_empty() {
                    let target_jid = if rec.contains('@') {
                        rec
                    } else if let Some((_, jid)) = crate::pacing::normalize_phone_number(&rec) {
                        jid
                    } else {
                        rec
                    };

                    match self
                        .account_manager
                        .get_account(account_id.as_deref())
                        .await
                    {
                        Ok(engine) => {
                            if !attachments_list.is_empty() {
                                use base64::Engine;
                                let mut last_msg_id = String::new();
                                for (idx, att_val) in attachments_list.iter().enumerate() {
                                    if idx > 0 {
                                        tokio::time::sleep(std::time::Duration::from_millis(600))
                                            .await;
                                    }
                                    let file_name = att_val
                                        .get("file_name")
                                        .or_else(|| att_val.get("fileName"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("attachment");
                                    let b64 = att_val
                                        .get("file_data")
                                        .or_else(|| att_val.get("fileDataB64"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("");
                                    let mime = att_val
                                        .get("mime_type")
                                        .or_else(|| att_val.get("mimeType"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("application/octet-stream");
                                    let send_as = att_val
                                        .get("send_as")
                                        .or_else(|| att_val.get("sendAs"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("media");
                                    let thumb_b64 = att_val
                                        .get("thumbnail_data")
                                        .or_else(|| att_val.get("thumbnailB64"))
                                        .and_then(|v| v.as_str());

                                    let clean_b64 = if let Some(pos) = b64.find(";base64,") {
                                        &b64[pos + 8..]
                                    } else {
                                        b64
                                    };

                                    let data = match base64::prelude::BASE64_STANDARD
                                        .decode(clean_b64)
                                    {
                                        Ok(d) => d,
                                        Err(e) => {
                                            return (
                                                "400 Bad Request",
                                                "application/json",
                                                format!(
                                                    r#"{{"error":"Failed to decode base64 for attachment #{}: {}"}}"#,
                                                    idx + 1,
                                                    e
                                                )
                                                .into_bytes(),
                                            );
                                        }
                                    };

                                    let thumbnail = thumb_b64.and_then(|tb| {
                                        let clean_tb = if let Some(pos) = tb.find(";base64,") {
                                            &tb[pos + 8..]
                                        } else {
                                            tb
                                        };
                                        base64::prelude::BASE64_STANDARD.decode(clean_tb).ok()
                                    });
                                    let as_document = send_as == "document"
                                        || (!mime.starts_with("image/")
                                            && !mime.starts_with("video/"));
                                    let caption = if idx == 0 && !msg_text.trim().is_empty() {
                                        Some(msg_text)
                                    } else {
                                        None
                                    };

                                    match engine
                                        .send_media(
                                            &target_jid,
                                            data,
                                            file_name,
                                            mime,
                                            caption,
                                            thumbnail,
                                            as_document,
                                        )
                                        .await
                                    {
                                        Ok(msg_id) => {
                                            last_msg_id = msg_id;
                                        }
                                        Err(e) => {
                                            return (
                                                "500 Internal Error",
                                                "application/json",
                                                format!(
                                                    r#"{{"error":"Failed to send attachment #{}: {}"}}"#,
                                                    idx + 1,
                                                    e
                                                )
                                                .into_bytes(),
                                            );
                                        }
                                    }
                                }

                                if !last_msg_id.is_empty() {
                                    let res = serde_json::json!({
                                        "success": true,
                                        "message_id": last_msg_id,
                                        "total_sent": attachments_list.len()
                                    });
                                    return (
                                        "200 OK",
                                        "application/json",
                                        serde_json::to_vec(&res).unwrap_or_default(),
                                    );
                                }
                            }
                            match engine.send_text(&target_jid, msg_text).await {
                                Ok(msg_id) => {
                                    let res = serde_json::json!({ "success": true, "message_id": msg_id });
                                    (
                                        "200 OK",
                                        "application/json",
                                        serde_json::to_vec(&res).unwrap(),
                                    )
                                }
                                Err(e) => (
                                    "500 Internal Error",
                                    "application/json",
                                    format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                                ),
                            }
                        }
                        Err(e) => (
                            "404 Not Found",
                            "application/json",
                            format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                        ),
                    }
                } else {
                    (
                        "400 Bad Request",
                        "application/json",
                        br#"{"error":"Message or attachment required"}"#.to_vec(),
                    )
                }
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Missing recipient"}"#.to_vec(),
                )
            }
        } else if method == "POST" && (path == "/api/campaigns/create" || path == "/api/campaigns")
        {
            if let Some(body_start) = request_str.split("\r\n\r\n").nth(1) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_start) {
                    let name = val.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let template_body = val
                        .get("template_body")
                        .or_else(|| val.get("template"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("Hello {name}");

                    let account_id =
                        if let Some(arr) = val.get("accounts").and_then(|v| v.as_array()) {
                            let list: Vec<String> = arr
                                .iter()
                                .filter_map(|v| v.as_str().map(ToString::to_string))
                                .collect();
                            if list.is_empty() {
                                "default".to_string()
                            } else {
                                list.join(", ")
                            }
                        } else {
                            val.get("account_id")
                                .or_else(|| val.get("account"))
                                .and_then(|v| v.as_str())
                                .unwrap_or("default")
                                .to_string()
                        };

                    let min_delay = val
                        .get("min_delay_secs")
                        .and_then(|v| v.as_u64())
                        .map(|n| n as u32)
                        .unwrap_or(20);
                    let max_delay = val
                        .get("max_delay_secs")
                        .and_then(|v| v.as_u64())
                        .map(|n| n as u32)
                        .unwrap_or(45);

                    let now = now_secs();
                    match self.sidecar.archive().create_campaign(
                        &account_id,
                        name,
                        template_body,
                        None,
                        min_delay,
                        max_delay,
                        None,
                        now,
                    ) {
                        Ok(id) => {
                            // Process initial attachments if passed
                            let mut current_atts = Vec::new();
                            if let Some(arr) = val
                                .get("files")
                                .or_else(|| val.get("attachments"))
                                .and_then(|v| v.as_array())
                            {
                                use base64::Engine;
                                let att_dir = self
                                    .account_manager
                                    .base_data_dir()
                                    .join("attachments")
                                    .join(id.to_string());
                                let _ = std::fs::create_dir_all(&att_dir);

                                for file_obj in arr {
                                    let file_name = file_obj
                                        .get("file_name")
                                        .or_else(|| file_obj.get("fileName"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("attachment.bin");
                                    let b64 = file_obj
                                        .get("file_data")
                                        .or_else(|| file_obj.get("fileDataB64"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("");
                                    let mime_type = file_obj
                                        .get("mime_type")
                                        .or_else(|| file_obj.get("mimeType"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("application/octet-stream");
                                    let send_as = file_obj
                                        .get("send_as")
                                        .or_else(|| file_obj.get("sendAs"))
                                        .and_then(|v| v.as_str())
                                        .map(ToString::to_string);
                                    let thumb_b64 = file_obj
                                        .get("thumbnail_data")
                                        .or_else(|| file_obj.get("thumbnailB64"))
                                        .and_then(|v| v.as_str());

                                    if let Ok(bytes) = base64::prelude::BASE64_STANDARD.decode(b64)
                                    {
                                        let file_path = att_dir.join(file_name);
                                        if std::fs::write(&file_path, &bytes).is_ok() {
                                            let mut thumbnail_path = None;
                                            if let Some(tb) = thumb_b64 {
                                                if let Ok(tb_bytes) =
                                                    base64::prelude::BASE64_STANDARD.decode(tb)
                                                {
                                                    let thumb_path =
                                                        file_path.with_extension("thumb.jpg");
                                                    if std::fs::write(&thumb_path, &tb_bytes)
                                                        .is_ok()
                                                    {
                                                        thumbnail_path = Some(
                                                            thumb_path
                                                                .to_string_lossy()
                                                                .to_string(),
                                                        );
                                                    }
                                                }
                                            }
                                            current_atts.push(crate::archive::CampaignAttachment {
                                                file_name: file_name.to_string(),
                                                file_path: file_path.to_string_lossy().to_string(),
                                                mime_type: mime_type.to_string(),
                                                file_size: bytes.len() as u64,
                                                thumbnail_path,
                                                send_as,
                                            });
                                        }
                                    }
                                }
                            }

                            if !current_atts.is_empty() {
                                let json_str =
                                    serde_json::to_string(&current_atts).unwrap_or_default();
                                let _ = self
                                    .sidecar
                                    .update_campaign_attachment(id, Some(&json_str))
                                    .await;
                            }

                            let res = serde_json::json!({
                                "success": true,
                                "id": id,
                                "campaign_id": id,
                                "name": name,
                                "account_id": account_id
                            });
                            return (
                                "200 OK",
                                "application/json",
                                serde_json::to_vec(&res).unwrap_or_default(),
                            );
                        }
                        Err(e) => {
                            return (
                                "500 Internal Error",
                                "application/json",
                                format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                            );
                        }
                    }
                }
            }
            (
                "400 Bad Request",
                "application/json",
                br#"{"error":"Invalid payload"}"#.to_vec(),
            )
        } else if method == "GET" && path == "/api/campaigns" {
            match self.sidecar.archive().list_campaigns(None, None) {
                Ok(campaigns) => {
                    let json = serde_json::to_vec(&campaigns).unwrap_or_else(|_| b"[]".to_vec());
                    ("200 OK", "application/json", json)
                }
                Err(e) => (
                    "500 Internal Error",
                    "application/json",
                    format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                ),
            }
        } else if method == "GET" && path.starts_with("/api/campaigns/") && path.ends_with("/runs")
        {
            let id_str = path
                .trim_start_matches("/api/campaigns/")
                .trim_end_matches("/runs");
            if let Ok(id) = id_str.parse::<i64>() {
                match self.sidecar.archive().list_runs_for_campaign(id) {
                    Ok(runs) => {
                        let json = serde_json::to_vec(&runs).unwrap_or_else(|_| b"[]".to_vec());
                        ("200 OK", "application/json", json)
                    }
                    Err(e) => (
                        "500 Internal Error",
                        "application/json",
                        format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                    ),
                }
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid ID"}"#.to_vec(),
                )
            }
        } else if method == "GET" && path.starts_with("/api/runs/") && path.ends_with("/logs") {
            let id_str = path
                .trim_start_matches("/api/runs/")
                .trim_end_matches("/logs");
            if let Ok(run_id) = id_str.parse::<i64>() {
                let query = uri.split('?').nth(1).and_then(|q| {
                    q.split('&')
                        .find(|p| p.starts_with("query=") || p.starts_with("q="))
                        .and_then(|p| p.split('=').nth(1))
                        .map(percent_decode_str)
                });
                let status = uri.split('?').nth(1).and_then(|q| {
                    q.split('&')
                        .find(|p| p.starts_with("status="))
                        .and_then(|p| p.split('=').nth(1))
                        .map(percent_decode_str)
                });
                let limit = uri
                    .split('?')
                    .nth(1)
                    .and_then(|q| {
                        q.split('&')
                            .find(|p| p.starts_with("limit="))
                            .and_then(|p| p.split('=').nth(1))
                            .and_then(|p| p.parse::<usize>().ok())
                    })
                    .unwrap_or(200);

                match self.sidecar.archive().list_logs_for_run(
                    run_id,
                    query.as_deref(),
                    status.as_deref(),
                    limit,
                ) {
                    Ok(logs) => {
                        let json = serde_json::to_vec(&logs).unwrap_or_else(|_| b"[]".to_vec());
                        ("200 OK", "application/json", json)
                    }
                    Err(e) => (
                        "500 Internal Error",
                        "application/json",
                        format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                    ),
                }
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid ID"}"#.to_vec(),
                )
            }
        } else if method == "GET"
            && path.starts_with("/api/campaigns/")
            && !path.contains("/attachment")
        {
            let id_str = path.trim_start_matches("/api/campaigns/");
            if let Ok(id) = id_str.parse::<i64>() {
                match self.sidecar.get_campaign_status(id).await {
                    Ok(details) => {
                        let json = serde_json::to_vec(&details).unwrap_or_else(|_| b"{}".to_vec());
                        ("200 OK", "application/json", json)
                    }
                    Err(e) => (
                        "404 Not Found",
                        "application/json",
                        format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                    ),
                }
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid ID"}"#.to_vec(),
                )
            }
        } else if (method == "POST" || method == "PUT")
            && path.starts_with("/api/campaigns/")
            && path.ends_with("/template")
        {
            let id_str = path
                .trim_start_matches("/api/campaigns/")
                .trim_end_matches("/template");
            if let Ok(id) = id_str.parse::<i64>() {
                let template_text = if let Some(query) = uri.split('?').nth(1) {
                    query
                        .split('&')
                        .find(|pair| {
                            pair.starts_with("template=") || pair.starts_with("template_body=")
                        })
                        .and_then(|pair| {
                            pair.strip_prefix("template=")
                                .or_else(|| pair.strip_prefix("template_body="))
                        })
                        .map(percent_decode_str)
                } else {
                    None
                }
                .or_else(|| {
                    if let Some(body_start) = request_str.split("\r\n\r\n").nth(1) {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_start) {
                            val.get("template")
                                .or_else(|| val.get("template_body"))
                                .and_then(|t| t.as_str())
                                .map(ToString::to_string)
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                });

                if let Some(tpl) = template_text {
                    match self.sidecar.update_campaign_template(id, &tpl).await {
                        Ok(_) => ("200 OK", "application/json", b"{\"success\":true}".to_vec()),
                        Err(e) => (
                            "400 Bad Request",
                            "application/json",
                            format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                        ),
                    }
                } else {
                    (
                        "400 Bad Request",
                        "application/json",
                        br#"{"error":"Missing template parameter"}"#.to_vec(),
                    )
                }
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid ID"}"#.to_vec(),
                )
            }
        } else if (method == "POST" || method == "PUT")
            && path.starts_with("/api/campaigns/")
            && path.ends_with("/rename")
        {
            let id_str = path
                .trim_start_matches("/api/campaigns/")
                .trim_end_matches("/rename");
            if let Ok(id) = id_str.parse::<i64>() {
                let name = if let Some(query) = uri.split('?').nth(1) {
                    query
                        .split('&')
                        .find(|pair| pair.starts_with("name="))
                        .and_then(|pair| pair.strip_prefix("name="))
                        .map(percent_decode_str)
                } else {
                    None
                }
                .or_else(|| {
                    if let Some(body_start) = request_str.split("\r\n\r\n").nth(1) {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_start) {
                            val.get("name")
                                .and_then(|t| t.as_str())
                                .map(ToString::to_string)
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                });

                if let Some(n) = name {
                    match self.sidecar.rename_campaign(id, &n).await {
                        Ok(_) => ("200 OK", "application/json", b"{\"success\":true}".to_vec()),
                        Err(e) => (
                            "400 Bad Request",
                            "application/json",
                            format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                        ),
                    }
                } else {
                    (
                        "400 Bad Request",
                        "application/json",
                        br#"{"error":"Missing name parameter"}"#.to_vec(),
                    )
                }
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid ID"}"#.to_vec(),
                )
            }
        } else if (method == "POST" || method == "PUT")
            && path.starts_with("/api/campaigns/")
            && path.ends_with("/delay-range")
        {
            let id_str = path
                .trim_start_matches("/api/campaigns/")
                .trim_end_matches("/delay-range");
            if let Ok(id) = id_str.parse::<i64>() {
                let mut min_delay = None;
                let mut max_delay = None;
                if let Some(body_start) = request_str.split("\r\n\r\n").nth(1) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_start) {
                        min_delay = val
                            .get("min_delay_secs")
                            .or_else(|| val.get("min"))
                            .and_then(|v| v.as_u64())
                            .map(|n| n as u32);
                        max_delay = val
                            .get("max_delay_secs")
                            .or_else(|| val.get("max"))
                            .and_then(|v| v.as_u64())
                            .map(|n| n as u32);
                    }
                }
                if min_delay.is_none() || max_delay.is_none() {
                    if let Some(query) = uri.split('?').nth(1) {
                        for pair in query.split('&') {
                            if pair.starts_with("min=") || pair.starts_with("min_delay_secs=") {
                                min_delay =
                                    pair.split('=').nth(1).and_then(|v| v.parse::<u32>().ok());
                            } else if pair.starts_with("max=")
                                || pair.starts_with("max_delay_secs=")
                            {
                                max_delay =
                                    pair.split('=').nth(1).and_then(|v| v.parse::<u32>().ok());
                            }
                        }
                    }
                }
                match (min_delay, max_delay) {
                    (Some(min), Some(max)) => {
                        if min > max {
                            (
                                "400 Bad Request",
                                "application/json",
                                br#"{"error":"min_delay_secs cannot exceed max_delay_secs"}"#
                                    .to_vec(),
                            )
                        } else {
                            match self.sidecar.update_campaign_delay_range(id, min, max).await {
                                Ok(_) => {
                                    ("200 OK", "application/json", b"{\"success\":true}".to_vec())
                                }
                                Err(e) => (
                                    "400 Bad Request",
                                    "application/json",
                                    format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                                ),
                            }
                        }
                    }
                    _ => (
                        "400 Bad Request",
                        "application/json",
                        br#"{"error":"Missing min_delay_secs or max_delay_secs"}"#.to_vec(),
                    ),
                }
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid ID"}"#.to_vec(),
                )
            }
        } else if (method == "POST" || method == "PUT")
            && path.starts_with("/api/campaigns/")
            && (path.ends_with("/senders/add") || path.ends_with("/senders/remove"))
        {
            let is_add = path.ends_with("/senders/add");
            let id_str = if is_add {
                path.trim_start_matches("/api/campaigns/")
                    .trim_end_matches("/senders/add")
            } else {
                path.trim_start_matches("/api/campaigns/")
                    .trim_end_matches("/senders/remove")
            };
            if let Ok(id) = id_str.parse::<i64>() {
                let mut account_id = None;
                if let Some(body_start) = request_str.split("\r\n\r\n").nth(1) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_start) {
                        account_id = val
                            .get("account_id")
                            .or_else(|| val.get("account"))
                            .and_then(|v| v.as_str())
                            .map(ToString::to_string);
                    }
                }
                if account_id.is_none() {
                    if let Some(query) = uri.split('?').nth(1) {
                        for pair in query.split('&') {
                            if pair.starts_with("account_id=") || pair.starts_with("account=") {
                                account_id = pair.split('=').nth(1).map(percent_decode_str);
                            }
                        }
                    }
                }
                if let Some(acc) = account_id {
                    let result = if is_add {
                        self.sidecar.add_campaign_sender(id, &acc).await
                    } else {
                        self.sidecar.remove_campaign_sender(id, &acc).await
                    };
                    match result {
                        Ok(pool) => (
                            "200 OK",
                            "application/json",
                            format!(r#"{{"success":true,"account_id":"{}"}}"#, pool).into_bytes(),
                        ),
                        Err(e) => (
                            "400 Bad Request",
                            "application/json",
                            format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                        ),
                    }
                } else {
                    (
                        "400 Bad Request",
                        "application/json",
                        br#"{"error":"Missing account_id parameter"}"#.to_vec(),
                    )
                }
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid ID"}"#.to_vec(),
                )
            }
        } else if method == "GET"
            && path.starts_with("/api/campaigns/")
            && (path.ends_with("/attachments/file") || path.ends_with("/attachment/file"))
        {
            let id_opt = path.split('/').nth(3).and_then(|s| s.parse::<i64>().ok());
            if let Some(id) = id_opt {
                if let Ok(Some(campaign)) = self.sidecar.archive().get_campaign(id) {
                    let attachments = crate::archive::parse_campaign_attachments(
                        campaign.attachment_path.as_deref(),
                    );
                    let req_name = uri.split('?').nth(1).and_then(|q| {
                        q.split('&')
                            .find(|p| p.starts_with("name=") || p.starts_with("file="))
                            .and_then(|p| p.split('=').nth(1))
                            .map(percent_decode_str)
                    });
                    let target_att = req_name
                        .as_deref()
                        .and_then(|n| attachments.iter().find(|a| a.file_name == n))
                        .or_else(|| attachments.first());

                    if let Some(att) = target_att {
                        let p = Path::new(&att.file_path);
                        if let Ok(bytes) = std::fs::read(p) {
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
                                "docx" => {
                                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                }
                                "xls" => "application/vnd.ms-excel",
                                "xlsx" => {
                                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                }
                                "txt" => "text/plain; charset=utf-8",
                                "csv" => "text/csv; charset=utf-8",
                                _ => "application/octet-stream",
                            };
                            return ("200 OK", mime, bytes);
                        }
                    }
                }
            }
            ("404 Not Found", "text/plain", b"File Not Found".to_vec())
        } else if method == "GET"
            && path.starts_with("/api/campaigns/")
            && (path.ends_with("/attachments/thumbnail") || path.ends_with("/attachment/thumbnail"))
        {
            let id_opt = path.split('/').nth(3).and_then(|s| s.parse::<i64>().ok());
            if let Some(id) = id_opt {
                if let Ok(Some(campaign)) = self.sidecar.archive().get_campaign(id) {
                    let attachments = crate::archive::parse_campaign_attachments(
                        campaign.attachment_path.as_deref(),
                    );
                    let req_name = uri.split('?').nth(1).and_then(|q| {
                        q.split('&')
                            .find(|p| p.starts_with("name=") || p.starts_with("file="))
                            .and_then(|p| p.split('=').nth(1))
                            .map(percent_decode_str)
                    });
                    let target_att = req_name
                        .as_deref()
                        .and_then(|n| attachments.iter().find(|a| a.file_name == n))
                        .or_else(|| attachments.first());

                    if let Some(att) = target_att {
                        if let Some(ref thumb_path) = att.thumbnail_path {
                            let p = Path::new(thumb_path);
                            if let Ok(bytes) = std::fs::read(p) {
                                return ("200 OK", "image/jpeg", bytes);
                            }
                        }
                    }
                }
            }
            (
                "404 Not Found",
                "text/plain",
                b"Thumbnail Not Found".to_vec(),
            )
        } else if method == "GET"
            && path.starts_with("/api/campaigns/")
            && (path.ends_with("/attachments") || path.ends_with("/attachment"))
        {
            let id_opt = path.split('/').nth(3).and_then(|s| s.parse::<i64>().ok());
            if let Some(id) = id_opt {
                if let Ok(Some(campaign)) = self.sidecar.archive().get_campaign(id) {
                    let attachments = crate::archive::parse_campaign_attachments(
                        campaign.attachment_path.as_deref(),
                    );
                    let json_items: Vec<serde_json::Value> = attachments
                        .iter()
                        .map(|a| {
                            serde_json::json!({
                                "file_name": a.file_name,
                                "file_size": a.file_size,
                                "mime_type": a.mime_type,
                                "send_as": a.send_as.as_deref().unwrap_or(if a.mime_type.starts_with("image/") || a.mime_type.starts_with("video/") { "media" } else { "document" }),
                                "url": format!("/api/campaigns/{}/attachments/file?name={}&v={}", id, percent_encode_str(&a.file_name), now_secs()),
                                "thumbnail_url": if a.thumbnail_path.is_some() {
                                    Some(format!("/api/campaigns/{}/attachments/thumbnail?name={}&v={}", id, percent_encode_str(&a.file_name), now_secs()))
                                } else {
                                    None
                                }
                            })
                        })
                        .collect();

                    let res = serde_json::json!({
                        "attachments": json_items,
                        "attachment": json_items.first()
                    });
                    return (
                        "200 OK",
                        "application/json",
                        serde_json::to_vec(&res).unwrap_or_default(),
                    );
                }
                let res = serde_json::json!({ "attachments": [], "attachment": null });
                return (
                    "200 OK",
                    "application/json",
                    serde_json::to_vec(&res).unwrap_or_default(),
                );
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid ID"}"#.to_vec(),
                )
            }
        } else if method == "POST"
            && path.starts_with("/api/campaigns/")
            && (path.ends_with("/attachments") || path.ends_with("/attachment"))
        {
            let id_opt = path.split('/').nth(3).and_then(|s| s.parse::<i64>().ok());
            if let Some(id) = id_opt {
                if let Some(body_start) = request_str.split("\r\n\r\n").nth(1) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_start) {
                        let att_dir = self
                            .account_manager
                            .base_data_dir()
                            .join("attachments")
                            .join(id.to_string());
                        let _ = std::fs::create_dir_all(&att_dir);

                        let current_camp = self.sidecar.archive().get_campaign(id).ok().flatten();
                        let mut current_atts = crate::archive::parse_campaign_attachments(
                            current_camp
                                .as_ref()
                                .and_then(|c| c.attachment_path.as_deref()),
                        );

                        let mut files_to_process = Vec::new();
                        if let Some(arr) = val.get("files").and_then(|v| v.as_array()) {
                            for item in arr {
                                files_to_process.push(item);
                            }
                        } else {
                            files_to_process.push(&val);
                        }

                        use base64::Engine;
                        for file_obj in files_to_process {
                            let file_name = file_obj
                                .get("file_name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("attachment.bin");
                            let file_data_b64 = file_obj
                                .get("file_data")
                                .and_then(|v| v.as_str())
                                .unwrap_or("");
                            let mime_type = file_obj
                                .get("mime_type")
                                .and_then(|v| v.as_str())
                                .unwrap_or("application/octet-stream");
                            let thumb_b64 = file_obj.get("thumbnail_data").and_then(|v| v.as_str());

                            if let Ok(bytes) =
                                base64::prelude::BASE64_STANDARD.decode(file_data_b64)
                            {
                                let file_path = att_dir.join(file_name);
                                if std::fs::write(&file_path, &bytes).is_ok() {
                                    let mut thumbnail_path = None;
                                    if let Some(tb) = thumb_b64 {
                                        if let Ok(tb_bytes) =
                                            base64::prelude::BASE64_STANDARD.decode(tb)
                                        {
                                            let thumb_path = file_path.with_extension("thumb.jpg");
                                            if std::fs::write(&thumb_path, &tb_bytes).is_ok() {
                                                thumbnail_path =
                                                    Some(thumb_path.to_string_lossy().to_string());
                                            }
                                        }
                                    }

                                    current_atts.retain(|a| a.file_name != file_name);
                                    let send_as = file_obj
                                        .get("send_as")
                                        .and_then(|v| v.as_str())
                                        .map(ToString::to_string);

                                    current_atts.retain(|a| a.file_name != file_name);
                                    current_atts.push(crate::archive::CampaignAttachment {
                                        file_name: file_name.to_string(),
                                        file_path: file_path.to_string_lossy().to_string(),
                                        mime_type: mime_type.to_string(),
                                        file_size: bytes.len() as u64,
                                        thumbnail_path,
                                        send_as,
                                    });
                                }
                            }
                        }

                        let json_str = serde_json::to_string(&current_atts).unwrap_or_default();
                        let _ = self
                            .sidecar
                            .update_campaign_attachment(id, Some(&json_str))
                            .await;

                        let json_items: Vec<serde_json::Value> = current_atts
                            .iter()
                            .map(|a| {
                                serde_json::json!({
                                    "file_name": a.file_name,
                                    "file_size": a.file_size,
                                    "mime_type": a.mime_type,
                                    "send_as": a.send_as.as_deref().unwrap_or(if a.mime_type.starts_with("image/") || a.mime_type.starts_with("video/") { "media" } else { "document" }),
                                    "url": format!("/api/campaigns/{}/attachments/file?name={}&v={}", id, percent_encode_str(&a.file_name), now_secs()),
                                    "thumbnail_url": if a.thumbnail_path.is_some() {
                                        Some(format!("/api/campaigns/{}/attachments/thumbnail?name={}&v={}", id, percent_encode_str(&a.file_name), now_secs()))
                                    } else {
                                        None
                                    }
                                })
                            })
                            .collect();

                        let res = serde_json::json!({
                            "success": true,
                            "attachments": json_items
                        });
                        return (
                            "200 OK",
                            "application/json",
                            serde_json::to_vec(&res).unwrap_or_default(),
                        );
                    }
                }
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Failed to upload attachments"}"#.to_vec(),
                )
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid ID"}"#.to_vec(),
                )
            }
        } else if method == "POST"
            && path.starts_with("/api/campaigns/")
            && path.ends_with("/attachments/mode")
        {
            let id_opt = path.split('/').nth(3).and_then(|s| s.parse::<i64>().ok());
            if let Some(id) = id_opt {
                if let Some(body_start) = request_str.split("\r\n\r\n").nth(1) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_start) {
                        let file_name = val.get("file_name").and_then(|v| v.as_str()).unwrap_or("");
                        let send_as = val
                            .get("send_as")
                            .and_then(|v| v.as_str())
                            .unwrap_or("media");

                        let current_camp = self.sidecar.archive().get_campaign(id).ok().flatten();
                        let mut current_atts = crate::archive::parse_campaign_attachments(
                            current_camp
                                .as_ref()
                                .and_then(|c| c.attachment_path.as_deref()),
                        );

                        if let Some(pos) =
                            current_atts.iter().position(|a| a.file_name == file_name)
                        {
                            current_atts[pos].send_as = Some(send_as.to_string());
                            let json_str = serde_json::to_string(&current_atts).unwrap_or_default();
                            let _ = self
                                .sidecar
                                .update_campaign_attachment(id, Some(&json_str))
                                .await;

                            let json_items: Vec<serde_json::Value> = current_atts
                                .iter()
                                .map(|a| {
                                    serde_json::json!({
                                        "file_name": a.file_name,
                                        "file_size": a.file_size,
                                        "mime_type": a.mime_type,
                                        "send_as": a.send_as.as_deref().unwrap_or(if a.mime_type.starts_with("image/") || a.mime_type.starts_with("video/") { "media" } else { "document" }),
                                        "url": format!("/api/campaigns/{}/attachments/file?name={}&v={}", id, percent_encode_str(&a.file_name), now_secs()),
                                        "thumbnail_url": if a.thumbnail_path.is_some() {
                                            Some(format!("/api/campaigns/{}/attachments/thumbnail?name={}&v={}", id, percent_encode_str(&a.file_name), now_secs()))
                                        } else {
                                            None
                                        }
                                    })
                                })
                                .collect();

                            let res = serde_json::json!({
                                "success": true,
                                "attachments": json_items
                            });
                            return (
                                "200 OK",
                                "application/json",
                                serde_json::to_vec(&res).unwrap_or_default(),
                            );
                        }
                    }
                }
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Failed to update mode"}"#.to_vec(),
                )
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid ID"}"#.to_vec(),
                )
            }
        } else if method == "POST"
            && path.starts_with("/api/campaigns/")
            && path.ends_with("/attachments/trim-video")
        {
            let id_opt = path.split('/').nth(3).and_then(|s| s.parse::<i64>().ok());
            if let Some(id) = id_opt {
                if let Some(body_start) = request_str.split("\r\n\r\n").nth(1) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_start) {
                        let file_name = val.get("file_name").and_then(|v| v.as_str()).unwrap_or("");
                        let start_time = val
                            .get("start_time")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0);
                        let end_time = val.get("end_time").and_then(|v| v.as_f64()).unwrap_or(30.0);
                        let mute = val.get("mute").and_then(|v| v.as_bool()).unwrap_or(false);
                        let preserve_hd = val
                            .get("preserve_hd")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(true);
                        let current_camp = self.sidecar.archive().get_campaign(id).ok().flatten();
                        let mut current_atts = crate::archive::parse_campaign_attachments(
                            current_camp
                                .as_ref()
                                .and_then(|c| c.attachment_path.as_deref()),
                        );

                        if let Some(pos) =
                            current_atts.iter().position(|a| a.file_name == file_name)
                        {
                            let input_path = PathBuf::from(&current_atts[pos].file_path);
                            if input_path.exists() {
                                let ext = input_path
                                    .extension()
                                    .and_then(|e| e.to_str())
                                    .unwrap_or("mp4");
                                let trimmed_name = format!("trimmed_{}_{}.{}", id, now_secs(), ext);
                                let output_path = input_path
                                    .parent()
                                    .unwrap_or(Path::new("."))
                                    .join(&trimmed_name);
                                let thumb_path = output_path.with_extension("thumb.jpg");
                                let dur = (end_time - start_time).max(0.5);

                                // Tier 1: Instant stream-copy (0.1s packet copy)
                                let mut copy_cmd = tokio::process::Command::new("ffmpeg");
                                copy_cmd
                                    .arg("-nostdin")
                                    .arg("-y")
                                    .arg("-ss")
                                    .arg(format!("{:.2}", start_time))
                                    .arg("-i")
                                    .arg(&input_path)
                                    .arg("-t")
                                    .arg(format!("{:.2}", dur))
                                    .arg("-c:v")
                                    .arg("copy");
                                if mute {
                                    copy_cmd.arg("-an");
                                } else {
                                    copy_cmd.arg("-c:a").arg("copy");
                                }
                                copy_cmd
                                    .arg("-movflags")
                                    .arg("+faststart")
                                    .arg(&output_path)
                                    .stdin(std::process::Stdio::null())
                                    .stdout(std::process::Stdio::null())
                                    .stderr(std::process::Stdio::null());

                                let mut trim_succeeded = false;
                                if let Ok(Ok(status)) = tokio::time::timeout(
                                    std::time::Duration::from_secs(12),
                                    copy_cmd.status(),
                                )
                                .await
                                {
                                    if status.success() {
                                        let size = std::fs::metadata(&output_path)
                                            .map(|m| m.len())
                                            .unwrap_or(0);
                                        if size > 0 {
                                            trim_succeeded = true;
                                        }
                                    }
                                }

                                // Tier 2: Ultra-fast 30fps CRF 26 rate-controlled encoder if size exceeds 16MB
                                if !trim_succeeded {
                                    let target_kbps =
                                        ((14.5 * 1024.0 * 8.0) / dur).min(3000.0) as u32;
                                    let mut encode_cmd = tokio::process::Command::new("ffmpeg");
                                    encode_cmd
                                        .arg("-nostdin")
                                        .arg("-y")
                                        .arg("-ss")
                                        .arg(format!("{:.2}", start_time))
                                        .arg("-i")
                                        .arg(&input_path)
                                        .arg("-t")
                                        .arg(format!("{:.2}", dur));
                                    if preserve_hd {
                                        encode_cmd
                                            .arg("-c:v")
                                            .arg("libx264")
                                            .arg("-preset")
                                            .arg("ultrafast")
                                            .arg("-crf")
                                            .arg("22")
                                            .arg("-maxrate")
                                            .arg(format!("{}k", target_kbps.max(3500)))
                                            .arg("-bufsize")
                                            .arg(format!("{}k", target_kbps.max(3500) * 2));
                                    } else {
                                        encode_cmd
                                            .arg("-r")
                                            .arg("30")
                                            .arg("-c:v")
                                            .arg("libx264")
                                            .arg("-preset")
                                            .arg("ultrafast")
                                            .arg("-crf")
                                            .arg("26")
                                            .arg("-maxrate")
                                            .arg(format!("{}k", target_kbps))
                                            .arg("-bufsize")
                                            .arg(format!("{}k", target_kbps * 2));
                                    }
                                    if mute {
                                        encode_cmd.arg("-an");
                                    } else {
                                        encode_cmd.arg("-c:a").arg("aac").arg("-b:a").arg("96k");
                                    }
                                    encode_cmd
                                        .arg("-movflags")
                                        .arg("+faststart")
                                        .arg(&output_path)
                                        .stdin(std::process::Stdio::null())
                                        .stdout(std::process::Stdio::null())
                                        .stderr(std::process::Stdio::null());

                                    if let Ok(Ok(status)) = tokio::time::timeout(
                                        std::time::Duration::from_secs(30),
                                        encode_cmd.status(),
                                    )
                                    .await
                                    {
                                        trim_succeeded = status.success();
                                    }
                                }

                                if trim_succeeded {
                                    let mut thumb_cmd = tokio::process::Command::new("ffmpeg");
                                    thumb_cmd
                                        .arg("-nostdin")
                                        .arg("-y")
                                        .arg("-ss")
                                        .arg("0")
                                        .arg("-i")
                                        .arg(&output_path)
                                        .arg("-vframes")
                                        .arg("1")
                                        .arg("-q:v")
                                        .arg("2")
                                        .arg(&thumb_path)
                                        .stdin(std::process::Stdio::null())
                                        .stdout(std::process::Stdio::null())
                                        .stderr(std::process::Stdio::null());
                                    let _ = tokio::time::timeout(
                                        std::time::Duration::from_secs(5),
                                        thumb_cmd.status(),
                                    )
                                    .await;

                                    let new_size = std::fs::metadata(&output_path)
                                        .map(|m| m.len())
                                        .unwrap_or(0);
                                    let _ = std::fs::remove_file(&input_path);
                                    if let Some(ref old_tp) = current_atts[pos].thumbnail_path {
                                        let _ = std::fs::remove_file(old_tp);
                                    }

                                    current_atts[pos].file_name = trimmed_name.clone();
                                    current_atts[pos].file_path =
                                        output_path.to_string_lossy().to_string();
                                    current_atts[pos].file_size = new_size;
                                    current_atts[pos].mime_type = "video/mp4".to_string();
                                    current_atts[pos].thumbnail_path = if thumb_path.exists() {
                                        Some(thumb_path.to_string_lossy().to_string())
                                    } else {
                                        None
                                    };

                                    let json_str =
                                        serde_json::to_string(&current_atts).unwrap_or_default();
                                    let _ = self
                                        .sidecar
                                        .update_campaign_attachment(id, Some(&json_str))
                                        .await;

                                    let json_items: Vec<serde_json::Value> = current_atts
                                        .iter()
                                        .map(|a| {
                                            serde_json::json!({
                                                "file_name": a.file_name,
                                                "file_size": a.file_size,
                                                "mime_type": a.mime_type,
                                                "url": format!("/api/campaigns/{}/attachments/file?name={}&v={}", id, percent_encode_str(&a.file_name), now_secs()),
                                                "thumbnail_url": if a.thumbnail_path.is_some() {
                                                    Some(format!("/api/campaigns/{}/attachments/thumbnail?name={}&v={}", id, percent_encode_str(&a.file_name), now_secs()))
                                                } else {
                                                    None
                                                }
                                            })
                                        })
                                        .collect();

                                    let res = serde_json::json!({
                                        "success": true,
                                        "attachments": json_items
                                    });
                                    return (
                                        "200 OK",
                                        "application/json",
                                        serde_json::to_vec(&res).unwrap_or_default(),
                                    );
                                }
                            }
                        }
                    }
                }
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Failed to trim video"}"#.to_vec(),
                )
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid ID"}"#.to_vec(),
                )
            }
        } else if method == "POST" && (path == "/api/trim-video" || path == "/api/videos/trim") {
            if let Some(body_start) = request_str.split("\r\n\r\n").nth(1) {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_start) {
                    let file_name = val
                        .get("file_name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("video.mp4");
                    let b64 = val.get("file_data").and_then(|v| v.as_str()).unwrap_or("");
                    let start_time = val
                        .get("start_time")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.0);
                    let end_time = val.get("end_time").and_then(|v| v.as_f64()).unwrap_or(30.0);
                    let mute = val.get("mute").and_then(|v| v.as_bool()).unwrap_or(false);
                    let preserve_hd = val
                        .get("preserve_hd")
                        .and_then(|v| v.as_bool())
                        .unwrap_or(true);
                    use base64::Engine;
                    let clean_b64 = if let Some(pos) = b64.find(";base64,") {
                        &b64[pos + 8..]
                    } else {
                        b64
                    };
                    if let Ok(data) = base64::prelude::BASE64_STANDARD.decode(clean_b64) {
                        let temp_dir = PathBuf::from("data").join("temp");
                        let _ = std::fs::create_dir_all(&temp_dir);
                        let now = now_secs();
                        let ext = Path::new(file_name)
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("mp4");
                        let input_path =
                            temp_dir.join(format!("dm_in_{}_{}.{}", now, std::process::id(), ext));
                        let output_path =
                            temp_dir.join(format!("dm_out_{}_{}.mp4", now, std::process::id()));
                        let thumb_path =
                            temp_dir.join(format!("dm_thumb_{}_{}.jpg", now, std::process::id()));

                        if std::fs::write(&input_path, &data).is_ok() {
                            let dur = (end_time - start_time).max(0.5);

                            // Tier 1: Instant stream-copy (0.1s packet copy)
                            let mut copy_cmd = tokio::process::Command::new("ffmpeg");
                            copy_cmd
                                .arg("-nostdin")
                                .arg("-y")
                                .arg("-ss")
                                .arg(format!("{:.2}", start_time))
                                .arg("-i")
                                .arg(&input_path)
                                .arg("-t")
                                .arg(format!("{:.2}", dur))
                                .arg("-c:v")
                                .arg("copy");
                            if mute {
                                copy_cmd.arg("-an");
                            } else {
                                copy_cmd.arg("-c:a").arg("copy");
                            }
                            copy_cmd
                                .arg("-movflags")
                                .arg("+faststart")
                                .arg(&output_path)
                                .stdin(std::process::Stdio::null())
                                .stdout(std::process::Stdio::null())
                                .stderr(std::process::Stdio::null());

                            let mut trim_succeeded = false;
                            if let Ok(Ok(status)) = tokio::time::timeout(
                                std::time::Duration::from_secs(12),
                                copy_cmd.status(),
                            )
                            .await
                            {
                                if status.success() {
                                    let size = std::fs::metadata(&output_path)
                                        .map(|m| m.len())
                                        .unwrap_or(0);
                                    if size > 0 {
                                        trim_succeeded = true;
                                    }
                                }
                            }

                            // Tier 2: Ultra-fast 30fps CRF 22/26 rate-controlled encoder if size exceeds 16MB or stream-copy failed
                            if !trim_succeeded {
                                let target_kbps = ((14.5 * 1024.0 * 8.0) / dur).min(3000.0) as u32;
                                let mut encode_cmd = tokio::process::Command::new("ffmpeg");
                                encode_cmd
                                    .arg("-nostdin")
                                    .arg("-y")
                                    .arg("-ss")
                                    .arg(format!("{:.2}", start_time))
                                    .arg("-i")
                                    .arg(&input_path)
                                    .arg("-t")
                                    .arg(format!("{:.2}", dur));
                                if preserve_hd {
                                    encode_cmd
                                        .arg("-c:v")
                                        .arg("libx264")
                                        .arg("-preset")
                                        .arg("ultrafast")
                                        .arg("-crf")
                                        .arg("22")
                                        .arg("-maxrate")
                                        .arg(format!("{}k", target_kbps.max(3500)))
                                        .arg("-bufsize")
                                        .arg(format!("{}k", target_kbps.max(3500) * 2));
                                } else {
                                    encode_cmd
                                        .arg("-r")
                                        .arg("30")
                                        .arg("-c:v")
                                        .arg("libx264")
                                        .arg("-preset")
                                        .arg("ultrafast")
                                        .arg("-crf")
                                        .arg("26")
                                        .arg("-maxrate")
                                        .arg(format!("{}k", target_kbps))
                                        .arg("-bufsize")
                                        .arg(format!("{}k", target_kbps * 2));
                                }
                                if mute {
                                    encode_cmd.arg("-an");
                                } else {
                                    encode_cmd.arg("-c:a").arg("aac").arg("-b:a").arg("96k");
                                }
                                encode_cmd
                                    .arg("-movflags")
                                    .arg("+faststart")
                                    .arg(&output_path)
                                    .stdin(std::process::Stdio::null())
                                    .stdout(std::process::Stdio::null())
                                    .stderr(std::process::Stdio::null());

                                if let Ok(Ok(status)) = tokio::time::timeout(
                                    std::time::Duration::from_secs(30),
                                    encode_cmd.status(),
                                )
                                .await
                                {
                                    trim_succeeded = status.success();
                                }
                            }

                            if trim_succeeded {
                                // Extract frame thumbnail
                                let mut thumb_cmd = tokio::process::Command::new("ffmpeg");
                                thumb_cmd
                                    .arg("-nostdin")
                                    .arg("-y")
                                    .arg("-ss")
                                    .arg("0")
                                    .arg("-i")
                                    .arg(&output_path)
                                    .arg("-vframes")
                                    .arg("1")
                                    .arg("-q:v")
                                    .arg("2")
                                    .arg(&thumb_path)
                                    .stdin(std::process::Stdio::null())
                                    .stdout(std::process::Stdio::null())
                                    .stderr(std::process::Stdio::null());
                                let _ = tokio::time::timeout(
                                    std::time::Duration::from_secs(5),
                                    thumb_cmd.status(),
                                )
                                .await;

                                let new_bytes = std::fs::read(&output_path).unwrap_or_default();
                                let new_b64 = base64::prelude::BASE64_STANDARD.encode(&new_bytes);
                                let thumb_b64 = if thumb_path.exists() {
                                    let tb = std::fs::read(&thumb_path).unwrap_or_default();
                                    Some(base64::prelude::BASE64_STANDARD.encode(&tb))
                                } else {
                                    None
                                };

                                let trimmed_name = format!("trimmed_{}", file_name);
                                let res = serde_json::json!({
                                    "success": true,
                                    "file_data": new_b64,
                                    "file_size": new_bytes.len(),
                                    "thumbnail_data": thumb_b64,
                                    "file_name": trimmed_name
                                });

                                let _ = std::fs::remove_file(&input_path);
                                let _ = std::fs::remove_file(&output_path);
                                let _ = std::fs::remove_file(&thumb_path);

                                return (
                                    "200 OK",
                                    "application/json",
                                    serde_json::to_vec(&res).unwrap_or_default(),
                                );
                            } else {
                                let _ = std::fs::remove_file(&input_path);
                                let _ = std::fs::remove_file(&output_path);
                                let _ = std::fs::remove_file(&thumb_path);
                            }
                        }
                    }
                }
            }
            (
                "400 Bad Request",
                "application/json",
                br#"{"error":"Failed to trim video"}"#.to_vec(),
            )
        } else if method == "POST"
            && path.starts_with("/api/campaigns/")
            && path.ends_with("/attachments/capture-frame")
        {
            let id_opt = path.split('/').nth(3).and_then(|s| s.parse::<i64>().ok());
            if let Some(id) = id_opt {
                if let Some(body_start) = request_str.split("\r\n\r\n").nth(1) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_start) {
                        let file_name = val.get("file_name").and_then(|v| v.as_str()).unwrap_or("");
                        let frame_time = val
                            .get("frame_time")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0);
                        let as_photo = val
                            .get("as_photo")
                            .and_then(|v| v.as_bool())
                            .unwrap_or(false);

                        let current_camp = self.sidecar.archive().get_campaign(id).ok().flatten();
                        let mut current_atts = crate::archive::parse_campaign_attachments(
                            current_camp
                                .as_ref()
                                .and_then(|c| c.attachment_path.as_deref()),
                        );

                        if let Some(pos) =
                            current_atts.iter().position(|a| a.file_name == file_name)
                        {
                            let input_path = PathBuf::from(&current_atts[pos].file_path);
                            if input_path.exists() {
                                let frame_name = if as_photo {
                                    format!("frame_{}_{}.jpg", id, now_secs())
                                } else {
                                    format!("{}.thumb.jpg", file_name)
                                };
                                let frame_path = input_path
                                    .parent()
                                    .unwrap_or(Path::new("."))
                                    .join(&frame_name);
                                use base64::Engine;
                                let mut frame_saved = false;
                                if let Some(b64) = val.get("image_data").and_then(|v| v.as_str()) {
                                    let raw_b64 = b64.split(',').nth(1).unwrap_or(b64);
                                    if let Ok(bytes) =
                                        base64::prelude::BASE64_STANDARD.decode(raw_b64)
                                    {
                                        if std::fs::write(&frame_path, &bytes).is_ok() {
                                            frame_saved = true;
                                        }
                                    }
                                }

                                if !frame_saved {
                                    let mut cmd = tokio::process::Command::new("ffmpeg");
                                    cmd.arg("-nostdin")
                                        .arg("-y")
                                        .arg("-ss")
                                        .arg(format!("{:.2}", frame_time))
                                        .arg("-i")
                                        .arg(&input_path)
                                        .arg("-vframes")
                                        .arg("1")
                                        .arg("-q:v")
                                        .arg("2")
                                        .arg(&frame_path)
                                        .stdin(std::process::Stdio::null())
                                        .stdout(std::process::Stdio::null())
                                        .stderr(std::process::Stdio::null());
                                    if let Ok(Ok(status)) = tokio::time::timeout(
                                        std::time::Duration::from_secs(8),
                                        cmd.status(),
                                    )
                                    .await
                                    {
                                        frame_saved = status.success();
                                    }
                                }

                                if frame_saved {
                                    let frame_size = std::fs::metadata(&frame_path)
                                        .map(|m| m.len())
                                        .unwrap_or(0);
                                    if as_photo {
                                        current_atts.push(crate::archive::CampaignAttachment {
                                            file_name: frame_name.clone(),
                                            file_path: frame_path.to_string_lossy().to_string(),
                                            mime_type: "image/jpeg".to_string(),
                                            file_size: frame_size,
                                            thumbnail_path: None,
                                            send_as: Some("media".to_string()),
                                        });
                                    } else {
                                        current_atts[pos].thumbnail_path =
                                            Some(frame_path.to_string_lossy().to_string());
                                    }

                                    let json_str =
                                        serde_json::to_string(&current_atts).unwrap_or_default();
                                    let _ = self
                                        .sidecar
                                        .update_campaign_attachment(id, Some(&json_str))
                                        .await;

                                    let json_items: Vec<serde_json::Value> = current_atts
                                            .iter()
                                            .map(|a| {
                                                serde_json::json!({
                                                    "file_name": a.file_name,
                                                    "file_size": a.file_size,
                                                    "mime_type": a.mime_type,
                                                    "url": format!("/api/campaigns/{}/attachments/file?name={}&v={}", id, percent_encode_str(&a.file_name), now_secs()),
                                                    "thumbnail_url": if a.thumbnail_path.is_some() {
                                                        Some(format!("/api/campaigns/{}/attachments/thumbnail?name={}&v={}", id, percent_encode_str(&a.file_name), now_secs()))
                                                    } else {
                                                        None
                                                    }
                                                })
                                            })
                                            .collect();

                                    let res = serde_json::json!({
                                        "success": true,
                                        "attachments": json_items
                                    });
                                    return (
                                        "200 OK",
                                        "application/json",
                                        serde_json::to_vec(&res).unwrap_or_default(),
                                    );
                                }
                            }
                        }
                    }
                }
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Failed to capture frame"}"#.to_vec(),
                )
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid ID"}"#.to_vec(),
                )
            }
        } else if method == "DELETE"
            && path.starts_with("/api/campaigns/")
            && (path.ends_with("/attachments") || path.ends_with("/attachment"))
        {
            let id_opt = path.split('/').nth(3).and_then(|s| s.parse::<i64>().ok());
            if let Some(id) = id_opt {
                let req_name = uri.split('?').nth(1).and_then(|q| {
                    q.split('&')
                        .find(|p| p.starts_with("name=") || p.starts_with("file="))
                        .and_then(|p| p.split('=').nth(1))
                        .map(percent_decode_str)
                });

                let current_camp = self.sidecar.archive().get_campaign(id).ok().flatten();
                let mut current_atts = crate::archive::parse_campaign_attachments(
                    current_camp
                        .as_ref()
                        .and_then(|c| c.attachment_path.as_deref()),
                );

                if let Some(ref name_to_del) = req_name {
                    if let Some(pos) = current_atts
                        .iter()
                        .position(|a| a.file_name == *name_to_del)
                    {
                        let att = current_atts.remove(pos);
                        let _ = std::fs::remove_file(&att.file_path);
                        if let Some(ref tp) = att.thumbnail_path {
                            let _ = std::fs::remove_file(tp);
                        }
                    }
                    if current_atts.is_empty() {
                        let _ = self.sidecar.update_campaign_attachment(id, None).await;
                    } else {
                        let json_str = serde_json::to_string(&current_atts).unwrap_or_default();
                        let _ = self
                            .sidecar
                            .update_campaign_attachment(id, Some(&json_str))
                            .await;
                    }
                } else {
                    let att_dir = self
                        .account_manager
                        .base_data_dir()
                        .join("attachments")
                        .join(id.to_string());
                    let _ = std::fs::remove_dir_all(&att_dir);
                    let _ = self.sidecar.update_campaign_attachment(id, None).await;
                }

                (
                    "200 OK",
                    "application/json",
                    br#"{"success":true}"#.to_vec(),
                )
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid ID"}"#.to_vec(),
                )
            }
        } else if (method == "POST" || method == "DELETE")
            && path.starts_with("/api/campaigns/")
            && (path.ends_with("/recipients/delete")
                || (method == "DELETE" && path.ends_with("/recipients")))
        {
            let id_str = path
                .trim_start_matches("/api/campaigns/")
                .trim_end_matches("/recipients/delete")
                .trim_end_matches("/recipients");
            if let Ok(id) = id_str.parse::<i64>() {
                let mut ids: Vec<i64> = Vec::new();
                if let Some(body_start) = request_str.split("\r\n\r\n").nth(1) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_start) {
                        if let Some(arr) = val
                            .get("recipient_ids")
                            .or_else(|| val.get("ids"))
                            .and_then(|v| v.as_array())
                        {
                            for item in arr {
                                if let Some(n) = item.as_i64() {
                                    ids.push(n);
                                }
                            }
                        } else if let Some(arr) = val.as_array() {
                            for item in arr {
                                if let Some(n) = item.as_i64() {
                                    ids.push(n);
                                }
                            }
                        }
                        if let Some(n) = val
                            .get("recipient_id")
                            .or_else(|| val.get("id"))
                            .and_then(|v| v.as_i64())
                        {
                            if !ids.contains(&n) {
                                ids.push(n);
                            }
                        }
                    }
                }
                if ids.is_empty() {
                    if let Some(query) = uri.split('?').nth(1) {
                        if let Some(raw_ids) = query
                            .split('&')
                            .find(|p| {
                                p.starts_with("ids=")
                                    || p.starts_with("recipient_ids=")
                                    || p.starts_with("id=")
                                    || p.starts_with("recipient_id=")
                            })
                            .and_then(|p| p.split('=').nth(1))
                        {
                            for part in raw_ids.split(',') {
                                if let Ok(n) = part.parse::<i64>() {
                                    ids.push(n);
                                }
                            }
                        }
                    }
                }
                if ids.is_empty() {
                    return (
                        "400 Bad Request",
                        "application/json",
                        br#"{"error":"No recipient IDs provided to delete"}"#.to_vec(),
                    );
                }
                match self.sidecar.delete_campaign_recipients(id, &ids).await {
                    Ok(deleted) => (
                        "200 OK",
                        "application/json",
                        format!(r#"{{"success":true,"deleted":{}}}"#, deleted).into_bytes(),
                    ),
                    Err(e) => (
                        "400 Bad Request",
                        "application/json",
                        format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                    ),
                }
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid ID"}"#.to_vec(),
                )
            }
        } else if (method == "POST" || method == "GET")
            && path.starts_with("/api/campaigns/")
            && path.contains("/recipients/")
            && path.ends_with("/resend")
        {
            let rest = path.trim_start_matches("/api/campaigns/");
            let mut parts = rest.split('/');
            let camp_id_str = parts.next().unwrap_or("");
            let _recipients_kw = parts.next();
            let rec_id_str = parts.next().unwrap_or("");

            if let (Ok(camp_id), Ok(rec_id)) =
                (camp_id_str.parse::<i64>(), rec_id_str.parse::<i64>())
            {
                match self.sidecar.resend_recipient(camp_id, rec_id).await {
                    Ok(_) => (
                        "200 OK",
                        "application/json",
                        format!(
                            r#"{{"success":true,"campaign_id":{},"recipient_id":{}}}"#,
                            camp_id, rec_id
                        )
                        .into_bytes(),
                    ),
                    Err(e) => (
                        "400 Bad Request",
                        "application/json",
                        format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                    ),
                }
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid campaign or recipient ID"}"#.to_vec(),
                )
            }
        } else if (method == "POST" || method == "PUT")
            && path.starts_with("/api/campaigns/")
            && path.ends_with("/recipients")
        {
            let id_str = path
                .trim_start_matches("/api/campaigns/")
                .trim_end_matches("/recipients");
            if let Ok(id) = id_str.parse::<i64>() {
                let mut recipients: Vec<crate::archive::NewRecipient> = Vec::new();
                let mut seen_keys = std::collections::HashSet::new();
                if let Some(body_start) = request_str.split("\r\n\r\n").nth(1) {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(body_start) {
                        if let Some(arr) = val.get("recipients").and_then(|v| v.as_array()) {
                            for item in arr {
                                let mut jid = item
                                    .get("jid")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or_default()
                                    .trim()
                                    .to_string();
                                let phone_number = item
                                    .get("phone_number")
                                    .and_then(|v| v.as_str())
                                    .unwrap_or_default()
                                    .trim()
                                    .to_string();

                                if jid.is_empty() && !phone_number.is_empty() {
                                    if let Some((_, norm_jid)) =
                                        crate::pacing::normalize_phone_number(&phone_number)
                                    {
                                        jid = norm_jid;
                                    } else {
                                        let digits: String = phone_number
                                            .chars()
                                            .filter(|c| c.is_ascii_digit())
                                            .collect();
                                        if !digits.is_empty() {
                                            jid = format!("{}@s.whatsapp.net", digits);
                                        }
                                    }
                                }
                                let display_name = item
                                    .get("display_name")
                                    .and_then(|v| v.as_str())
                                    .map(ToString::to_string);
                                let custom_fields_json = item
                                    .get("custom_fields_json")
                                    .and_then(|v| v.as_str())
                                    .map(ToString::to_string);
                                if (!jid.is_empty() || !phone_number.is_empty())
                                    && seen_keys.insert((jid.clone(), phone_number.clone()))
                                {
                                    recipients.push(crate::archive::NewRecipient {
                                        jid,
                                        phone_number,
                                        display_name,
                                        custom_fields_json,
                                    });
                                }
                            }
                        }
                    }
                }
                match self.sidecar.add_campaign_recipients(id, &recipients).await {
                    Ok(_) => (
                        "200 OK",
                        "application/json",
                        format!(r#"{{"success":true,"added":{}}}"#, recipients.len()).into_bytes(),
                    ),
                    Err(e) => (
                        "400 Bad Request",
                        "application/json",
                        format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                    ),
                }
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid ID"}"#.to_vec(),
                )
            }
        } else if method == "GET"
            && path.starts_with("/api/campaigns/")
            && path.ends_with("/recipients")
        {
            let id_str = path
                .trim_start_matches("/api/campaigns/")
                .trim_end_matches("/recipients");
            if let Ok(id) = id_str.parse::<i64>() {
                let query = uri.split('?').nth(1).and_then(|q| {
                    q.split('&')
                        .find(|p| p.starts_with("query=") || p.starts_with("q="))
                        .and_then(|p| p.split('=').nth(1))
                        .map(percent_decode_str)
                });
                let status = uri.split('?').nth(1).and_then(|q| {
                    q.split('&')
                        .find(|p| p.starts_with("status="))
                        .and_then(|p| p.split('=').nth(1))
                        .map(percent_decode_str)
                });
                let limit = uri
                    .split('?')
                    .nth(1)
                    .and_then(|q| {
                        q.split('&')
                            .find(|p| p.starts_with("limit="))
                            .and_then(|p| p.split('=').nth(1))
                            .and_then(|p| p.parse::<usize>().ok())
                    })
                    .unwrap_or(50);
                let offset = uri
                    .split('?')
                    .nth(1)
                    .and_then(|q| {
                        q.split('&')
                            .find(|p| p.starts_with("offset="))
                            .and_then(|p| p.split('=').nth(1))
                            .and_then(|p| p.parse::<usize>().ok())
                    })
                    .unwrap_or(0);

                match self
                    .sidecar
                    .list_campaign_recipients(
                        id,
                        query.as_deref(),
                        status.as_deref(),
                        limit,
                        offset,
                    )
                    .await
                {
                    Ok(recipients) => {
                        let json =
                            serde_json::to_vec(&recipients).unwrap_or_else(|_| b"[]".to_vec());
                        ("200 OK", "application/json", json)
                    }
                    Err(e) => (
                        "500 Internal Error",
                        "application/json",
                        format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                    ),
                }
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Invalid ID"}"#.to_vec(),
                )
            }
        } else if (method == "POST" || method == "GET") && path.starts_with("/api/control/") {
            let segments: Vec<&str> = path
                .trim_start_matches("/api/control/")
                .split('/')
                .collect();
            if segments.len() >= 2 {
                if let Ok(id) = segments[0].parse::<i64>() {
                    let action = segments[1];
                    match self.sidecar.control_campaign(id, action).await {
                        Ok(_) => (
                            "200 OK",
                            "application/json",
                            format!(r#"{{"success":true,"id":{},"action":"{}"}}"#, id, action)
                                .into_bytes(),
                        ),
                        Err(e) => (
                            "400 Bad Request",
                            "application/json",
                            format!(r#"{{"error":"{}"}}"#, e).into_bytes(),
                        ),
                    }
                } else {
                    (
                        "400 Bad Request",
                        "application/json",
                        br#"{"error":"Invalid ID"}"#.to_vec(),
                    )
                }
            } else {
                (
                    "400 Bad Request",
                    "application/json",
                    br#"{"error":"Missing parameters"}"#.to_vec(),
                )
            }
        } else {
            ("404 Not Found", "text/plain", b"Not Found".to_vec())
        }
    }
}
fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn percent_decode_str(input: &str) -> String {
    let replaced = input.replace('+', " ");
    let mut bytes = Vec::new();
    let mut chars = replaced.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            let h1 = chars.next();
            let h2 = chars.next();
            if let (Some(c1), Some(c2)) = (h1, h2) {
                let hex_str = format!("{}{}", c1, c2);
                if let Ok(b) = u8::from_str_radix(&hex_str, 16) {
                    bytes.push(b);
                    continue;
                }
            }
        }
        let mut b = [0u8; 4];
        let s = c.encode_utf8(&mut b);
        bytes.extend_from_slice(s.as_bytes());
    }
    String::from_utf8_lossy(&bytes).to_string()
}

pub fn percent_encode_str(input: &str) -> String {
    let mut encoded = String::new();
    for b in input.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
            encoded.push(b as char);
        } else {
            encoded.push_str(&format!("%{:02X}", b));
        }
    }
    encoded
}
fn get_content_type(path: &str) -> &'static str {
    if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".js") {
        "application/javascript; charset=utf-8"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".ico") {
        "image/x-icon"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".woff2") {
        "font/woff2"
    } else {
        "application/octet-stream"
    }
}
