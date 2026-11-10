//! MCP (Model Context Protocol) Server implementation using `rmcp`.

use anyhow::Result;
use rmcp::{handler::server::wrapper::Parameters, schemars, tool, tool_router};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::account::AccountManager;
use crate::archive::NewRecipient;
use crate::pacing::normalize_phone_number;
use crate::sidecar::SidecarHandle;
use crate::whatsapp::ConnectionStatus;

#[derive(Clone)]
pub struct WascheMcpServer {
    account_manager: Option<Arc<AccountManager>>,
    sidecar: Option<Arc<SidecarHandle>>,
    bridge_port: Option<u16>,
    web_port: u16,
}

impl WascheMcpServer {
    pub fn new(account_manager: Arc<AccountManager>, sidecar: Arc<SidecarHandle>) -> Self {
        Self {
            account_manager: Some(account_manager),
            sidecar: Some(sidecar),
            bridge_port: None,
            web_port: 3030,
        }
    }

    pub fn with_web_port(mut self, port: u16) -> Self {
        self.web_port = port;
        self
    }

    pub fn new_bridge(port: u16) -> Self {
        Self {
            account_manager: None,
            sidecar: None,
            bridge_port: Some(port),
            web_port: port,
        }
    }

    fn bridge_get(&self, path: &str) -> Result<String, String> {
        use std::io::Read;
        let port = self
            .bridge_port
            .ok_or_else(|| "Not in bridge mode".to_string())?;
        let url = format!("http://127.0.0.1:{}{}", port, path);
        let agent: ureq::Agent = ureq::config::Config::builder()
            .http_status_as_error(false)
            .build()
            .into();
        let mut resp = agent
            .get(&url)
            .call()
            .map_err(|e| format!("Daemon communication failed: {}", e))?;
        let mut bytes = Vec::new();
        resp.body_mut()
            .as_reader()
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if resp.status().is_client_error() || resp.status().is_server_error() {
            if let Some(err) = serde_json::from_slice::<serde_json::Value>(&bytes)
                .ok()
                .and_then(|val| val.get("error")?.as_str().map(ToString::to_string))
            {
                return Err(err);
            }
            return Err(
                String::from_utf8(bytes).unwrap_or_else(|_| format!("HTTP {}", resp.status()))
            );
        }
        String::from_utf8(bytes).map_err(|e| e.to_string())
    }

    fn bridge_post_json(&self, path: &str, body: &serde_json::Value) -> Result<String, String> {
        use std::io::Read;
        let port = self
            .bridge_port
            .ok_or_else(|| "Not in bridge mode".to_string())?;
        let url = format!("http://127.0.0.1:{}{}", port, path);
        let bytes = serde_json::to_vec(body).map_err(|e| e.to_string())?;
        let agent: ureq::Agent = ureq::config::Config::builder()
            .http_status_as_error(false)
            .build()
            .into();
        let mut resp = agent
            .post(&url)
            .content_type("application/json")
            .send(bytes.as_slice())
            .map_err(|e| format!("Daemon communication failed: {}", e))?;
        let mut out = Vec::new();
        resp.body_mut()
            .as_reader()
            .read_to_end(&mut out)
            .map_err(|e| e.to_string())?;
        if resp.status().is_client_error() || resp.status().is_server_error() {
            if let Some(err) = serde_json::from_slice::<serde_json::Value>(&out)
                .ok()
                .and_then(|val| val.get("error")?.as_str().map(ToString::to_string))
            {
                return Err(err);
            }
            return Err(
                String::from_utf8(out).unwrap_or_else(|_| format!("HTTP {}", resp.status()))
            );
        }
        String::from_utf8(out).map_err(|e| e.to_string())
    }

    fn bridge_put_json(&self, path: &str, body: &serde_json::Value) -> Result<String, String> {
        use std::io::Read;
        let port = self
            .bridge_port
            .ok_or_else(|| "Not in bridge mode".to_string())?;
        let url = format!("http://127.0.0.1:{}{}", port, path);
        let bytes = serde_json::to_vec(body).map_err(|e| e.to_string())?;
        let mut resp = ureq::put(&url)
            .content_type("application/json")
            .send(bytes.as_slice())
            .map_err(|e| format!("Daemon communication failed: {}", e))?;
        let mut out = Vec::new();
        resp.body_mut()
            .as_reader()
            .read_to_end(&mut out)
            .map_err(|e| e.to_string())?;
        String::from_utf8(out).map_err(|e| e.to_string())
    }

    fn bridge_post_empty(&self, path: &str) -> Result<String, String> {
        use std::io::Read;
        let port = self
            .bridge_port
            .ok_or_else(|| "Not in bridge mode".to_string())?;
        let url = format!("http://127.0.0.1:{}{}", port, path);
        let agent: ureq::Agent = ureq::config::Config::builder()
            .http_status_as_error(false)
            .build()
            .into();
        let mut resp = agent
            .post(&url)
            .send(&[])
            .map_err(|e| format!("Daemon communication failed: {}", e))?;
        let mut out = Vec::new();
        resp.body_mut()
            .as_reader()
            .read_to_end(&mut out)
            .map_err(|e| e.to_string())?;
        if resp.status().is_client_error() || resp.status().is_server_error() {
            if let Some(err) = serde_json::from_slice::<serde_json::Value>(&out)
                .ok()
                .and_then(|val| val.get("error")?.as_str().map(ToString::to_string))
            {
                return Err(err);
            }
            return Err(
                String::from_utf8(out).unwrap_or_else(|_| format!("HTTP {}", resp.status()))
            );
        }
        String::from_utf8(out).map_err(|e| e.to_string())
    }
}

#[derive(Debug, Deserialize, schemars::JsonSchema, Default)]
pub struct AccountOptionalParams {
    #[schemars(
        description = "Optional account ID (e.g. 'default', 'work', 'sales'). Defaults to active account."
    )]
    pub account_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct AccountRequiredParams {
    #[schemars(
        description = "Account ID identifier (e.g. 'work', 'sales', 'support', 'second_number')"
    )]
    pub account_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct RenameAccountParams {
    #[schemars(description = "Existing account ID to rename (e.g. 'work')")]
    pub old_account_id: String,
    #[schemars(description = "New account ID identifier (e.g. 'sales')")]
    pub new_account_id: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SendDirectParams {
    #[schemars(description = "Target phone number (e.g. +628123456789 or 628123456789) or JID")]
    pub recipient: String,
    #[schemars(
        description = "Optional text content of the message, or caption when sending an attachment"
    )]
    pub message: Option<String>,
    #[schemars(
        description = "Optional local file path to media or document to send (e.g. 'C:/promo.jpg', 'catalog.pdf')"
    )]
    pub attachment_path: Option<String>,
    #[schemars(
        description = "Optional delivery mode: 'media' (inline playable photo/video, 16MB limit) or 'document' (raw uncompressed file up to 100MB)"
    )]
    pub send_as: Option<String>,
    #[schemars(description = "Optional account ID to send from. Defaults to active account.")]
    pub account_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SendMediaParams {
    #[schemars(description = "Target phone number (e.g. +628123456789 or 628123456789) or JID")]
    pub recipient: String,
    #[schemars(
        description = "Local file path to photo, video, or audio file to send (e.g. 'photo.jpg', 'video.mp4')"
    )]
    pub file_path: String,
    #[schemars(description = "Optional caption text")]
    pub caption: Option<String>,
    #[schemars(description = "Optional account ID to send from. Defaults to active account.")]
    pub account_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct SendDocumentParams {
    #[schemars(description = "Target phone number (e.g. +628123456789 or 628123456789) or JID")]
    pub recipient: String,
    #[schemars(
        description = "Local file path to document or raw uncompressed file (e.g. 'invoice.pdf', 'raw_video.mp4')"
    )]
    pub file_path: String,
    #[schemars(description = "Optional caption text")]
    pub caption: Option<String>,
    #[schemars(description = "Optional custom file name to display in WhatsApp")]
    pub file_name: Option<String>,
    #[schemars(description = "Optional account ID to send from. Defaults to active account.")]
    pub account_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListContactsParams {
    #[schemars(description = "Optional search query to filter contacts by name or phone")]
    pub query: Option<String>,
    #[schemars(
        description = "Optional account ID to filter contacts for a specific account (e.g. 'Akin', 'Lingga')"
    )]
    pub account_id: Option<String>,
    #[schemars(description = "Maximum number of contacts to return (default: 50)")]
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateContactParams {
    #[schemars(
        description = "WhatsApp JID (e.g. '123456789@s.whatsapp.net') or phone number (e.g. '+1234567890') of the contact to update."
    )]
    pub jid_or_phone: String,
    #[schemars(description = "Custom display name to assign to this contact.")]
    pub name: String,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct RecipientInput {
    #[schemars(description = "Phone number with country code (e.g. +14155552671)")]
    pub phone: String,
    #[schemars(description = "Optional contact or recipient display name")]
    pub name: Option<String>,
    #[schemars(
        description = "Optional key-value JSON object with custom variables (e.g. {\"promo\": \"SAVE20\"})"
    )]
    pub custom_fields: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ScheduleBroadcastParams {
    #[schemars(description = "Descriptive campaign name")]
    pub name: String,
    #[schemars(
        description = "Message template supporting {{name}}, {{phone}}, and custom variables"
    )]
    pub template: String,
    #[schemars(description = "List of recipient targets")]
    pub recipients: Vec<RecipientInput>,
    #[schemars(
        description = "Optional local file path to media or document to attach to every broadcast message (e.g. 'promo.jpg', 'catalog.pdf')"
    )]
    pub attachment_path: Option<String>,
    #[schemars(
        description = "Optional delivery mode: 'media' (inline playable photo/video, 16MB limit) or 'document' (raw uncompressed file up to 100MB)"
    )]
    pub send_as: Option<String>,
    #[schemars(
        description = "Optional single account ID or comma-separated accounts (e.g. 'sales, support' or 'all')."
    )]
    pub account_id: Option<String>,
    #[schemars(
        description = "Optional list of account IDs to load-balance across (e.g. ['sales', 'support'])"
    )]
    pub account_ids: Option<Vec<String>>,
    #[schemars(
        description = "Optional UNIX timestamp in seconds to start sending in the future (omit for immediate start)"
    )]
    pub scheduled_at: Option<i64>,
    #[schemars(description = "Minimum random delay in seconds between messages (default: 25)")]
    pub min_delay_secs: Option<u32>,
    #[schemars(description = "Maximum random delay in seconds between messages (default: 90)")]
    pub max_delay_secs: Option<u32>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct GetBroadcastStatusParams {
    #[schemars(description = "ID of the broadcast campaign")]
    pub campaign_id: i64,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ControlBroadcastParams {
    #[schemars(description = "ID of the broadcast campaign")]
    pub campaign_id: i64,
    #[schemars(
        description = "Action to apply: 'pause', 'resume', 'abort', 'delete', 'rerun', or 'retry_failed'"
    )]
    pub action: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct DeleteBroadcastParams {
    #[schemars(description = "ID of the broadcast campaign to permanently delete")]
    pub campaign_id: i64,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct UpdateCampaignTemplateParams {
    #[schemars(description = "ID of the broadcast campaign")]
    pub campaign_id: i64,
    #[schemars(
        description = "New message template content supporting {{name}}, {{phone}}, and custom variables"
    )]
    pub template: String,
}
#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct ListBroadcastsParams {
    #[schemars(
        description = "Optional status filter: 'scheduled', 'running', 'paused', 'completed', or 'aborted'"
    )]
    pub status: Option<String>,
    #[schemars(description = "Optional account ID filter")]
    pub account_id: Option<String>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
pub struct PairWithPhoneParams {
    #[schemars(
        description = "Phone number with country code (e.g. +628123456789 or 628123456789) to link with WhatsApp"
    )]
    pub phone_number: String,
    #[schemars(description = "Optional account ID to pair (defaults to active account)")]
    pub account_id: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct AddCampaignRecipientsParams {
    #[schemars(description = "ID of the broadcast campaign")]
    pub campaign_id: i64,
    #[schemars(description = "List of recipient targets to add")]
    pub recipients: Vec<RecipientInput>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct DeleteCampaignRecipientsParams {
    #[schemars(description = "ID of the broadcast campaign")]
    pub campaign_id: i64,
    #[schemars(description = "List of recipient IDs to remove from the campaign")]
    pub recipient_ids: Vec<i64>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct ResendRecipientParams {
    #[schemars(description = "ID of the broadcast campaign")]
    pub campaign_id: i64,
    #[schemars(description = "ID of the recipient to resend")]
    pub recipient_id: i64,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct RenameCampaignParams {
    #[schemars(description = "ID of the broadcast campaign to rename")]
    pub campaign_id: i64,
    #[schemars(description = "New descriptive campaign name")]
    pub new_name: String,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct AttachCampaignMediaParams {
    #[schemars(description = "ID of the broadcast campaign")]
    pub campaign_id: i64,
    #[schemars(
        description = "Local file path to photo, video, or document (e.g. 'promo.jpg', 'catalog.pdf')"
    )]
    pub file_path: String,
    #[schemars(
        description = "Optional delivery mode: 'media' (inline playable) or 'document' (raw uncompressed file)"
    )]
    pub send_as: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct RemoveCampaignAttachmentsParams {
    #[schemars(description = "ID of the broadcast campaign")]
    pub campaign_id: i64,
    #[schemars(description = "Optional file name to remove (omit to remove all attached files)")]
    pub file_name: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct GetContactAvatarParams {
    #[schemars(description = "WhatsApp JID or phone number of the contact")]
    pub jid: String,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct ListCampaignRunsParams {
    #[schemars(description = "ID of the broadcast campaign")]
    pub campaign_id: i64,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct GetRunLogsParams {
    #[schemars(description = "ID of the broadcast campaign")]
    pub campaign_id: i64,
    #[schemars(
        description = "Optional specific execution run ID (from 'whatsapp_list_campaign_runs'). Defaults to latest run."
    )]
    pub run_id: Option<i64>,
    #[schemars(
        description = "Optional search query to filter logs by contact name or phone number"
    )]
    pub query: Option<String>,
    #[schemars(description = "Optional status filter (e.g. 'sent', 'failed', 'retrying')")]
    pub status: Option<String>,
    #[schemars(description = "Maximum number of log entries to return (default: 100)")]
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct GetCampaignLogsParams {
    #[schemars(description = "ID of the broadcast campaign")]
    pub campaign_id: i64,
    #[schemars(
        description = "Optional search query to filter logs by contact name or phone number"
    )]
    pub query: Option<String>,
    #[schemars(description = "Optional status filter (e.g. 'sent', 'failed', 'retrying')")]
    pub status: Option<String>,
    #[schemars(description = "Maximum number of log entries to return (default: 100)")]
    pub limit: Option<usize>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct UpdateCampaignDelayRangeParams {
    #[schemars(description = "ID of the broadcast campaign")]
    pub campaign_id: i64,
    #[schemars(description = "Minimum random delay in seconds between messages (e.g. 15)")]
    pub min_delay_secs: u32,
    #[schemars(description = "Maximum random delay in seconds between messages (e.g. 45)")]
    pub max_delay_secs: u32,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct ListCampaignRecipientsParams {
    #[schemars(description = "ID of the broadcast campaign")]
    pub campaign_id: i64,
    #[schemars(
        description = "Optional search query to filter recipients by contact name, phone number, or JID"
    )]
    pub query: Option<String>,
    #[schemars(
        description = "Optional status filter (e.g. 'queued', 'typing', 'sent', 'failed', 'aborted')"
    )]
    pub status: Option<String>,
    #[schemars(description = "Maximum number of recipients to return (default: 50)")]
    pub limit: Option<usize>,
    #[schemars(description = "Offset for pagination (default: 0)")]
    pub offset: Option<usize>,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct SetCampaignAttachmentModeParams {
    #[schemars(description = "ID of the broadcast campaign")]
    pub campaign_id: i64,
    #[schemars(description = "Exact file name of the attachment")]
    pub file_name: String,
    #[schemars(
        description = "Delivery mode: 'media' (inline compressed, max 16MB) or 'document' (raw uncompressed file up to 100MB)"
    )]
    pub send_as: String,
}

#[derive(Debug, Deserialize, Serialize, schemars::JsonSchema)]
pub struct CampaignSenderParams {
    #[schemars(description = "ID of the broadcast campaign")]
    pub campaign_id: i64,
    #[schemars(
        description = "Account ID identifier to add or remove (e.g. 'Grlossy', 'sales', 'support')"
    )]
    pub account_id: String,
}

#[tool_router(server_handler)]
impl WascheMcpServer {
    #[tool(
        description = "List all managed WhatsApp accounts/numbers, their connection state, phone number, and which account is active."
    )]
    pub async fn whatsapp_list_accounts(&self) -> Result<String, String> {
        if self.bridge_port.is_some() {
            return self.bridge_get("/api/accounts");
        }
        let account_manager = self.account_manager.as_ref().unwrap();
        let accounts = account_manager.list_accounts().await;
        serde_json::to_string_pretty(&accounts).map_err(|e| e.to_string())
    }

    #[tool(
        description = "Create and register a new WhatsApp account/number connection (e.g. 'work', 'sales'). Begins pairing process immediately."
    )]
    pub async fn whatsapp_add_account(
        &self,
        Parameters(params): Parameters<AccountRequiredParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let body = serde_json::json!({ "account_id": params.account_id });
            let _ = self.bridge_post_json("/api/accounts/add", &body)?;
            return Ok(format!(
                "Account '{}' registered successfully. You can now call 'whatsapp_get_qr_code' or 'whatsapp_pair_with_phone' for account '{}'.",
                params.account_id, params.account_id
            ));
        }
        let account_manager = self.account_manager.as_ref().unwrap();
        account_manager
            .add_account(&params.account_id)
            .await
            .map_err(|e| e.to_string())?;

        Ok(format!(
            "Account '{}' registered successfully. You can now call 'whatsapp_get_qr_code' or 'whatsapp_pair_with_phone' for account '{}'.",
            params.account_id, params.account_id
        ))
    }

    #[tool(description = "Switch the default active WhatsApp account for subsequent operations.")]
    pub async fn whatsapp_set_active_account(
        &self,
        Parameters(params): Parameters<AccountRequiredParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let _ =
                self.bridge_post_empty(&format!("/api/accounts/{}/set-active", params.account_id))?;
            return Ok(format!(
                "Active WhatsApp account switched to '{}'.",
                params.account_id
            ));
        }
        let account_manager = self.account_manager.as_ref().unwrap();
        account_manager
            .set_active_account(&params.account_id)
            .await
            .map_err(|e| e.to_string())?;

        Ok(format!(
            "Active WhatsApp account switched to '{}'.",
            params.account_id
        ))
    }

    #[tool(description = "Remove or reset a WhatsApp account/number connection.")]
    pub async fn whatsapp_remove_account(
        &self,
        Parameters(params): Parameters<AccountRequiredParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let _ =
                self.bridge_post_empty(&format!("/api/accounts/{}/remove", params.account_id))?;
            return Ok(format!(
                "Account '{}' removed successfully.",
                params.account_id
            ));
        }
        let account_manager = self.account_manager.as_ref().unwrap();
        account_manager
            .remove_account(&params.account_id)
            .await
            .map_err(|e| e.to_string())?;

        Ok(format!(
            "Account '{}' removed successfully.",
            params.account_id
        ))
    }

    #[tool(description = "Rename an existing WhatsApp account identifier.")]
    pub async fn whatsapp_rename_account(
        &self,
        Parameters(params): Parameters<RenameAccountParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let _ = self.bridge_post_empty(&format!(
                "/api/accounts/{}/rename?new_id={}",
                params.old_account_id, params.new_account_id
            ))?;
            return Ok(format!(
                "Account '{}' renamed to '{}' successfully.",
                params.old_account_id, params.new_account_id
            ));
        }
        let account_manager = self.account_manager.as_ref().unwrap();
        account_manager
            .rename_account(&params.old_account_id, &params.new_account_id)
            .await
            .map_err(|e| e.to_string())?;

        Ok(format!(
            "Account '{}' renamed to '{}' successfully.",
            params.old_account_id, params.new_account_id
        ))
    }

    #[tool(
        description = "Check the WhatsApp connection status, device pairing state, and linked phone number for an account."
    )]
    pub async fn whatsapp_get_status(
        &self,
        Parameters(params): Parameters<AccountOptionalParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let json = self.bridge_get("/api/accounts")?;
            let accounts: Vec<crate::account::AccountSummary> =
                serde_json::from_str(&json).map_err(|e| e.to_string())?;
            let target = params.account_id.as_deref();
            let acc = if let Some(id) = target {
                accounts.iter().find(|a| a.account_id == id).cloned()
            } else {
                accounts
                    .iter()
                    .find(|a| a.is_active)
                    .or_else(|| accounts.first())
                    .cloned()
            }
            .ok_or_else(|| "Account not found".to_string())?;
            return serde_json::to_string_pretty(&acc.status).map_err(|e| e.to_string());
        }
        let account_manager = self.account_manager.as_ref().unwrap();
        let engine = account_manager
            .get_account(params.account_id.as_deref())
            .await
            .map_err(|e| e.to_string())?;

        let status = engine.get_status().await;
        serde_json::to_string_pretty(&status).map_err(|e| e.to_string())
    }

    #[tool(
        description = "Retrieve the WhatsApp pairing QR code (raw code, deep link, ASCII art, and local HTML preview file) for an account."
    )]
    pub async fn whatsapp_get_qr_code(
        &self,
        Parameters(params): Parameters<AccountOptionalParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let id = params.account_id.as_deref().unwrap_or("default");
            return self.bridge_get(&format!("/api/accounts/{}/qr", id));
        }
        let account_manager = self.account_manager.as_ref().unwrap();
        let engine = account_manager
            .get_account(params.account_id.as_deref())
            .await
            .map_err(|e| e.to_string())?;

        let qr_opt = engine.get_qr_info().await;
        match qr_opt {
            Some(qr) => {
                let html_note = qr
                    .html_path
                    .map(|p| format!("HTML QR Viewer: file://{}\n\n", p))
                    .unwrap_or_default();
                let response = format!(
                    "{}WhatsApp Pairing QR Code:\n\n{}\n\nDeep Link:\n{}\n\nRaw Code:\n{}",
                    html_note, qr.ascii_qr, qr.deep_link, qr.raw_code
                );
                Ok(response)
            }
            None => {
                let status = engine.get_status().await;
                if matches!(status, ConnectionStatus::Connected { .. }) {
                    Ok("WhatsApp is already connected and authenticated on this account. No QR code needed.".to_string())
                } else {
                    Ok(format!(
                        "No active QR code available yet. Current status: {:?}",
                        status
                    ))
                }
            }
        }
    }

    #[tool(
        description = "Request an 8-character pairing code to link WhatsApp by phone number instead of scanning a QR code."
    )]
    pub async fn whatsapp_pair_with_phone(
        &self,
        Parameters(params): Parameters<PairWithPhoneParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let id = params.account_id.as_deref().unwrap_or("default");
            let body = serde_json::json!({ "phone": params.phone_number });
            return self.bridge_post_json(&format!("/api/accounts/{}/pair-phone", id), &body);
        }
        let account_manager = self.account_manager.as_ref().unwrap();
        let engine = account_manager
            .get_account(params.account_id.as_deref())
            .await
            .map_err(|e| e.to_string())?;

        let normalized = match normalize_phone_number(&params.phone_number) {
            Some((e164, _)) => e164,
            None => params.phone_number,
        };
        let digits: String = normalized.chars().filter(|c| c.is_ascii_digit()).collect();
        if digits.len() < 7 || digits.len() > 15 {
            return Err("Invalid phone number digits for WhatsApp pairing".to_string());
        }
        let code = engine
            .pair_with_phone(&digits)
            .await
            .map_err(|e| format!("Failed to pair with phone number: {}", e))?;

        Ok(format!(
            "Pairing code requested successfully!\n\nYour 8-character pairing code is: {}\n\nInstructions on your phone:\n1. Open WhatsApp\n2. Go to Settings > Linked Devices > Link a Device\n3. Tap 'Link with phone number instead'\n4. Enter the code: {}",
            code, code
        ))
    }

    #[tool(
        description = "Send an immediate direct message, media (photo/video), or document attachment to a phone number or WhatsApp JID from a specific account."
    )]
    pub async fn whatsapp_send_direct(
        &self,
        Parameters(params): Parameters<SendDirectParams>,
    ) -> Result<String, String> {
        let account_manager = match self.account_manager.as_ref() {
            Some(m) => m,
            None => {
                let mut body_map = serde_json::Map::new();
                body_map.insert(
                    "recipient".to_string(),
                    serde_json::Value::String(params.recipient.clone()),
                );
                if let Some(ref m) = params.message {
                    body_map.insert("message".to_string(), serde_json::Value::String(m.clone()));
                }
                if let Some(ref a) = params.account_id {
                    body_map.insert(
                        "account_id".to_string(),
                        serde_json::Value::String(a.clone()),
                    );
                }
                if let Some(ref path_str) = params.attachment_path {
                    let p = std::path::Path::new(path_str);
                    if !p.exists() {
                        return Err(format!("Attachment file not found at path: '{}'", path_str));
                    }
                    let data =
                        std::fs::read(p).map_err(|e| format!("Failed to read file: {}", e))?;
                    let file_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("file");
                    let mime_type = detect_mime_type(p);
                    use base64::Engine;
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
                    let att = serde_json::json!({
                        "file_name": file_name,
                        "mime_type": mime_type,
                        "data": b64,
                        "send_as": params.send_as.as_deref().unwrap_or("media")
                    });
                    body_map.insert("attachment".to_string(), att);
                }
                return self
                    .bridge_post_json("/api/messages/send", &serde_json::Value::Object(body_map));
            }
        };
        let engine = account_manager
            .get_account(params.account_id.as_deref())
            .await
            .map_err(|e| e.to_string())?;

        let target_jid = if params.recipient.contains('@') {
            params.recipient
        } else if let Some((_, jid)) = normalize_phone_number(&params.recipient) {
            jid
        } else {
            return Err(format!(
                "Invalid phone number or JID: '{}'",
                params.recipient
            ));
        };

        if let Some(ref path_str) = params.attachment_path {
            let p = std::path::Path::new(path_str);
            if !p.exists() {
                return Err(format!("Attachment file not found at path: '{}'", path_str));
            }
            let data = std::fs::read(p).map_err(|e| format!("Failed to read file: {}", e))?;
            let file_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("file");
            let mime_type = detect_mime_type(p);

            let as_document = match params.send_as.as_deref() {
                Some("document") => true,
                Some("media") => false,
                _ => !mime_type.starts_with("image/") && !mime_type.starts_with("video/"),
            };

            let caption = params.message.as_deref();
            let msg_id = engine
                .send_media(
                    &target_jid,
                    data,
                    file_name,
                    mime_type,
                    caption,
                    None,
                    as_document,
                )
                .await
                .map_err(|e| format!("Failed to send WhatsApp media: {}", e))?;

            Ok(format!(
                "Successfully sent {} '{}' to {} (Message ID: {})",
                if as_document {
                    "document attachment"
                } else {
                    "inline media"
                },
                file_name,
                target_jid,
                msg_id
            ))
        } else {
            let text = params.message.as_deref().unwrap_or("");
            let msg_id = engine
                .send_text(&target_jid, text)
                .await
                .map_err(|e| format!("Failed to send WhatsApp message: {}", e))?;

            Ok(format!(
                "Message successfully sent to {} (Message ID: {})",
                target_jid, msg_id
            ))
        }
    }

    #[tool(
        description = "Send an immediate photo, video, or audio file directly to a recipient with an optional caption. Delivered as inline media (compressed by WhatsApp, max 16MB)."
    )]
    pub async fn whatsapp_send_media(
        &self,
        Parameters(params): Parameters<SendMediaParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let p = std::path::Path::new(&params.file_path);
            if !p.exists() {
                return Err(format!(
                    "Media file not found at path: '{}'",
                    params.file_path
                ));
            }
            let data = std::fs::read(p).map_err(|e| format!("Failed to read file: {}", e))?;
            let file_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("media");
            let mime_type = detect_mime_type(p);
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
            let mut body_map = serde_json::Map::new();
            body_map.insert(
                "recipient".to_string(),
                serde_json::Value::String(params.recipient.clone()),
            );
            if let Some(ref c) = params.caption {
                body_map.insert("message".to_string(), serde_json::Value::String(c.clone()));
            }
            if let Some(ref a) = params.account_id {
                body_map.insert(
                    "account_id".to_string(),
                    serde_json::Value::String(a.clone()),
                );
            }
            let att = serde_json::json!({
                "file_name": file_name,
                "mime_type": mime_type,
                "data": b64,
                "send_as": "media"
            });
            body_map.insert("attachment".to_string(), att);
            return self
                .bridge_post_json("/api/messages/send", &serde_json::Value::Object(body_map));
        }
        let account_manager = self.account_manager.as_ref().unwrap();
        let engine = account_manager
            .get_account(params.account_id.as_deref())
            .await
            .map_err(|e| e.to_string())?;

        let target_jid = if params.recipient.contains('@') {
            params.recipient
        } else if let Some((_, jid)) = normalize_phone_number(&params.recipient) {
            jid
        } else {
            return Err(format!(
                "Invalid phone number or JID: '{}'",
                params.recipient
            ));
        };

        let p = std::path::Path::new(&params.file_path);
        if !p.exists() {
            return Err(format!(
                "Media file not found at path: '{}'",
                params.file_path
            ));
        }
        let data = std::fs::read(p).map_err(|e| format!("Failed to read file: {}", e))?;
        let file_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("media");
        let mime_type = detect_mime_type(p);

        let msg_id = engine
            .send_media(
                &target_jid,
                data,
                file_name,
                mime_type,
                params.caption.as_deref(),
                None,
                false,
            )
            .await
            .map_err(|e| format!("Failed to send WhatsApp media: {}", e))?;

        Ok(format!(
            "Media '{}' successfully sent to {} (Message ID: {})",
            file_name, target_jid, msg_id
        ))
    }

    #[tool(
        description = "Send an immediate document or raw uncompressed file attachment (PDF, spreadsheet, or raw 4K video/photo up to 100MB) directly to a recipient with an optional caption."
    )]
    pub async fn whatsapp_send_document(
        &self,
        Parameters(params): Parameters<SendDocumentParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let p = std::path::Path::new(&params.file_path);
            if !p.exists() {
                return Err(format!(
                    "Document file not found at path: '{}'",
                    params.file_path
                ));
            }
            let data = std::fs::read(p).map_err(|e| format!("Failed to read file: {}", e))?;
            let default_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("document");
            let file_name = params.file_name.as_deref().unwrap_or(default_name);
            let mime_type = detect_mime_type(p);
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
            let mut body_map = serde_json::Map::new();
            body_map.insert(
                "recipient".to_string(),
                serde_json::Value::String(params.recipient.clone()),
            );
            if let Some(ref c) = params.caption {
                body_map.insert("message".to_string(), serde_json::Value::String(c.clone()));
            }
            if let Some(ref a) = params.account_id {
                body_map.insert(
                    "account_id".to_string(),
                    serde_json::Value::String(a.clone()),
                );
            }
            let att = serde_json::json!({
                "file_name": file_name,
                "mime_type": mime_type,
                "data": b64,
                "send_as": "document"
            });
            body_map.insert("attachment".to_string(), att);
            return self
                .bridge_post_json("/api/messages/send", &serde_json::Value::Object(body_map));
        }
        let account_manager = self.account_manager.as_ref().unwrap();
        let engine = account_manager
            .get_account(params.account_id.as_deref())
            .await
            .map_err(|e| e.to_string())?;

        let target_jid = if params.recipient.contains('@') {
            params.recipient
        } else if let Some((_, jid)) = normalize_phone_number(&params.recipient) {
            jid
        } else {
            return Err(format!(
                "Invalid phone number or JID: '{}'",
                params.recipient
            ));
        };

        let p = std::path::Path::new(&params.file_path);
        if !p.exists() {
            return Err(format!(
                "Document file not found at path: '{}'",
                params.file_path
            ));
        }
        let data = std::fs::read(p).map_err(|e| format!("Failed to read file: {}", e))?;
        let default_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("document");
        let file_name = params.file_name.as_deref().unwrap_or(default_name);
        let mime_type = detect_mime_type(p);

        let msg_id = engine
            .send_media(
                &target_jid,
                data,
                file_name,
                mime_type,
                params.caption.as_deref(),
                None,
                true,
            )
            .await
            .map_err(|e| format!("Failed to send WhatsApp document: {}", e))?;

        Ok(format!(
            "Document '{}' successfully sent to {} (Message ID: {})",
            file_name, target_jid, msg_id
        ))
    }

    #[tool(description = "Search or list contacts stored in the WhatsApp archive.")]
    pub async fn whatsapp_list_contacts(
        &self,
        Parameters(params): Parameters<ListContactsParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let limit = params.limit.unwrap_or(50);
            let q = params.query.as_deref().unwrap_or("");
            let acc = params.account_id.as_deref().unwrap_or("");
            let path = format!(
                "/api/contacts?limit={}&query={}&account_id={}",
                limit, q, acc
            );
            return self.bridge_get(&path);
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        let limit = params.limit.unwrap_or(50);
        let contacts = sidecar
            .archive()
            .list_contacts(
                params.account_id.as_deref(),
                params.query.as_deref(),
                limit,
                0,
            )
            .map_err(|e| format!("Database error querying contacts: {}", e))?;

        serde_json::to_string_pretty(&contacts).map_err(|e| e.to_string())
    }

    #[tool(
        description = "Set or update the custom display name of a WhatsApp contact in the archive."
    )]
    pub async fn whatsapp_update_contact(
        &self,
        Parameters(params): Parameters<UpdateContactParams>,
    ) -> Result<String, String> {
        if params.jid_or_phone.trim().is_empty() {
            return Err("Contact JID or phone number cannot be empty".to_string());
        }
        if self.bridge_port.is_some() {
            let body = serde_json::json!({ "name": params.name });
            let path = format!(
                "/api/contacts/{}",
                crate::web::percent_encode_str(&params.jid_or_phone)
            );
            return self.bridge_put_json(&path, &body);
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        sidecar
            .archive()
            .update_contact_name(&params.jid_or_phone, &params.name)
            .map_err(|e| format!("Database error updating contact: {}", e))?;
        Ok(format!(
            "Successfully updated contact '{}' name to '{}'.",
            params.jid_or_phone.trim(),
            params.name.trim()
        ))
    }

    #[tool(
        description = "Trigger a Peer AppState contact synchronization (CriticalUnblockLow pattern) to fetch address book names from WhatsApp."
    )]
    pub async fn whatsapp_sync_contacts(
        &self,
        Parameters(params): Parameters<AccountOptionalParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let body = serde_json::json!({ "account_id": params.account_id });
            let _ = self.bridge_post_json("/api/contacts/sync", &body)?;
            return Ok("Peer contact synchronization initiated. AppState (CriticalUnblockLow) contacts are being replayed and populated in the archive.".to_string());
        }
        let account_manager = self.account_manager.as_ref().unwrap();
        let engine = account_manager
            .get_account(params.account_id.as_deref())
            .await
            .map_err(|e| e.to_string())?;

        engine
            .sync_contacts()
            .await
            .map_err(|e| format!("Failed to initiate contact sync: {}", e))?;

        Ok("Peer contact synchronization initiated. AppState (CriticalUnblockLow) contacts are being replayed and populated in the archive.".to_string())
    }

    #[tool(
        description = "Schedule or immediately launch a broadcast message campaign with anti-ban pacing on a specific account."
    )]
    pub async fn whatsapp_schedule_broadcast(
        &self,
        Parameters(params): Parameters<ScheduleBroadcastParams>,
    ) -> Result<String, String> {
        let sidecar = match self.sidecar.as_ref() {
            Some(s) => s,
            None => {
                let body = serde_json::json!({
                    "name": params.name,
                    "template": params.template,
                    "recipients": params.recipients,
                    "account_id": params.account_id,
                    "account_ids": params.account_ids,
                    "attachment_path": params.attachment_path,
                    "send_as": params.send_as,
                    "scheduled_at": params.scheduled_at,
                    "min_delay_secs": params.min_delay_secs,
                    "max_delay_secs": params.max_delay_secs
                });
                return self.bridge_post_json("/api/campaigns", &body);
            }
        };
        if params.recipients.is_empty() {
            return Err("Recipient list cannot be empty".to_string());
        }

        let mut normalized_recipients = Vec::with_capacity(params.recipients.len());
        for (i, r) in params.recipients.into_iter().enumerate() {
            let (phone_e164, jid) = match normalize_phone_number(&r.phone) {
                Some(res) => res,
                None => {
                    return Err(format!(
                        "Recipient #{}: Invalid phone number '{}' (expected E.164 digits)",
                        i + 1,
                        r.phone
                    ));
                }
            };

            let custom_json = r.custom_fields.map(|v| v.to_string());

            normalized_recipients.push(NewRecipient {
                jid,
                phone_number: phone_e164,
                display_name: r.name,
                custom_fields_json: custom_json,
            });
        }

        let attachment_json = if let Some(ref path_str) = params.attachment_path {
            let p = std::path::Path::new(path_str);
            if p.exists() {
                let file_name = p
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("attachment")
                    .to_string();
                let file_size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
                let mime_type = detect_mime_type(p).to_string();
                let send_as = params.send_as.clone().or_else(|| {
                    if mime_type.starts_with("image/") || mime_type.starts_with("video/") {
                        Some("media".to_string())
                    } else {
                        Some("document".to_string())
                    }
                });
                let att = crate::archive::CampaignAttachment {
                    file_name,
                    file_path: p.to_string_lossy().to_string(),
                    mime_type,
                    file_size,
                    thumbnail_path: None,
                    send_as,
                };
                Some(serde_json::to_string(&vec![att]).unwrap_or_default())
            } else {
                return Err(format!("Attachment file not found at path: '{}'", path_str));
            }
        } else {
            None
        };

        let effective_account_id = if let Some(ref ids) = params.account_ids {
            if !ids.is_empty() {
                Some(ids.join(", "))
            } else {
                params.account_id
            }
        } else {
            params.account_id
        };

        let campaign_id = sidecar
            .create_and_schedule_campaign(
                effective_account_id.as_deref(),
                &params.name,
                &params.template,
                attachment_json.as_deref(),
                normalized_recipients,
                params.scheduled_at,
                params.min_delay_secs,
                params.max_delay_secs,
            )
            .await
            .map_err(|e| format!("Failed to schedule broadcast campaign: {}", e))?;

        let status_desc = if let Some(ts) = params.scheduled_at {
            format!("Scheduled to begin at UNIX timestamp {}", ts)
        } else {
            "Initial status set to 'draft'. Campaign will not run until manually launched."
                .to_string()
        };

        Ok(format!(
            "Broadcast campaign #{} ('{}') created successfully. {}",
            campaign_id, params.name, status_desc
        ))
    }

    #[tool(
        description = "Get detailed progress, statistics, and recent delivery logs for a broadcast campaign."
    )]
    pub async fn whatsapp_get_broadcast_status(
        &self,
        Parameters(params): Parameters<GetBroadcastStatusParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            return self.bridge_get(&format!("/api/campaigns/{}", params.campaign_id));
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        let details = sidecar
            .get_campaign_status(params.campaign_id)
            .await
            .map_err(|e| e.to_string())?;

        serde_json::to_string_pretty(&details).map_err(|e| e.to_string())
    }

    #[tool(
        description = "Control an active broadcast campaign (actions: 'pause', 'resume', 'abort', or 'delete')."
    )]
    pub async fn whatsapp_control_broadcast(
        &self,
        Parameters(params): Parameters<ControlBroadcastParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let _ = self.bridge_post_empty(&format!(
                "/api/control/{}/{}",
                params.campaign_id, params.action
            ))?;
            return Ok(format!(
                "Campaign #{} action '{}' applied successfully.",
                params.campaign_id, params.action
            ));
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        sidecar
            .control_campaign(params.campaign_id, &params.action)
            .await
            .map_err(|e| e.to_string())?;

        Ok(format!(
            "Campaign #{} action '{}' applied successfully.",
            params.campaign_id, params.action
        ))
    }

    #[tool(
        description = "Permanently delete a broadcast campaign and its associated recipient queue from the archive."
    )]
    pub async fn whatsapp_delete_broadcast(
        &self,
        Parameters(params): Parameters<DeleteBroadcastParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let _ =
                self.bridge_post_empty(&format!("/api/control/{}/delete", params.campaign_id))?;
            return Ok(format!(
                "Broadcast campaign #{} and its associated recipient queue were permanently deleted.",
                params.campaign_id
            ));
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        sidecar
            .control_campaign(params.campaign_id, "delete")
            .await
            .map_err(|e| e.to_string())?;

        Ok(format!(
            "Broadcast campaign #{} and its associated recipient queue were permanently deleted.",
            params.campaign_id
        ))
    }
    #[tool(description = "List all broadcast campaigns, optionally filtered by status or account.")]
    pub async fn whatsapp_list_broadcasts(
        &self,
        Parameters(params): Parameters<ListBroadcastsParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let path = if let Some(ref st) = params.status {
                format!("/api/campaigns?status={}", st)
            } else {
                "/api/campaigns".to_string()
            };
            return self.bridge_get(&path);
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        let list = sidecar
            .archive()
            .list_campaigns(params.account_id.as_deref(), params.status.as_deref())
            .map_err(|e| format!("Failed to list campaigns: {}", e))?;

        serde_json::to_string_pretty(&list).map_err(|e| e.to_string())
    }

    #[tool(description = "Update the message template of an existing broadcast campaign.")]
    pub async fn whatsapp_update_campaign_template(
        &self,
        Parameters(params): Parameters<UpdateCampaignTemplateParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let path = format!(
                "/api/campaigns/{}/template?template={}",
                params.campaign_id,
                crate::web::percent_encode_str(&params.template)
            );
            let _ = self.bridge_post_empty(&path)?;
            return Ok(format!(
                "Campaign #{} message template updated successfully.",
                params.campaign_id
            ));
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        sidecar
            .update_campaign_template(params.campaign_id, &params.template)
            .await
            .map_err(|e| e.to_string())?;

        Ok(format!(
            "Campaign #{} message template updated successfully.",
            params.campaign_id
        ))
    }

    #[tool(
        description = "Open the live web dashboard in the default browser to monitor campaign progress, delivery logs, and WhatsApp accounts."
    )]
    pub async fn whatsapp_open_dashboard(&self) -> Result<String, String> {
        let port = self.bridge_port.unwrap_or(self.web_port);
        let url = format!("http://127.0.0.1:{}", port);
        #[cfg(target_os = "windows")]
        let _ = std::process::Command::new("powershell")
            .args(["-Command", &format!("Start-Process '{}'", url)])
            .spawn();

        #[cfg(target_os = "macos")]
        let _ = std::process::Command::new("open").arg(&url).spawn();

        #[cfg(target_os = "linux")]
        let _ = std::process::Command::new("xdg-open").arg(&url).spawn();

        Ok(format!("Web dashboard opened in browser: {}", url))
    }

    #[tool(
        description = "Reset local pairing session and keys for an account, preparing it for re-pairing via QR or phone code."
    )]
    pub async fn whatsapp_reset_account_pairing(
        &self,
        Parameters(params): Parameters<AccountRequiredParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            self.bridge_post_empty(&format!(
                "/api/accounts/{}/reset-pairing",
                params.account_id
            ))?;
            return Ok(format!(
                "Reset pairing for account '{}'. Call 'whatsapp_get_qr_code' or 'whatsapp_pair_with_phone' to link.",
                params.account_id
            ));
        }
        let account_manager = self.account_manager.as_ref().unwrap();
        account_manager
            .reset_account_pairing(&params.account_id)
            .await
            .map_err(|e| e.to_string())?;

        Ok(format!(
            "Reset pairing for account '{}'. Call 'whatsapp_get_qr_code' or 'whatsapp_pair_with_phone' to link.",
            params.account_id
        ))
    }

    #[tool(description = "Rename an existing broadcast campaign.")]
    pub async fn whatsapp_rename_campaign(
        &self,
        Parameters(params): Parameters<RenameCampaignParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let path = format!(
                "/api/campaigns/{}/rename?name={}",
                params.campaign_id,
                crate::web::percent_encode_str(&params.new_name)
            );
            self.bridge_post_empty(&path)?;
            return Ok(format!(
                "Campaign #{} renamed to '{}'.",
                params.campaign_id, params.new_name
            ));
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        sidecar
            .rename_campaign(params.campaign_id, &params.new_name)
            .await
            .map_err(|e| e.to_string())?;

        Ok(format!(
            "Campaign #{} renamed to '{}'.",
            params.campaign_id, params.new_name
        ))
    }

    #[tool(description = "Add target recipient contacts to an existing broadcast campaign.")]
    pub async fn whatsapp_add_campaign_recipients(
        &self,
        Parameters(params): Parameters<AddCampaignRecipientsParams>,
    ) -> Result<String, String> {
        if params.recipients.is_empty() {
            return Err("Recipient list cannot be empty".to_string());
        }
        if self.bridge_port.is_some() {
            let body = serde_json::json!({
                "recipients": params.recipients.into_iter().map(|r| {
                    serde_json::json!({
                        "phone_number": r.phone,
                        "display_name": r.name,
                        "custom_fields": r.custom_fields
                    })
                }).collect::<Vec<_>>()
            });
            let _ = self.bridge_post_json(
                &format!("/api/campaigns/{}/recipients", params.campaign_id),
                &body,
            )?;
            return Ok(format!(
                "Added recipients to campaign #{}.",
                params.campaign_id
            ));
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        let mut normalized = Vec::with_capacity(params.recipients.len());
        for (i, r) in params.recipients.into_iter().enumerate() {
            let (phone_e164, jid) = match normalize_phone_number(&r.phone) {
                Some(res) => res,
                None => {
                    return Err(format!(
                        "Recipient #{}: Invalid phone number '{}'",
                        i + 1,
                        r.phone
                    ));
                }
            };
            normalized.push(NewRecipient {
                jid,
                phone_number: phone_e164,
                display_name: r.name,
                custom_fields_json: r.custom_fields.map(|v| v.to_string()),
            });
        }
        sidecar
            .add_campaign_recipients(params.campaign_id, &normalized)
            .await
            .map_err(|e| e.to_string())?;
        Ok(format!(
            "Added {} recipient(s) to campaign #{}.",
            normalized.len(),
            params.campaign_id
        ))
    }

    #[tool(
        description = "Remove target recipient contacts from an existing broadcast campaign queue."
    )]
    pub async fn whatsapp_delete_campaign_recipients(
        &self,
        Parameters(params): Parameters<DeleteCampaignRecipientsParams>,
    ) -> Result<String, String> {
        if params.recipient_ids.is_empty() {
            return Err("Recipient IDs list cannot be empty".to_string());
        }
        if self.bridge_port.is_some() {
            let body = serde_json::json!({ "recipient_ids": params.recipient_ids });
            let _ = self.bridge_post_json(
                &format!("/api/campaigns/{}/recipients/delete", params.campaign_id),
                &body,
            )?;
            return Ok(format!(
                "Removed recipient(s) from campaign #{}.",
                params.campaign_id
            ));
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        let count = sidecar
            .delete_campaign_recipients(params.campaign_id, &params.recipient_ids)
            .await
            .map_err(|e| e.to_string())?;
        Ok(format!(
            "Removed {} recipient(s) from campaign #{}.",
            count, params.campaign_id
        ))
    }

    #[tool(
        description = "Resend or requeue an individual recipient that previously failed or was aborted."
    )]
    pub async fn whatsapp_resend_recipient(
        &self,
        Parameters(params): Parameters<ResendRecipientParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let _ = self.bridge_post_empty(&format!(
                "/api/campaigns/{}/recipients/{}/resend",
                params.campaign_id, params.recipient_id
            ))?;
            return Ok(format!(
                "Recipient #{} requeued for delivery in campaign #{}.",
                params.recipient_id, params.campaign_id
            ));
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        sidecar
            .resend_recipient(params.campaign_id, params.recipient_id)
            .await
            .map_err(|e| e.to_string())?;
        Ok(format!(
            "Recipient #{} requeued for delivery in campaign #{}.",
            params.recipient_id, params.campaign_id
        ))
    }

    #[tool(description = "Attach a photo, video, or document to an existing broadcast campaign.")]
    pub async fn whatsapp_attach_campaign_media(
        &self,
        Parameters(params): Parameters<AttachCampaignMediaParams>,
    ) -> Result<String, String> {
        let p = std::path::Path::new(&params.file_path);
        if !p.exists() {
            return Err(format!("File not found at path: '{}'", params.file_path));
        }
        let data = std::fs::read(p).map_err(|e| format!("Failed to read file: {}", e))?;
        let file_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("file");
        let mime_type = detect_mime_type(p);

        if self.bridge_port.is_some() {
            use base64::Engine;
            let b64 = base64::engine::general_purpose::STANDARD.encode(&data);
            let body = serde_json::json!({
                "file_name": file_name,
                "mime_type": mime_type,
                "data": b64,
                "send_as": params.send_as.as_deref().unwrap_or(if mime_type.starts_with("image/") || mime_type.starts_with("video/") { "media" } else { "document" })
            });
            let _ = self.bridge_post_json(
                &format!("/api/campaigns/{}/attachments", params.campaign_id),
                &body,
            )?;
            return Ok(format!(
                "Attached '{}' to campaign #{}.",
                file_name, params.campaign_id
            ));
        }

        let sidecar = self.sidecar.as_ref().unwrap();
        let file_size = std::fs::metadata(p).map(|m| m.len()).unwrap_or(0);
        let att = crate::archive::CampaignAttachment {
            file_name: file_name.to_string(),
            file_path: p.to_string_lossy().to_string(),
            mime_type: mime_type.to_string(),
            file_size,
            thumbnail_path: None,
            send_as: params.send_as.clone().or_else(|| {
                if mime_type.starts_with("image/") || mime_type.starts_with("video/") {
                    Some("media".to_string())
                } else {
                    Some("document".to_string())
                }
            }),
        };
        let att_json = serde_json::to_string(&vec![att]).unwrap_or_default();
        sidecar
            .update_campaign_attachment(params.campaign_id, Some(&att_json))
            .await
            .map_err(|e| e.to_string())?;
        Ok(format!(
            "Attached '{}' to campaign #{}.",
            file_name, params.campaign_id
        ))
    }

    #[tool(description = "Remove attachments from an existing broadcast campaign.")]
    pub async fn whatsapp_remove_campaign_attachments(
        &self,
        Parameters(params): Parameters<RemoveCampaignAttachmentsParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            use std::io::Read;
            let path = if let Some(ref name) = params.file_name {
                format!(
                    "/api/campaigns/{}/attachments?name={}",
                    params.campaign_id,
                    crate::web::percent_encode_str(name)
                )
            } else {
                format!("/api/campaigns/{}/attachments", params.campaign_id)
            };
            let port = self.bridge_port.unwrap();
            let mut resp = ureq::delete(&format!("http://127.0.0.1:{}{}", port, path))
                .call()
                .map_err(|e| format!("Daemon communication failed: {}", e))?;
            let mut out = Vec::new();
            resp.body_mut()
                .as_reader()
                .read_to_end(&mut out)
                .map_err(|e| e.to_string())?;
            return Ok(format!(
                "Removed attachments from campaign #{}.",
                params.campaign_id
            ));
        }

        let sidecar = self.sidecar.as_ref().unwrap();
        if let Some(ref name) = params.file_name {
            if let Ok(Some(c)) = sidecar.archive().get_campaign(params.campaign_id) {
                let mut atts =
                    crate::archive::parse_campaign_attachments(c.attachment_path.as_deref());
                atts.retain(|a| &a.file_name != name);
                let att_json = if atts.is_empty() {
                    None
                } else {
                    Some(serde_json::to_string(&atts).unwrap_or_default())
                };
                sidecar
                    .update_campaign_attachment(params.campaign_id, att_json.as_deref())
                    .await
                    .map_err(|e| e.to_string())?;
            }
        } else {
            sidecar
                .update_campaign_attachment(params.campaign_id, None)
                .await
                .map_err(|e| e.to_string())?;
        }
        Ok(format!(
            "Removed attachments from campaign #{}.",
            params.campaign_id
        ))
    }

    #[tool(description = "Get the profile avatar/picture URL of a WhatsApp contact.")]
    pub async fn whatsapp_get_contact_avatar(
        &self,
        Parameters(params): Parameters<GetContactAvatarParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let path = format!(
                "/api/contacts/{}/avatar",
                crate::web::percent_encode_str(&params.jid)
            );
            let resp = self.bridge_get(&path)?;
            return Ok(resp);
        }
        let account_manager = self.account_manager.as_ref().unwrap();
        let avatar_opt = account_manager
            .get_contact_avatar_url(&params.jid)
            .await
            .map_err(|e| e.to_string())?;
        match avatar_opt {
            Some(url) => Ok(format!("Avatar URL for '{}': {}", params.jid, url)),
            None => Ok(format!("No avatar image found for '{}'.", params.jid)),
        }
    }

    #[tool(
        description = "List all execution runs for a broadcast campaign (Run #1, Run #2, etc.) with their sent/failed counts, status, and duration."
    )]
    pub async fn whatsapp_list_campaign_runs(
        &self,
        Parameters(params): Parameters<ListCampaignRunsParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            return self.bridge_get(&format!("/api/campaigns/{}/runs", params.campaign_id));
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        let runs = sidecar
            .archive()
            .list_runs_for_campaign(params.campaign_id)
            .map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&runs).map_err(|e| e.to_string())
    }

    #[tool(
        description = "Get detailed delivery logs for a specific campaign run, with optional search by name/number and status filter (sent/failed/retrying)."
    )]
    pub async fn whatsapp_get_run_logs(
        &self,
        Parameters(params): Parameters<GetRunLogsParams>,
    ) -> Result<String, String> {
        let limit = params.limit.unwrap_or(100);
        if self.bridge_port.is_some() {
            let run_id = match params.run_id {
                Some(id) => id,
                None => {
                    let runs_json =
                        self.bridge_get(&format!("/api/campaigns/{}/runs", params.campaign_id))?;
                    let runs: Vec<crate::archive::CampaignRun> =
                        serde_json::from_str(&runs_json).map_err(|e| e.to_string())?;
                    runs.first().map(|r| r.id).ok_or_else(|| {
                        "No execution runs recorded for this campaign yet".to_string()
                    })?
                }
            };
            let mut query_parts = Vec::new();
            if let Some(ref q) = params.query {
                query_parts.push(format!("query={}", crate::web::percent_encode_str(q)));
            }
            if let Some(ref st) = params.status {
                query_parts.push(format!("status={}", crate::web::percent_encode_str(st)));
            }
            query_parts.push(format!("limit={}", limit));
            return self.bridge_get(&format!(
                "/api/runs/{}/logs?{}",
                run_id,
                query_parts.join("&")
            ));
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        let run_id = match params.run_id {
            Some(id) => id,
            None => {
                let runs = sidecar
                    .archive()
                    .list_runs_for_campaign(params.campaign_id)
                    .map_err(|e| e.to_string())?;
                runs.first()
                    .map(|r| r.id)
                    .ok_or_else(|| "No execution runs recorded for this campaign yet".to_string())?
            }
        };
        let logs = sidecar
            .archive()
            .list_logs_for_run(
                run_id,
                params.query.as_deref(),
                params.status.as_deref(),
                limit,
            )
            .map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&logs).map_err(|e| e.to_string())
    }

    #[tool(
        description = "Get recent delivery logs across all runs for a broadcast campaign, with optional search by name/number and status filter."
    )]
    pub async fn whatsapp_get_campaign_logs(
        &self,
        Parameters(params): Parameters<GetCampaignLogsParams>,
    ) -> Result<String, String> {
        let limit = params.limit.unwrap_or(100);
        let sidecar = match self.sidecar.as_ref() {
            Some(s) => s,
            None => {
                let details_json =
                    self.bridge_get(&format!("/api/campaigns/{}", params.campaign_id))?;
                let details: serde_json::Value =
                    serde_json::from_str(&details_json).map_err(|e| e.to_string())?;
                let logs = details
                    .get("recent_logs")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let filtered = logs
                    .into_iter()
                    .filter(|l| {
                        if let Some(ref st) = params.status {
                            if !l
                                .get("status")
                                .and_then(|v| v.as_str())
                                .map(|s| s.eq_ignore_ascii_case(st))
                                .unwrap_or(false)
                            {
                                return false;
                            }
                        }
                        if let Some(ref q) = params.query {
                            let q_low = q.to_lowercase();
                            let name = l
                                .get("display_name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_lowercase();
                            let phone =
                                l.get("phone_number").and_then(|v| v.as_str()).unwrap_or("");
                            let jid = l.get("jid").and_then(|v| v.as_str()).unwrap_or("");
                            if !name.contains(&q_low)
                                && !phone.contains(&q_low)
                                && !jid.contains(&q_low)
                            {
                                return false;
                            }
                        }
                        true
                    })
                    .take(limit)
                    .collect::<Vec<_>>();
                return serde_json::to_string_pretty(&filtered).map_err(|e| e.to_string());
            }
        };
        let logs = sidecar
            .archive()
            .list_logs_for_campaign(
                params.campaign_id,
                params.query.as_deref(),
                params.status.as_deref(),
                limit,
            )
            .map_err(|e| e.to_string())?;
        serde_json::to_string_pretty(&logs).map_err(|e| e.to_string())
    }

    #[tool(
        description = "Update the anti-ban delay jitter range (minimum and maximum random delay between messages in seconds) of an existing broadcast campaign."
    )]
    pub async fn whatsapp_update_campaign_delay_range(
        &self,
        Parameters(params): Parameters<UpdateCampaignDelayRangeParams>,
    ) -> Result<String, String> {
        if params.min_delay_secs > params.max_delay_secs {
            return Err("min_delay_secs cannot exceed max_delay_secs".to_string());
        }
        if self.bridge_port.is_some() {
            let body = serde_json::json!({
                "min_delay_secs": params.min_delay_secs,
                "max_delay_secs": params.max_delay_secs,
            });
            let _ = self.bridge_post_json(
                &format!("/api/campaigns/{}/delay-range", params.campaign_id),
                &body,
            )?;
            return Ok(format!(
                "Campaign #{} delay jitter range updated to {}s – {}s.",
                params.campaign_id, params.min_delay_secs, params.max_delay_secs
            ));
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        sidecar
            .update_campaign_delay_range(
                params.campaign_id,
                params.min_delay_secs,
                params.max_delay_secs,
            )
            .await
            .map_err(|e| e.to_string())?;

        Ok(format!(
            "Campaign #{} delay jitter range updated to {}s – {}s.",
            params.campaign_id, params.min_delay_secs, params.max_delay_secs
        ))
    }

    #[tool(
        description = "List target recipient contacts of a specific broadcast campaign, with optional search by name/number and status filter."
    )]
    pub async fn whatsapp_list_campaign_recipients(
        &self,
        Parameters(params): Parameters<ListCampaignRecipientsParams>,
    ) -> Result<String, String> {
        let limit = params.limit.unwrap_or(50);
        let offset = params.offset.unwrap_or(0);
        if self.bridge_port.is_some() {
            let mut query_parts = Vec::new();
            if let Some(ref q) = params.query {
                query_parts.push(format!("query={}", crate::web::percent_encode_str(q)));
            }
            if let Some(ref st) = params.status {
                query_parts.push(format!("status={}", crate::web::percent_encode_str(st)));
            }
            query_parts.push(format!("limit={}", limit));
            query_parts.push(format!("offset={}", offset));
            return self.bridge_get(&format!(
                "/api/campaigns/{}/recipients?{}",
                params.campaign_id,
                query_parts.join("&")
            ));
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        let recipients = sidecar
            .list_campaign_recipients(
                params.campaign_id,
                params.query.as_deref(),
                params.status.as_deref(),
                limit,
                offset,
            )
            .await
            .map_err(|e| e.to_string())?;

        serde_json::to_string_pretty(&recipients).map_err(|e| e.to_string())
    }

    #[tool(
        description = "Update the delivery mode of a campaign attachment ('media' for inline playable, 'document' for raw uncompressed file up to 100MB)."
    )]
    pub async fn whatsapp_set_campaign_attachment_mode(
        &self,
        Parameters(params): Parameters<SetCampaignAttachmentModeParams>,
    ) -> Result<String, String> {
        let mode = match params.send_as.to_lowercase().as_str() {
            "document" | "doc" | "raw" => "document",
            _ => "media",
        };
        if self.bridge_port.is_some() {
            let body = serde_json::json!({
                "file_name": params.file_name,
                "send_as": mode
            });
            let _ = self.bridge_post_json(
                &format!("/api/campaigns/{}/attachments/mode", params.campaign_id),
                &body,
            )?;
            return Ok(format!(
                "Updated attachment '{}' in campaign #{} to send as {}.",
                params.file_name, params.campaign_id, mode
            ));
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        if let Ok(Some(c)) = sidecar.archive().get_campaign(params.campaign_id) {
            let mut atts = crate::archive::parse_campaign_attachments(c.attachment_path.as_deref());
            if let Some(pos) = atts.iter().position(|a| a.file_name == params.file_name) {
                atts[pos].send_as = Some(mode.to_string());
                let json_str = serde_json::to_string(&atts).unwrap_or_default();
                sidecar
                    .update_campaign_attachment(params.campaign_id, Some(&json_str))
                    .await
                    .map_err(|e| e.to_string())?;
                return Ok(format!(
                    "Updated attachment '{}' in campaign #{} to send as {}.",
                    params.file_name, params.campaign_id, mode
                ));
            }
        }
        Err(format!(
            "Attachment '{}' not found in campaign #{}",
            params.file_name, params.campaign_id
        ))
    }

    #[tool(
        description = "Add a sender WhatsApp account to an existing broadcast campaign for multi-account pooling and load balancing."
    )]
    pub async fn whatsapp_add_campaign_sender(
        &self,
        Parameters(params): Parameters<CampaignSenderParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let body = serde_json::json!({ "account_id": params.account_id });
            let _ = self.bridge_post_json(
                &format!("/api/campaigns/{}/senders/add", params.campaign_id),
                &body,
            )?;
            return Ok(format!(
                "Added sender account '{}' to campaign #{}.",
                params.account_id, params.campaign_id
            ));
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        let pool = sidecar
            .add_campaign_sender(params.campaign_id, &params.account_id)
            .await
            .map_err(|e| e.to_string())?;

        Ok(format!(
            "Added sender account '{}' to campaign #{}. Active sender pool: {}.",
            params.account_id, params.campaign_id, pool
        ))
    }

    #[tool(description = "Remove a sender WhatsApp account from an existing broadcast campaign.")]
    pub async fn whatsapp_remove_campaign_sender(
        &self,
        Parameters(params): Parameters<CampaignSenderParams>,
    ) -> Result<String, String> {
        if self.bridge_port.is_some() {
            let body = serde_json::json!({ "account_id": params.account_id });
            let _ = self.bridge_post_json(
                &format!("/api/campaigns/{}/senders/remove", params.campaign_id),
                &body,
            )?;
            return Ok(format!(
                "Removed sender account '{}' from campaign #{}.",
                params.account_id, params.campaign_id
            ));
        }
        let sidecar = self.sidecar.as_ref().unwrap();
        let pool = sidecar
            .remove_campaign_sender(params.campaign_id, &params.account_id)
            .await
            .map_err(|e| e.to_string())?;

        Ok(format!(
            "Removed sender account '{}' from campaign #{}. Active sender pool: {}.",
            params.account_id, params.campaign_id, pool
        ))
    }
}

fn detect_mime_type(path: &std::path::Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "mp4" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "txt" => "text/plain",
        "csv" => "text/csv",
        _ => "application/octet-stream",
    }
}
