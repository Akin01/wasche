# Wasche (WhatsApp Scheduler & MCP Sidecar)

A Model Context Protocol (MCP) server and background scheduler sidecar for WhatsApp, powered by [`whatsapp-rust`](https://github.com/crmne/whatsapp-rust) and built with the official Rust MCP SDK [`rmcp`](https://github.com/modelcontextprotocol/rust-sdk).

## Architecture & Findings

The architectural design, anti-abuse threat models, and implementation blueprints are documented in the architecture guides:

- **Architecture Specification**: [`docs/whatsapp-mcp-scheduler-architecture.md`](docs/whatsapp-mcp-scheduler-architecture.md)
- **Broadcast Durability & Anti-Abuse**: [`docs/broadcast-durability-and-anti-abuse.md`](docs/broadcast-durability-and-anti-abuse.md)
- **Media & Multi-Attachment Realities**: [`docs/whatsapp-media-multi-attachment-realities.md`](docs/whatsapp-media-multi-attachment-realities.md)
## Core Capabilities

- **AI Agent MCP Interface**: Exposes declarative tools for Claude, Codex, Gemini, etc. to send direct messages, query contacts, list chats, and schedule broadcast campaigns.
- **Background Sidecar Scheduler**: Runs continuous queue management, cron-like promotion of scheduled campaigns, and delivery tracking.
- **Human Emulation & Anti-Ban**: Dynamic typing presence (`send_composing`/`send_paused`), randomized inter-recipient jitter (e.g. 25–90s delay), and template interpolation.
- **Persistent State**: SQLite storage for device session keys, recipient queues, contacts, and delivery metrics.
