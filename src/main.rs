//! Wasche: WhatsApp MCP Server & Background Scheduler Sidecar entrypoint.

use anyhow::{Context, Result};
use directories::ProjectDirs;
use rmcp::{ServiceExt, transport::stdio};
use std::path::PathBuf;
use std::sync::Arc;
use tracing::{error, info};
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
    let web_port = std::env::var("WASCHE_WEB_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(3030);
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

    info!("Astro UI distribution directory: {:?}", dist_dir);

    let web_dashboard = Arc::new(WebDashboard::new(
        account_manager.clone(),
        Arc::new(sidecar_handle.clone()),
        web_port,
        dist_dir,
    ));

    // Only the primary instance that binds port 3030 runs the background scheduler sidecar.
    // Secondary instances (like child MCP bridges) serve tool requests without running duplicate schedulers.
    let is_primary_daemon = match Arc::clone(&web_dashboard).start().await {
        Ok(_) => {
            info!(
                "Primary Wasche daemon started successfully on port {}",
                web_port
            );
            true
        }
        Err(e) => {
            info!(
                "Port {} in use by active Wasche daemon ({}). Running as MCP bridge.",
                web_port, e
            );
            false
        }
    };

    let cancel_token = tokio_util::sync::CancellationToken::new();
    let cancel_token_clone = cancel_token.clone();

    if is_primary_daemon {
        tokio::spawn(async move {
            sidecar_worker.run(cancel_token_clone).await;
        });
    }

    // 5. Start MCP Server over stdio
    info!("Starting MCP Server on stdio transport...");
    let server = WascheMcpServer::new(account_manager, Arc::new(sidecar_handle));
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
    let _ = archive.wal_checkpoint();
    info!("Wasche MCP Server and background workers shut down cleanly");
    Ok(())
}
