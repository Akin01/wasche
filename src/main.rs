//! Wasche: WhatsApp MCP Server & Background Scheduler Sidecar entrypoint.

use anyhow::{Context, Result};
use directories::ProjectDirs;
use rmcp::{ServiceExt, transport::stdio};
use std::path::PathBuf;
use std::sync::Arc;
use tracing::{error, info, warn};
use tracing_subscriber::EnvFilter;

use wasche::account::AccountManager;
use wasche::archive::Archive;
use wasche::mcp::WascheMcpServer;
use wasche::sidecar::SidecarHandle;
use wasche::web::WebDashboard;

#[tokio::main]
async fn main() -> Result<()> {
    // Tracing MUST log to stderr because stdout is dedicated to the MCP stdio protocol.
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive(tracing::Level::INFO.into()))
        .with_writer(std::io::stderr)
        .with_ansi(false)
        .init();

    info!("Starting Wasche: WhatsApp MCP Server & Background Scheduler Sidecar");

    let web_port = std::env::var("WASCHE_WEB_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(3030);

    // 1. Singleton Check: If an active Wasche primary daemon is already running on port web_port,
    // run as a lightweight MCP bridge over stdio without spawning duplicate WhatsApp engines or touching session.db.
    let is_daemon_running = {
        let test_url = format!("http://127.0.0.1:{}/api/accounts", web_port);
        let config = ureq::config::Config::builder()
            .timeout_global(Some(std::time::Duration::from_millis(500)))
            .build();
        let agent: ureq::Agent = config.into();
        agent.get(&test_url).call().is_ok()
    };

    if is_daemon_running {
        info!(
            "Active Wasche daemon detected on port {}. Running as lightweight MCP bridge (zero session interference).",
            web_port
        );
        let server = WascheMcpServer::new_bridge(web_port);
        let service = server
            .serve(stdio())
            .await
            .context("Failed to start MCP bridge server over stdio")?;

        info!("Wasche MCP Bridge is active and forwarding requests to primary daemon");
        tokio::select! {
            res = service.waiting() => {
                if let Err(e) = res {
                    error!("MCP stdio service encountered error: {}", e);
                }
            }
            _ = tokio::signal::ctrl_c() => {
                info!("Received Ctrl+C interrupt; initiating bridge shutdown...");
            }
        }
        return Ok(());
    }

    // Determine data directory (default to local ./data or platform app data)
    let data_dir = match std::env::var("WASCHE_DATA_DIR") {
        Ok(val) => PathBuf::from(val),
        Err(_) => {
            let local_data = PathBuf::from("./data");
            if local_data.exists() {
                local_data
            } else if let Some(proj_dirs) = ProjectDirs::from("com", "wasche", "wasche") {
                proj_dirs.data_dir().to_path_buf()
            } else {
                local_data
            }
        }
    };

    std::fs::create_dir_all(&data_dir)
        .with_context(|| format!("Failed to create data directory at {:?}", data_dir))?;

    let archive_path = data_dir.join("archive.db");
    let session_path = data_dir.join("session.db");

    info!("Using data directory: {:?}", data_dir);
    info!("SQLite archive database: {:?}", archive_path);
    info!("WhatsApp session database: {:?}", session_path);

    // 1. Initialize SQLite Archive
    let archive = Archive::open(&archive_path)
        .with_context(|| format!("Failed to initialize archive at {:?}", archive_path))?;

    // 2. Initialize Account Manager (multi-number support)
    let account_manager = AccountManager::init(data_dir.clone(), archive.clone())
        .await
        .with_context(|| "Failed to initialize AccountManager")?;

    // 3. Initialize Background Scheduler Sidecar
    let (sidecar_handle, sidecar_worker) =
        SidecarHandle::new(archive.clone(), account_manager.clone());

    // 4. Start Web Dashboard
    let dist_dir = match std::env::var("WASCHE_DIST_DIR") {
        Ok(val) => PathBuf::from(val),
        Err(_) => {
            let relative = PathBuf::from("dashboard/dist");
            if relative.exists() {
                relative
            } else if let Some(parent) = data_dir.parent() {
                let candidate = parent.join("dashboard/dist");
                if candidate.exists() {
                    candidate
                } else {
                    relative
                }
            } else {
                relative
            }
        }
    };

    info!("SolidJS Vite UI distribution directory: {:?}", dist_dir);

    let web_dashboard = Arc::new(WebDashboard::new(
        account_manager.clone(),
        Arc::new(sidecar_handle.clone()),
        web_port,
        dist_dir,
    ));

    let actual_web_port = match Arc::clone(&web_dashboard).start().await {
        Ok(port) => {
            info!(
                "Primary Wasche daemon started successfully on port {}",
                port
            );
            port
        }
        Err(e) => {
            warn!("Failed to start dashboard on port {}: {}", web_port, e);
            web_port
        }
    };

    let cancel_token = tokio_util::sync::CancellationToken::new();
    let cancel_token_clone = cancel_token.clone();

    tokio::spawn(async move {
        sidecar_worker.run(cancel_token_clone).await;
    });

    // 5. Start MCP Server over stdio
    info!("Starting MCP Server on stdio transport...");
    let server = WascheMcpServer::new(account_manager.clone(), Arc::new(sidecar_handle))
        .with_web_port(actual_web_port);
    let service = server
        .serve(stdio())
        .await
        .context("Failed to start MCP server over stdio")?;

    info!("Wasche MCP Server is active and listening for agent requests");
    // Cooperative process shutdown coordinator
    tokio::select! {
        res = service.waiting() => {
            if let Err(e) = res {
                error!("MCP stdio service encountered error: {}", e);
            }
        }
        _ = tokio::signal::ctrl_c() => {
            info!("Received Ctrl+C interrupt; initiating cooperative shutdown...");
        }
    }

    cancel_token.cancel();
    account_manager.shutdown_all().await;
    let _ = archive.wal_checkpoint();
    info!("Wasche MCP Server and background workers shut down cleanly");
    Ok(())
}
