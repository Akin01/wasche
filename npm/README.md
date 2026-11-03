# wasche

> Official [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server and background scheduler sidecar for WhatsApp.

[![npm version](https://img.shields.io/npm/v/@akin01/wasche.svg)](https://www.npmjs.com/package/@akin01/wasche)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-Compatible-purple.svg)](https://modelcontextprotocol.io)

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

- **20+ MCP Tools**: Pair accounts, send direct messages, query contacts, schedule human-paced broadcasts.
- **Embedded Web Dashboard**: Modern browser interface on `http://127.0.0.1:3030` featuring live progress tracking, chat preview bubble, Photo Studio, and Video Trimmer.
- **Anti-Ban Pacing Heuristics**: Dynamic typing presence (`Chatstate::Composing`), randomized inter-recipient jitter (e.g. 25–90s delay), single-flight transaction locks, and 3-strike circuit breakers.
- **Persistent Local State**: SQLite storage for device session keys, recipient queues, contacts, and delivery metrics.
- **Cross-Platform Prebuilt Binaries**: Automatic native binary resolution for Windows (x64), Linux (x64), and macOS (arm64 & x64).

---

## Core MCP Tools

| Tool | Description |
| :--- | :--- |
| `whatsapp_list_accounts` | Lists all registered accounts, connection states, and active account. |
| `whatsapp_add_account` | Registers a new account connection and begins pairing. |
| `whatsapp_get_status` | Checks connection status, paired phone number, and push name. |
| `whatsapp_get_qr_code` | Generates QR code (raw, deep link, terminal ASCII, HTML file). |
| `whatsapp_pair_with_phone` | Generates an 8-character pairing code to link phone without QR. |
| `whatsapp_send_direct` | Sends an immediate 1:1 message, photo/video, or document attachment. |
| `whatsapp_send_media` | Sends an inline photo, video, or audio file (max 16 MB). |
| `whatsapp_send_document` | Sends a raw uncompressed file attachment (up to 100 MB+). |
| `whatsapp_list_contacts` | Searches local address book contacts by name or phone number. |
| `whatsapp_sync_contacts` | Triggers Peer AppState contact sync (`CriticalUnblockLow`). |
| `whatsapp_schedule_broadcast`| Schedules or launches an anti-ban broadcast campaign. |
| `whatsapp_get_broadcast_status` | Retrieves real-time delivery statistics and logs. |
| `whatsapp_control_broadcast` | Controls an active campaign (`pause`, `resume`, `abort`, `delete`). |
| `whatsapp_open_dashboard` | Opens the live web dashboard in the default browser. |

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
