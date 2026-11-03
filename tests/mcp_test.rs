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
