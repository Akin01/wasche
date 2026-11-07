# wasche

> Official [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server and background scheduler sidecar for WhatsApp.

[![npm version](https://img.shields.io/npm/v/@akin01/wasche.svg)](https://www.npmjs.com/package/@akin01/wasche)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io)
[![M8ven Score](https://m8ven.ai/badge/mcp/akin01-wasche-14ow30?v=0626be58d33bb37971b8ce32f22a3d2a)](https://m8ven.ai/mcp/akin01-wasche-14ow30?s=readme)

**Wasche** provides an official MCP server and persistent background scheduler sidecar for WhatsApp, implemented natively in Rust. It enables AI agents (Claude, Cursor, Codex, Gemini, etc.) to safely orchestrate multiple WhatsApp phone numbers, query contacts, dispatch media, and execute high-durability broadcast campaigns protected by human behavioral emulation heuristics.

---

## Quick Start (npx)

Run the server directly without manual installation:

```bash
npx @akin01/wasche
```

---

## MCP Client Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wasche": {
      "command": "npx",
      "args": ["-y", "@akin01/wasche"],
      "env": {
        "RUST_LOG": "info"
      }
    }
  }
}
```

### Cursor & Codex

Add to your workspace `.mcp.json`:

```json
{
  "mcpServers": {
    "wasche": {
      "command": "npx",
      "args": ["-y", "@akin01/wasche"],
      "env": {
        "RUST_LOG": "info"
      }
    }
  }
}
```

---

## Key Features

- **34 Native MCP Tools**: Full programmatic control across Account Lifecycle (9), Direct Messaging (3), Contacts (3), Broadcast Campaigns (8), Queue & Media Attachments (7), Execution Runs & Logs (3), and Dashboard Monitoring (1).
- **Primary Daemon & Lightweight MCP Bridge**: Multiple AI agent subagents or parallel sessions connect smoothly without TCP socket or SQLite lock collisions; secondary instances auto-proxy via lightweight REST bridge.
- **Multi-Sender Account Pooling & Load Balancing**: Pool multiple WhatsApp numbers into a single campaign (`account_id: "Grlossy, sales"` or `"all"`) with SIM-level typing mutual exclusion.
- **Anti-Ban Pacing Heuristics**: Dynamic typing presence (`Chatstate::Composing`), configurable randomized inter-recipient jitter (e.g. 5–15s or 20–45s), single-flight transaction locks, pre-persisted stanza IDs, and 3-strike circuit breakers.
- **Embedded Web Dashboard (SPA)**: Modern SolidJS v2 + Vite 8 browser interface on `http://127.0.0.1:3030` featuring live progress tracking, auto-opened run logs on re-run, instant campaign search, inline jitter delay editor, multi-account selection popover, and Photo/Video Studios.
- **Persistent Local State**: SQLite storage for device session keys, recipient queues, contacts, and delivery audit metrics.
- **Cross-Platform Prebuilt Binaries**: Automatic native binary resolution for Windows (x64), Linux (x64), and macOS (arm64 & x64).

---

## Core MCP Tools Catalog (34 Tools)

| Category | Tool Name | Description |
| :--- | :--- | :--- |
| **Account Lifecycle** | `whatsapp_list_accounts` | Lists all registered accounts, connection states, phone numbers, and active indicator. |
| | `whatsapp_add_account` | Registers a new account connection and begins pairing. |
| | `whatsapp_set_active_account` | Switches the default active account for subsequent tool invocations. |
| | `whatsapp_remove_account` | Shuts down account engine, drops connection, and removes local workspace. |
| | `whatsapp_rename_account` | Renames an account identifier across databases and directories. |
| | `whatsapp_get_status` | Checks WhatsApp connection status, paired phone number, and push name. |
| | `whatsapp_get_qr_code` | Generates WhatsApp pairing QR code (raw, deep link, terminal ASCII, local HTML file). |
| | `whatsapp_pair_with_phone` | Requests an 8-character pairing code to link phone without scanning QR. |
| | `whatsapp_reset_account_pairing` | Clears local pairing session and keys for an account, preparing for re-pairing. |
| **Direct Messaging & Media** | `whatsapp_send_direct` | Sends an immediate 1:1 text, inline media, or document attachment. |
| | `whatsapp_send_media` | Sends an inline photo, video, or audio file (max 16 MB) with optional caption. |
| | `whatsapp_send_document` | Sends a raw uncompressed file attachment (PDF, spreadsheet, raw 4K video up to 100 MB). |
| **Contacts & Address Book** | `whatsapp_list_contacts` | Searches local address book contacts by name or phone number. |
| | `whatsapp_sync_contacts` | Triggers Peer AppState contact sync (`CriticalUnblockLow`) to fetch address book names. |
| | `whatsapp_get_contact_avatar` | Fetches high-resolution contact profile avatar picture URL. |
| **Broadcasts & Pacing** | `whatsapp_schedule_broadcast` | Schedules or launches an anti-ban broadcast campaign with multi-sender pooling. |
| | `whatsapp_list_broadcasts` | Lists broadcast campaigns filtered by status or sender account. |
| | `whatsapp_get_broadcast_status` | Retrieves real-time delivery statistics, progress counts, and logs. |
| | `whatsapp_control_broadcast` | Controls an active campaign (`pause`, `resume`, `abort`, `delete`, `rerun`, `retry_failed`). |
| | `whatsapp_delete_broadcast` | Permanently deletes a campaign and its recipient queue from SQLite. |
| | `whatsapp_rename_campaign` | Renames an existing broadcast campaign. |
| | `whatsapp_update_campaign_template` | Updates the message template of an existing campaign. |
| | `whatsapp_update_campaign_delay_range`| Updates anti-ban jitter delay range (minimum and maximum seconds between messages). |
| **Queue & Attachments** | `whatsapp_list_campaign_recipients` | Lists recipient queue with search by name/number and status filter (`queued`, `sent`, `failed`). |
| | `whatsapp_add_campaign_recipients` | Adds target recipient contacts with optional custom variable values to a campaign. |
| | `whatsapp_delete_campaign_recipients` | Removes target recipient contacts from a broadcast campaign queue. |
| | `whatsapp_resend_recipient` | Requeues an individual recipient that previously failed or was aborted. |
| | `whatsapp_attach_campaign_media` | Attaches a photo, video, or document to an existing campaign. |
| | `whatsapp_remove_campaign_attachments`| Removes specific or all attachments from an existing broadcast campaign. |
| | `whatsapp_set_campaign_attachment_mode`| Toggles delivery mode (`media` for inline compressed vs `document` for uncompressed raw file). |
| | `whatsapp_add_campaign_sender` | Adds a sender WhatsApp account to an existing campaign for multi-account pooling. |
| | `whatsapp_remove_campaign_sender` | Removes a sender WhatsApp account from a campaign (enforces at least 1 remaining sender). |
| **Runs & Delivery Logs** | `whatsapp_list_campaign_runs` | Lists execution runs for a campaign (Run #1, Run #2, etc.) with sent/failed counts and duration. |
| | `whatsapp_get_campaign_logs` | Retrieves recent delivery logs across all execution runs with search and status filtering. |
| | `whatsapp_get_run_logs` | Retrieves detailed delivery logs for a specific run with search and status filter. |
| **Dashboard & UI** | `whatsapp_open_dashboard` | Opens the live web dashboard in the default browser (`http://127.0.0.1:3030`). |
---

## Configuration & Environment Variables

- `WASCHE_DATA_DIR`: Custom path for SQLite databases, accounts, and attachments. Defaults to standard OS user application directory:
  - Windows: `%APPDATA%\wasche\wasche\data`
  - Linux: `~/.local/share/wasche`
  - macOS: `~/Library/Application Support/com.wasche.wasche`
- `RUST_LOG`: Log level filter (`info`, `debug`, `warn`, `trace`).

---

## License

Licensed under the **Apache License, Version 2.0**.
