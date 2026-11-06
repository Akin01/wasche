use rmcp::handler::server::wrapper::Parameters;
use std::sync::Arc;
use tempfile::tempdir;

use wasche::account::AccountManager;
use wasche::archive::{Archive, Contact};
use wasche::mcp::*;
use wasche::sidecar::SidecarHandle;

async fn setup_test_server() -> WascheMcpServer {
    let dir = tempdir().unwrap();
    let archive_path = dir.path().join("archive.db");

    let archive = Archive::open(archive_path).unwrap();
    let account_manager = AccountManager::init(dir.path().to_path_buf(), archive.clone())
        .await
        .unwrap();
    let _ = account_manager.add_account("default").await;
    let (sidecar_handle, _worker) = SidecarHandle::new(archive, account_manager.clone());

    WascheMcpServer::new(account_manager, Arc::new(sidecar_handle))
}

#[tokio::test]
async fn test_mcp_whatsapp_get_status() {
    let server = setup_test_server().await;
    let status_str = server
        .whatsapp_get_status(Parameters(AccountOptionalParams::default()))
        .await
        .unwrap();
    assert!(
        status_str.contains("Connecting")
            || status_str.contains("Disconnected")
            || status_str.contains("PairingQr")
    );
}

#[tokio::test]
async fn test_mcp_multi_account_management() {
    let server = setup_test_server().await;

    // 1. Initial list should show 'default'
    let accounts_json = server.whatsapp_list_accounts().await.unwrap();
    assert!(accounts_json.contains("default"));

    // 2. Add 'sales' account
    let add_res = server
        .whatsapp_add_account(Parameters(AccountRequiredParams {
            account_id: "sales".to_string(),
        }))
        .await
        .unwrap();
    assert!(add_res.contains("sales"));

    // 3. List should show both default and sales
    let accounts_json = server.whatsapp_list_accounts().await.unwrap();
    assert!(accounts_json.contains("sales"));
    assert!(accounts_json.contains("default"));

    // 4. Switch active account to 'sales'
    let switch_res = server
        .whatsapp_set_active_account(Parameters(AccountRequiredParams {
            account_id: "sales".to_string(),
        }))
        .await
        .unwrap();
    assert!(switch_res.contains("switched to 'sales'"));

    // 5. Query status of 'sales' explicitly
    let status_res = server
        .whatsapp_get_status(Parameters(AccountOptionalParams {
            account_id: Some("sales".to_string()),
        }))
        .await
        .unwrap();
    assert!(
        status_res.contains("Connecting")
            || status_res.contains("Disconnected")
            || status_res.contains("PairingQr")
    );

    // 6. Rename 'sales' to 'support'
    let rename_res = server
        .whatsapp_rename_account(Parameters(RenameAccountParams {
            old_account_id: "sales".to_string(),
            new_account_id: "support".to_string(),
        }))
        .await
        .unwrap();
    assert!(rename_res.contains("support"));

    let accounts_json = server.whatsapp_list_accounts().await.unwrap();
    assert!(accounts_json.contains("support"));
    assert!(!accounts_json.contains("sales"));
}

#[tokio::test]
async fn test_mcp_broadcast_lifecycle() {
    let server = setup_test_server().await;

    // 1. Schedule a broadcast campaign
    let schedule_params = ScheduleBroadcastParams {
        name: "Black Friday Promo".to_string(),
        template: "Hi {{name}}, use code {{promo}}!".to_string(),
        recipients: vec![
            RecipientInput {
                phone: "+62 812-3456-7890".to_string(),
                name: Some("Budi".to_string()),
                custom_fields: Some(serde_json::json!({ "promo": "BF50" })),
            },
            RecipientInput {
                phone: "+1 (415) 555-2671".to_string(),
                name: Some("Charlie".to_string()),
                custom_fields: Some(serde_json::json!({ "promo": "BF30" })),
            },
        ],
        account_id: Some("default".to_string()),
        scheduled_at: None,
        min_delay_secs: Some(15),
        max_delay_secs: Some(30),
        account_ids: None,
        attachment_path: None,
        send_as: None,
    };

    let schedule_res = server
        .whatsapp_schedule_broadcast(Parameters(schedule_params))
        .await
        .unwrap();
    assert!(schedule_res.contains("created successfully"));
    assert!(schedule_res.contains("Black Friday Promo"));

    // 2. Query status
    let status_res = server
        .whatsapp_get_broadcast_status(Parameters(GetBroadcastStatusParams { campaign_id: 1 }))
        .await
        .unwrap();
    assert!(status_res.contains("Black Friday Promo"));
    assert!(status_res.contains("total_count\": 2"));

    // 3. Control campaign (pause)
    let pause_res = server
        .whatsapp_control_broadcast(Parameters(ControlBroadcastParams {
            campaign_id: 1,
            action: "pause".to_string(),
        }))
        .await
        .unwrap();
    assert!(pause_res.contains("pause' applied successfully"));

    // 4. List broadcasts
    let list_res = server
        .whatsapp_list_broadcasts(Parameters(ListBroadcastsParams {
            status: None,
            account_id: None,
        }))
        .await
        .unwrap();
    assert!(list_res.contains("Black Friday Promo"));

    // 5. Delete broadcast campaign
    let delete_res = server
        .whatsapp_delete_broadcast(Parameters(DeleteBroadcastParams { campaign_id: 1 }))
        .await
        .unwrap();
    assert!(delete_res.contains("permanently deleted"));

    let list_after_delete = server
        .whatsapp_list_broadcasts(Parameters(ListBroadcastsParams {
            status: None,
            account_id: None,
        }))
        .await
        .unwrap();
    assert!(!list_after_delete.contains("Black Friday Promo"));
}

#[tokio::test]
async fn test_mcp_contacts_list() {
    let dir = tempdir().unwrap();
    let archive_path = dir.path().join("archive.db");

    let archive = Archive::open(archive_path).unwrap();
    archive
        .upsert_contact(&Contact {
            id: "6281234567890@s.whatsapp.net".to_string(),
            full_name: Some("Alice Smith".to_string()),
            first_name: Some("Alice".to_string()),
            push_name: Some("~alice".to_string()),
            phone_number: Some("+6281234567890".to_string()),
            avatar_url: None,
            updated_at: 1000,
        })
        .unwrap();

    let account_manager = AccountManager::init(dir.path().to_path_buf(), archive.clone())
        .await
        .unwrap();
    let (sidecar_handle, _worker) = SidecarHandle::new(archive, account_manager.clone());
    let server = WascheMcpServer::new(account_manager, Arc::new(sidecar_handle));

    let contacts_json = server
        .whatsapp_list_contacts(Parameters(ListContactsParams {
            query: Some("Alice".to_string()),
            account_id: None,
            limit: Some(10),
        }))
        .await
        .unwrap();

    assert!(contacts_json.contains("Alice Smith"));
    assert!(contacts_json.contains("+6281234567890"));
}

#[tokio::test]
async fn test_mcp_bridge_mode_instantiation() {
    let bridge_server = WascheMcpServer::new_bridge(3030);
    let dashboard_res = bridge_server.whatsapp_open_dashboard().await.unwrap();
    assert!(dashboard_res.contains("3030"));
}

#[tokio::test]
async fn test_delivery_log_upsert_on_retry() {
    let dir = tempdir().unwrap();
    let archive_path = dir.path().join("archive.db");
    let archive = Archive::open(archive_path).unwrap();

    let campaign_id = archive
        .create_campaign(
            "default",
            "Test Campaign",
            "Hello",
            None,
            10,
            20,
            None,
            1000,
        )
        .unwrap();
    let run = archive
        .create_or_get_active_run(campaign_id, 1, 1000)
        .unwrap();

    let mut log = wasche::archive::DeliveryLog {
        id: 0,
        campaign_id,
        run_id: Some(run.id),
        recipient_id: Some(1),
        jid: "6281234567890@s.whatsapp.net".to_string(),
        phone_number: "+6281234567890".to_string(),
        display_name: Some("Test User".to_string()),
        status: "retrying".to_string(),
        error_reason: Some("Retry #1/2 in 30s: Connection timeout".to_string()),
        message_id: None,
        sender_account: Some("default".to_string()),
        timestamp: 1000,
    };

    // 1. Initial attempt fails -> inserts log
    archive.record_delivery_log(&log).unwrap();
    let logs_attempt1 = archive.list_logs_for_run(run.id, None, None, 10).unwrap();
    assert_eq!(logs_attempt1.len(), 1);
    assert_eq!(logs_attempt1[0].status, "retrying");

    // 2. Retry attempt fails -> updates existing log instead of duplicating
    log.status = "retrying".to_string();
    log.error_reason = Some("Retry #2/2 in 60s: Connection timeout".to_string());
    log.timestamp = 1030;
    archive.record_delivery_log(&log).unwrap();
    let logs_attempt2 = archive.list_logs_for_run(run.id, None, None, 10).unwrap();
    assert_eq!(
        logs_attempt2.len(),
        1,
        "Log row must update in-place without duplicating"
    );
    assert_eq!(
        logs_attempt2[0].error_reason.as_deref(),
        Some("Retry #2/2 in 60s: Connection timeout")
    );

    // 3. Final attempt fails -> updates same row to 'failed'
    log.status = "failed".to_string();
    log.error_reason = Some("Permanent failure: client is not connected".to_string());
    log.timestamp = 1090;
    archive.record_delivery_log(&log).unwrap();
    let logs_attempt3 = archive.list_logs_for_run(run.id, None, None, 10).unwrap();
    assert_eq!(
        logs_attempt3.len(),
        1,
        "Must maintain exactly 1 row per recipient per run"
    );
    assert_eq!(logs_attempt3[0].status, "failed");

    let run_state = archive.get_run(run.id).unwrap().unwrap();
    assert_eq!(run_state.failed_count, 1);
}

#[tokio::test]
async fn test_jid_normalization_and_contact_dedup() {
    use wasche::whatsapp::normalize_user_jid;

    assert_eq!(
        normalize_user_jid("199046115373105:57@lid"),
        Some("199046115373105@lid".to_string())
    );
    assert_eq!(
        normalize_user_jid("6285389229489:2@s.whatsapp.net"),
        Some("6285389229489@s.whatsapp.net".to_string())
    );
    assert_eq!(normalize_user_jid("123456789-987654321@g.us"), None);

    let dir = tempdir().unwrap();
    let archive_path = dir.path().join("archive.db");
    let archive = Archive::open(&archive_path).unwrap();

    // Manually insert legacy garbage contacts
    let _ = archive.upsert_contact(&Contact {
        id: "199046115373105:57@lid".to_string(),
        full_name: None,
        first_name: None,
        push_name: Some("zhidan".to_string()),
        phone_number: Some("+199046115373105:57@lid".to_string()),
        avatar_url: None,
        updated_at: 1000,
    });
    let _ = archive.upsert_contact(&Contact {
        id: "6285389229489@s.whatsapp.net".to_string(),
        full_name: Some("Zhidan Tavatoni".to_string()),
        first_name: None,
        push_name: None,
        phone_number: Some("+6285389229489".to_string()),
        avatar_url: None,
        updated_at: 1000,
    });

    // Re-opening archive triggers cleanup migration
    drop(archive);
    let archive2 = Archive::open(&archive_path).unwrap();
    let contacts = archive2.list_contacts(None, None, 50, 0).unwrap();
    assert_eq!(contacts.len(), 1);
    assert_eq!(contacts[0].id, "6285389229489@s.whatsapp.net");
    assert_eq!(contacts[0].full_name.as_deref(), Some("Zhidan Tavatoni"));
}

#[tokio::test]
async fn test_account_typing_mutual_exclusion() {
    let dir = tempdir().unwrap();
    let archive_path = dir.path().join("archive.db");
    let archive = Archive::open(archive_path).unwrap();

    let campaign_id = archive
        .create_campaign(
            "Grlossy",
            "Single Account Campaign",
            "Hello",
            None,
            10,
            20,
            None,
            1000,
        )
        .unwrap();

    let recipients = vec![
        wasche::archive::NewRecipient {
            jid: "6285389229489@s.whatsapp.net".to_string(),
            phone_number: "+6285389229489".to_string(),
            display_name: Some("Zhidan".to_string()),
            custom_fields_json: None,
        },
        wasche::archive::NewRecipient {
            jid: "6281288214415@s.whatsapp.net".to_string(),
            phone_number: "+6281288214415".to_string(),
            display_name: Some("Dicky".to_string()),
            custom_fields_json: None,
        },
    ];
    archive.add_recipients(campaign_id, &recipients).unwrap();

    // 1. Account 'Grlossy' claims the first recipient (Zhidan) -> becomes 'typing'
    let claim1 = archive
        .claim_next_recipient(campaign_id, "Grlossy", 1000)
        .unwrap();
    assert!(claim1.is_some());
    let r1 = claim1.unwrap();
    assert_eq!(r1.display_name.as_deref(), Some("Zhidan"));
    assert_eq!(r1.status, "typing");

    // 2. While 'Grlossy' is typing to Zhidan, attempt to claim next recipient for 'Grlossy' MUST return None
    let claim2 = archive
        .claim_next_recipient(campaign_id, "Grlossy", 1001)
        .unwrap();
    assert!(
        claim2.is_none(),
        "Same sender account cannot type to two recipients simultaneously!"
    );

    // 3. Complete recipient 1 -> status transitions to 'sent'
    archive
        .update_recipient_status(r1.id, "sent", None, Some(1010))
        .unwrap();

    // 4. Now that Grlossy is done with Zhidan, Grlossy can claim Dicky!
    let claim3 = archive
        .claim_next_recipient(campaign_id, "Grlossy", 1011)
        .unwrap();
    assert!(claim3.is_some());
    let r2 = claim3.unwrap();
    assert_eq!(r2.display_name.as_deref(), Some("Dicky"));
    assert_eq!(r2.status, "typing");
}

#[tokio::test]
async fn test_mcp_run_logs_tools() {
    let dir = tempdir().unwrap();
    let archive_path = dir.path().join("archive.db");
    let archive = Archive::open(archive_path).unwrap();

    let campaign_id = archive
        .create_campaign(
            "default",
            "Runs & Logs Test",
            "Hello",
            None,
            10,
            20,
            None,
            1000,
        )
        .unwrap();
    let run = archive
        .create_or_get_active_run(campaign_id, 1, 1000)
        .unwrap();

    let log = wasche::archive::DeliveryLog {
        id: 0,
        campaign_id,
        run_id: Some(run.id),
        recipient_id: Some(1),
        jid: "6281234567890@s.whatsapp.net".to_string(),
        phone_number: "+6281234567890".to_string(),
        display_name: Some("Test Recipient".to_string()),
        status: "sent".to_string(),
        error_reason: None,
        message_id: Some("MSG123".to_string()),
        sender_account: Some("default".to_string()),
        timestamp: 1005,
    };
    archive.record_delivery_log(&log).unwrap();
    archive.complete_run(run.id, "completed", 1010).unwrap();

    let account_manager = AccountManager::init(dir.path().to_path_buf(), archive.clone())
        .await
        .unwrap();
    let (sidecar_handle, _worker) = SidecarHandle::new(archive, account_manager.clone());
    let server = WascheMcpServer::new(account_manager, Arc::new(sidecar_handle));

    // 1. List campaign runs
    let runs_json = server
        .whatsapp_list_campaign_runs(Parameters(ListCampaignRunsParams { campaign_id }))
        .await
        .unwrap();
    assert!(runs_json.contains("\"run_number\": 1"));
    assert!(runs_json.contains("\"completed\""));

    // 2. Get run logs for specific run
    let run_logs_json = server
        .whatsapp_get_run_logs(Parameters(GetRunLogsParams {
            campaign_id,
            run_id: Some(run.id),
            query: Some("Test".to_string()),
            status: Some("sent".to_string()),
            limit: Some(10),
        }))
        .await
        .unwrap();
    assert!(run_logs_json.contains("MSG123"));
    assert!(run_logs_json.contains("6281234567890"));

    // Verify search with non-matching query returns empty
    let run_logs_empty = server
        .whatsapp_get_run_logs(Parameters(GetRunLogsParams {
            campaign_id,
            run_id: Some(run.id),
            query: Some("NonExistent".to_string()),
            status: None,
            limit: Some(10),
        }))
        .await
        .unwrap();
    assert_eq!(run_logs_empty.trim(), "[]");

    // Verify filter with non-matching status returns empty
    let run_logs_no_fail = server
        .whatsapp_get_run_logs(Parameters(GetRunLogsParams {
            campaign_id,
            run_id: Some(run.id),
            query: None,
            status: Some("failed".to_string()),
            limit: Some(10),
        }))
        .await
        .unwrap();
    assert_eq!(run_logs_no_fail.trim(), "[]");

    // 3. Get campaign logs across runs with query/status
    let camp_logs_json = server
        .whatsapp_get_campaign_logs(Parameters(GetCampaignLogsParams {
            campaign_id,
            query: Some("628123".to_string()),
            status: Some("sent".to_string()),
            limit: Some(10),
        }))
        .await
        .unwrap();
    assert!(camp_logs_json.contains("MSG123"));
}

#[tokio::test]
async fn test_mcp_update_campaign_delay_range() {
    let dir = tempdir().unwrap();
    let archive_path = dir.path().join("archive.db");
    let archive = Archive::open(archive_path).unwrap();

    let campaign_id = archive
        .create_campaign(
            "default",
            "Delay Range Test",
            "Hello",
            None,
            20,
            45,
            None,
            1000,
        )
        .unwrap();

    let account_manager = AccountManager::init(dir.path().to_path_buf(), archive.clone())
        .await
        .unwrap();
    let (sidecar_handle, _worker) = SidecarHandle::new(archive.clone(), account_manager.clone());
    let server = WascheMcpServer::new(account_manager, Arc::new(sidecar_handle));

    // Update delay range
    let res = server
        .whatsapp_update_campaign_delay_range(Parameters(UpdateCampaignDelayRangeParams {
            campaign_id,
            min_delay_secs: 30,
            max_delay_secs: 60,
        }))
        .await
        .unwrap();
    assert!(res.contains("30s – 60s"));

    // Verify in archive
    let c = archive.get_campaign(campaign_id).unwrap().unwrap();
    assert_eq!(c.min_delay_secs, 30);
    assert_eq!(c.max_delay_secs, 60);

    // Invalid range check (min > max)
    let invalid = server
        .whatsapp_update_campaign_delay_range(Parameters(UpdateCampaignDelayRangeParams {
            campaign_id,
            min_delay_secs: 60,
            max_delay_secs: 30,
        }))
        .await;
    assert!(invalid.is_err());
}

#[tokio::test]
async fn test_mcp_list_campaign_recipients_search_and_filter() {
    let dir = tempdir().unwrap();
    let archive_path = dir.path().join("archive.db");
    let archive = Archive::open(archive_path).unwrap();

    let campaign_id = archive
        .create_campaign(
            "default",
            "Recipients Search Test",
            "Hello",
            None,
            10,
            20,
            None,
            1000,
        )
        .unwrap();

    let recipients = vec![
        wasche::archive::NewRecipient {
            jid: "6285389229489@s.whatsapp.net".to_string(),
            phone_number: "+6285389229489".to_string(),
            display_name: Some("Zhidan Tavatoni".to_string()),
            custom_fields_json: None,
        },
        wasche::archive::NewRecipient {
            jid: "6285922554688@s.whatsapp.net".to_string(),
            phone_number: "+6285922554688".to_string(),
            display_name: Some("Rani".to_string()),
            custom_fields_json: None,
        },
    ];
    archive.add_recipients(campaign_id, &recipients).unwrap();

    let account_manager = AccountManager::init(dir.path().to_path_buf(), archive.clone())
        .await
        .unwrap();
    let (sidecar_handle, _worker) = SidecarHandle::new(archive.clone(), account_manager.clone());
    let server = WascheMcpServer::new(account_manager, Arc::new(sidecar_handle));

    // 1. List all recipients
    let all = server
        .whatsapp_list_campaign_recipients(Parameters(ListCampaignRecipientsParams {
            campaign_id,
            query: None,
            status: None,
            limit: None,
            offset: None,
        }))
        .await
        .unwrap();
    assert!(all.contains("Zhidan Tavatoni"));
    assert!(all.contains("Rani"));

    // 2. Search by name
    let search_name = server
        .whatsapp_list_campaign_recipients(Parameters(ListCampaignRecipientsParams {
            campaign_id,
            query: Some("Zhidan".to_string()),
            status: None,
            limit: None,
            offset: None,
        }))
        .await
        .unwrap();
    assert!(search_name.contains("Zhidan Tavatoni"));
    assert!(!search_name.contains("Rani"));

    // 3. Search by phone substring
    let search_phone = server
        .whatsapp_list_campaign_recipients(Parameters(ListCampaignRecipientsParams {
            campaign_id,
            query: Some("592255".to_string()),
            status: None,
            limit: None,
            offset: None,
        }))
        .await
        .unwrap();
    assert!(search_phone.contains("Rani"));
    assert!(!search_phone.contains("Zhidan"));

    // 4. Filter by status
    let filter_queued = server
        .whatsapp_list_campaign_recipients(Parameters(ListCampaignRecipientsParams {
            campaign_id,
            query: None,
            status: Some("queued".to_string()),
            limit: None,
            offset: None,
        }))
        .await
        .unwrap();
    assert!(filter_queued.contains("Zhidan"));
    assert!(filter_queued.contains("Rani"));

    let filter_sent = server
        .whatsapp_list_campaign_recipients(Parameters(ListCampaignRecipientsParams {
            campaign_id,
            query: None,
            status: Some("sent".to_string()),
            limit: None,
            offset: None,
        }))
        .await
        .unwrap();
    assert_eq!(filter_sent.trim(), "[]");
}

#[tokio::test]
async fn test_mcp_campaign_senders_add_remove() {
    let dir = tempdir().unwrap();
    let archive_path = dir.path().join("archive.db");
    let archive = Archive::open(archive_path).unwrap();

    let campaign_id = archive
        .create_campaign(
            "default",
            "Sender Pool Test",
            "Hello",
            None,
            10,
            20,
            None,
            1000,
        )
        .unwrap();

    let account_manager = AccountManager::init(dir.path().to_path_buf(), archive.clone())
        .await
        .unwrap();
    let (sidecar_handle, _worker) = SidecarHandle::new(archive.clone(), account_manager.clone());
    let server = WascheMcpServer::new(account_manager, Arc::new(sidecar_handle));

    // 1. Add 'sales' sender account
    let add_res = server
        .whatsapp_add_campaign_sender(Parameters(CampaignSenderParams {
            campaign_id,
            account_id: "sales".to_string(),
        }))
        .await
        .unwrap();
    assert!(add_res.contains("default, sales"));

    let c = archive.get_campaign(campaign_id).unwrap().unwrap();
    assert_eq!(c.account_id, "default, sales");

    // 2. Remove 'default' sender account
    let rem_res = server
        .whatsapp_remove_campaign_sender(Parameters(CampaignSenderParams {
            campaign_id,
            account_id: "default".to_string(),
        }))
        .await
        .unwrap();
    assert!(rem_res.contains("sales"));

    let c2 = archive.get_campaign(campaign_id).unwrap().unwrap();
    assert_eq!(c2.account_id, "sales");

    // 3. Removing last sender should error
    let rem_last = server
        .whatsapp_remove_campaign_sender(Parameters(CampaignSenderParams {
            campaign_id,
            account_id: "sales".to_string(),
        }))
        .await;
    assert!(rem_last.is_err());
}
