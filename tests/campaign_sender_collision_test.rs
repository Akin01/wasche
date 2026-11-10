use std::sync::Arc;
use tempfile::tempdir;

use wasche::account::AccountManager;
use wasche::archive::Archive;
use wasche::sidecar::SidecarHandle;

#[tokio::test]
async fn test_get_conflicting_running_senders() {
    let dir = tempdir().unwrap();
    let archive_path = dir.path().join("archive.db");
    let archive = Archive::open(archive_path).unwrap();

    let now = 1_000_000;
    archive.add_managed_account("sales", now).unwrap();
    archive.add_managed_account("support", now).unwrap();
    archive.add_managed_account("marketing", now).unwrap();

    // 1. Create Campaign 1 with account 'sales' in 'running' state
    let c1 = archive
        .create_campaign("sales", "Campaign 1", "Hello", None, 10, 20, None, now)
        .unwrap();
    archive.update_campaign_status(c1, "running", now).unwrap();

    // 2. Check conflict for Campaign 2 with 'sales' -> should conflict with Campaign 1
    let conflicts = archive
        .get_conflicting_running_senders(999, &["sales".to_string()])
        .unwrap();
    assert_eq!(conflicts.len(), 1);
    assert_eq!(conflicts[0].0, "sales");
    assert_eq!(conflicts[0].1, c1);
    assert_eq!(conflicts[0].2, "Campaign 1");

    // 3. Check conflict for Campaign 2 with 'support' -> should NOT conflict
    let conflicts = archive
        .get_conflicting_running_senders(999, &["support".to_string()])
        .unwrap();
    assert!(conflicts.is_empty());

    // 4. Check conflict for Campaign 2 with 'all' wildcard -> should conflict on 'sales'
    let conflicts = archive
        .get_conflicting_running_senders(999, &["all".to_string()])
        .unwrap();
    assert!(
        conflicts
            .iter()
            .any(|(acc, id, _)| acc == "sales" && *id == c1)
    );

    // 5. Check self exclusion: Campaign 1 shouldn't conflict with itself
    let conflicts = archive
        .get_conflicting_running_senders(c1, &["sales".to_string()])
        .unwrap();
    assert!(conflicts.is_empty());

    // 6. Create Campaign 2 with 'all' wildcard in 'running' state
    let c2 = archive
        .create_campaign("all", "Campaign 2 All", "Hello", None, 10, 20, None, now)
        .unwrap();
    archive.update_campaign_status(c2, "running", now).unwrap();

    // 7. Check Campaign 3 with 'support' -> should conflict with Campaign 2
    let conflicts = archive
        .get_conflicting_running_senders(999, &["support".to_string()])
        .unwrap();
    assert!(
        conflicts
            .iter()
            .any(|(acc, id, _)| acc == "support" && *id == c2)
    );
}

#[tokio::test]
async fn test_claim_next_recipient_global_typing_exclusion() {
    let dir = tempdir().unwrap();
    let archive_path = dir.path().join("archive.db");
    let archive = Archive::open(archive_path).unwrap();

    let now = 1_000_000;
    let c1 = archive
        .create_campaign("sales", "Camp 1", "Hello", None, 10, 20, None, now)
        .unwrap();
    let c2 = archive
        .create_campaign("sales", "Camp 2", "Hello", None, 10, 20, None, now)
        .unwrap();

    archive
        .add_recipients(
            c1,
            &[wasche::archive::NewRecipient {
                jid: "123456789@s.whatsapp.net".to_string(),
                phone_number: "123456789".to_string(),
                display_name: Some("Alice".to_string()),
                custom_fields_json: None,
            }],
        )
        .unwrap();

    archive
        .add_recipients(
            c2,
            &[wasche::archive::NewRecipient {
                jid: "987654321@s.whatsapp.net".to_string(),
                phone_number: "987654321".to_string(),
                display_name: Some("Bob".to_string()),
                custom_fields_json: None,
            }],
        )
        .unwrap();

    // Account 'sales' claims recipient in Camp 1 -> status becomes 'typing'
    let r1 = archive
        .claim_next_recipient(c1, "sales", now)
        .unwrap()
        .expect("R1 should be claimed");
    assert_eq!(r1.status, "typing");

    // Account 'sales' attempts to claim recipient in Camp 2 -> MUST return None due to global typing lock!
    let r2_attempt = archive.claim_next_recipient(c2, "sales", now).unwrap();
    assert!(
        r2_attempt.is_none(),
        "Account 'sales' is typing in Camp 1, so Camp 2 claim must return None"
    );

    // Another account 'support' can still claim in Camp 2 if allowed
    let r2_support = archive.claim_next_recipient(c2, "support", now).unwrap();
    assert!(r2_support.is_some());

    // When r1 completes, 'sales' is no longer typing
    archive
        .update_recipient_status(r1.id, "sent", None, Some(now + 1))
        .unwrap();
}

#[tokio::test]
async fn test_control_campaign_rejects_busy_sender() {
    let dir = tempdir().unwrap();
    let archive_path = dir.path().join("archive.db");
    let archive = Archive::open(archive_path).unwrap();

    let account_manager = AccountManager::init(dir.path().to_path_buf(), archive.clone())
        .await
        .unwrap();
    let (sidecar, _worker) = SidecarHandle::new(archive.clone(), account_manager);

    let now = 1_000_000;
    let c1 = archive
        .create_campaign("sales", "Camp 1", "Hello", None, 10, 20, None, now)
        .unwrap();
    let c2 = archive
        .create_campaign("sales", "Camp 2", "Hello", None, 10, 20, None, now)
        .unwrap();

    // Start Camp 1
    sidecar.control_campaign(c1, "start").await.unwrap();
    let camp1 = archive.get_campaign(c1).unwrap().unwrap();
    assert_eq!(camp1.status, "running");

    // Attempt to start Camp 2 -> MUST be rejected because 'sales' is busy in Camp 1
    let err = sidecar.control_campaign(c2, "start").await.unwrap_err();
    let err_msg = err.to_string();
    assert!(
        err_msg.contains("sender account 'sales' is currently active in campaign #"),
        "Unexpected error: {}",
        err_msg
    );

    // Camp 2 must remain in draft state
    let camp2 = archive.get_campaign(c2).unwrap().unwrap();
    assert_eq!(camp2.status, "draft");

    // Pause Camp 1 -> sender 'sales' is released
    sidecar.control_campaign(c1, "pause").await.unwrap();
    let camp1 = archive.get_campaign(c1).unwrap().unwrap();
    assert_eq!(camp1.status, "paused");

    // Now start Camp 2 -> MUST succeed
    sidecar.control_campaign(c2, "start").await.unwrap();
    let camp2 = archive.get_campaign(c2).unwrap().unwrap();
    assert_eq!(camp2.status, "running");
}

#[tokio::test]
async fn test_add_campaign_sender_rejects_busy_sender() {
    let dir = tempdir().unwrap();
    let archive_path = dir.path().join("archive.db");
    let archive = Archive::open(archive_path).unwrap();

    let account_manager = AccountManager::init(dir.path().to_path_buf(), archive.clone())
        .await
        .unwrap();
    let (sidecar, _worker) = SidecarHandle::new(archive.clone(), account_manager);

    let now = 1_000_000;
    let c1 = archive
        .create_campaign("sales", "Camp 1", "Hello", None, 10, 20, None, now)
        .unwrap();
    let c2 = archive
        .create_campaign("support", "Camp 2", "Hello", None, 10, 20, None, now)
        .unwrap();

    sidecar.control_campaign(c1, "start").await.unwrap();
    sidecar.control_campaign(c2, "start").await.unwrap();

    // Camp 2 is running with 'support'. Attempt to dynamically add 'sales' (which is running in Camp 1)
    let err = sidecar.add_campaign_sender(c2, "sales").await.unwrap_err();
    let err_msg = err.to_string();
    assert!(
        err_msg.contains("Cannot add sender 'sales' to running campaign #"),
        "Unexpected error: {}",
        err_msg
    );

    // Verify sender pool of Camp 2 remained unchanged
    let camp2 = archive.get_campaign(c2).unwrap().unwrap();
    assert_eq!(camp2.account_id, "support");
}

#[tokio::test]
async fn test_scheduled_campaign_deferred_when_sender_busy() {
    let dir = tempdir().unwrap();
    let archive_path = dir.path().join("archive.db");
    let archive = Archive::open(archive_path).unwrap();

    let now = 1_000_000;
    let c1 = archive
        .create_campaign("sales", "Camp 1", "Hello", None, 10, 20, None, now)
        .unwrap();
    archive.update_campaign_status(c1, "running", now).unwrap();

    // Campaign 2 is scheduled in the future at creation time
    let c2 = archive
        .create_campaign(
            "sales",
            "Camp 2 Scheduled",
            "Hello",
            None,
            10,
            20,
            Some(now + 50),
            now,
        )
        .unwrap();

    let camp2 = archive.get_campaign(c2).unwrap().unwrap();
    assert_eq!(camp2.status, "scheduled");

    // 1. Scheduler checks due campaigns at later_now (when scheduled_at has arrived):
    // Camp 2 should be deferred because 'sales' is busy in Camp 1
    let later_now = now + 100;
    let promoted = archive.promote_due_scheduled_campaigns(later_now).unwrap();
    assert!(
        promoted.is_empty(),
        "Camp 2 should not be promoted while 'sales' is busy"
    );
    let camp2 = archive.get_campaign(c2).unwrap().unwrap();
    assert_eq!(camp2.status, "scheduled");

    // 2. Pause Camp 1
    archive
        .update_campaign_status(c1, "paused", later_now)
        .unwrap();

    // 3. Scheduler checks again: now Camp 2 should be promoted
    let promoted = archive.promote_due_scheduled_campaigns(later_now).unwrap();
    assert_eq!(promoted, vec![c2]);
    let camp2 = archive.get_campaign(c2).unwrap().unwrap();
    assert_eq!(camp2.status, "running");
}
