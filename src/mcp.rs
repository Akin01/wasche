//! MCP (Model Context Protocol) Server implementation using `rmcp`.

use anyhow::Result;
use rmcp::{handler::server::wrapper::Parameters, schemars, tool, tool_router};
use serde::Deserialize;
use std::sync::Arc;

use crate::account::AccountManager;
use crate::archive::NewRecipient;
use crate::pacing::normalize_phone_number;
use crate::sidecar::SidecarHandle;
use crate::whatsapp::ConnectionStatus;

#[derive(Clone)]
pub struct WascheMcpServer {
    account_manager: Arc<AccountManager>,
    sidecar: Arc<SidecarHandle>,
}

impl WascheMcpServer {
    pub fn new(account_manager: Arc<AccountManager>, sidecar: Arc<SidecarHandle>) -> Self {
        Self {
            account_manager,
            sidecar,
        }
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

#[tool_router(server_handler)]
impl WascheMcpServer {
    #[tool(
        description = "List all managed WhatsApp accounts/numbers, their connection state, phone number, and which account is active."
    )]
    pub async fn whatsapp_list_accounts(&self) -> Result<String, String> {
        let accounts = self.account_manager.list_accounts().await;
        serde_json::to_string_pretty(&accounts).map_err(|e| e.to_string())
    }

    #[tool(
        description = "Create and register a new WhatsApp account/number connection (e.g. 'work', 'sales'). Begins pairing process immediately."
    )]
    pub async fn whatsapp_add_account(
        &self,
        Parameters(params): Parameters<AccountRequiredParams>,
    ) -> Result<String, String> {
        self.account_manager
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
        self.account_manager
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
        self.account_manager
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
        self.account_manager
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
        let engine = self
            .account_manager
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
        let engine = self
            .account_manager
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
        let engine = self
            .account_manager
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
        let engine = self
            .account_manager
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
        let engine = self
            .account_manager
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
        let engine = self
            .account_manager
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
        let limit = params.limit.unwrap_or(50);
        let contacts = self
            .sidecar
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
        description = "Trigger a Peer AppState contact synchronization (CriticalUnblockLow pattern) to fetch address book names from WhatsApp."
    )]
    pub async fn whatsapp_sync_contacts(
        &self,
        Parameters(params): Parameters<AccountOptionalParams>,
    ) -> Result<String, String> {
        let engine = self
            .account_manager
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

        let campaign_id = self
            .sidecar
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
        let details = self
            .sidecar
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
        self.sidecar
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
        self.sidecar
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
        let list = self
            .sidecar
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
        self.sidecar
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
        let url = "http://127.0.0.1:3030";
        #[cfg(target_os = "windows")]
        let _ = std::process::Command::new("powershell")
            .args(["-Command", &format!("Start-Process '{}'", url)])
            .spawn();

        #[cfg(target_os = "macos")]
        let _ = std::process::Command::new("open").arg(url).spawn();

        #[cfg(target_os = "linux")]
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();

        Ok(format!("Web dashboard opened in browser: {}", url))
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
