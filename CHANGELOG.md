# Changelog

All notable changes to the **Wasche** project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---
## [Unreleased]

### Added
- **Contact Name Editing & Derivation**:
  - `Archive::update_contact_name`: Updates contact `full_name`, auto-derives `first_name`, updates `updated_at`, and propagates updated names immediately to queued campaign recipients.
  - REST API `PUT /api/contacts/:jid` (and PATCH/POST) to set custom contact display names.
  - MCP Tool `whatsapp_update_contact`: Allows AI agents to set or edit contact display names using JID or phone number.
  - Dashboard Contacts View: Interactive inline name editing and edit pencil action in the contact table with instant reactive update.

---


## [0.2.0] - 2026-11-06

### Summary
Major feature, performance, and architecture release: expands MCP tooling to 34 native tools, introduces multi-sender account pooling and load balancing, migrates the embedded dashboard to a native SolidJS v2 + Vite 8 SPA with Tailwind CSS v4, decomposes monolithic views into modular components, and delivers full real-time delivery tracking across running queues.

---

### Added

#### Model Context Protocol (MCP) Expansion (34 Tools)
- Expanded native MCP catalog from 20 to **34 comprehensive tools**:
  - `whatsapp_rename_campaign`: Programmatically rename broadcast campaigns.
  - `whatsapp_update_campaign_delay_range`: Update anti-ban jitter delays (`min_delay_secs`, `max_delay_secs`) in real-time.
  - `whatsapp_add_campaign_sender`: Add a WhatsApp account to an active/staged campaign for sender pooling.
  - `whatsapp_remove_campaign_sender`: Safely remove a sender account from a campaign pool (maintaining at least 1 sender invariant).
  - `whatsapp_attach_campaign_media`: Programmatically attach inline media or raw documents to campaigns.
  - `whatsapp_remove_campaign_attachments`: Clear campaign attachment queues.
  - `whatsapp_set_campaign_attachment_mode`: Switch between `media` (inline compressed, max 16 MB) and `document` (raw uncompressed file up to 100 MB).
  - `whatsapp_delete_campaign_recipients`: Batch remove recipients from campaign queues.
  - `whatsapp_get_campaign_logs`: Search and filter delivery logs across all execution runs.
  - `whatsapp_get_run_logs`: Fetch paginated run logs with search by name/number and status filtering.
  - `whatsapp_reset_account_pairing`: Reset local session and Noise keys for an account, preparing for re-pairing.

#### Multi-Sender Account Pooling & Parallel Worker Dispatch
- **Load-Balanced Campaign Execution**: Campaigns support pooling multiple WhatsApp accounts (`account_id: "Grlossy, sales"` or `"all"`) dispatched concurrently.
- **Strict Per-SIM Typing Mutual Exclusion**: Prevents concurrent typing collisions on the same physical line; separate Tokio worker tasks service different accounts in parallel.
- **Dynamic Worker Cooldown & Circuit Breakers**: Independent per-account backoff and 3-strike circuit breaker quarantine logic.

#### Native SolidJS v2 + Vite 8 SPA Dashboard Architecture
- Replaced hybrid Astro multi-page setup with a lightning-fast client-side SPA built on **SolidJS v2** (`2.0.0-rc.21`) and **Vite 8**.
- **Component Decomposition**:
  - Modularized monolithic `Modals.tsx` (5,157 lines) into individual dedicated dialogs under `dashboard/src/components/modals/`.
  - Modularized `CampaignDetailView.tsx` (2,074 lines) into standalone tab views under `dashboard/src/components/campaign-detail/` (`CampaignMacroCards`, `CampaignContactsTab`, `CampaignTemplateTab`, `CampaignRunLogsTab`).
- **Native Solid 2 SVG Icons**: Custom `icons.tsx` providing zero-overhead, statically compiled SVG primitives for the 57 icons used across Wasche, eliminating `@solidjs/web` 1.x import incompatibilities.
- **High-Performance Linting & Formatting**: Added `oxlint` and `oxfmt` configuration, achieving 15ms lint and format passes.

#### Tailwind CSS v4 & High-FPS GPU Transitions
- Full modernization to Tailwind CSS v4 `@theme` tokens, removing deprecated `bg-gradient-to-*` in favor of `bg-linear-to-*`.
- Native `@theme` keyframes (`modal-scale`, `popover-scale`, `fade-enter`) with hardware-accelerated GPU layer promotion (`will-change: transform, opacity; transform: translateZ(0)`).
- Layered shadow tokens (`--shadow-modal`, `--shadow-dropdown`, `--shadow-popover`) with negative spreads for crisp rendering and reduced GPU raster overhead.

---

### Fixed

- **Real-Time Running Campaign Queue Visibility**: Fixed `CampaignRunLogsTab` condition where running campaigns only displayed previously sent messages. The table now displays all recipients in real-time, reflecting live transitions (`queued` $\to$ `typing` $\to$ `sent` / `failed`).
- **Send Now Button Hover State**: Fixed icon disappearance on hover by removing hardcoded `text-[#00a884]` and establishing global CSS rules ensuring action button SVG strokes switch to white (`#fff`) on hover.
- **Confirm Modal Sizing**: Increased `confirm` dialog max width to `max-w-md` (448px), eliminating cramped text wrapping and close button collisions.
- **Clear Selection Button Padding**: Added explicit padding (`px-2.5`, `h-6`) and rounded borders to the "Clear selection" pill in `AddContactsModal`.
- **Recipient Query Pagination**: Increased backend `list_recipients_for_campaign` limit in `get_campaign_status` from 20 to 1,000, ensuring complete recipient lists are available to dashboard clients.
- **Adaptive Dashboard Polling**: Accelerated polling to 1.2s when an active campaign is running, reverting to 4s when idle.
- **VS Code Language Server Cleanliness**: Added canonical `.vscode/settings.json` configuring `css.lint.unknownAtRules: "ignore"`, updated `launch.json` to Vite, and eliminated all warnings across CSS, JSON, HTML, Markdown, and TypeScript language servers.

---

### Performance

- **Modal Opening Latency**: Reduced `create_campaign` max frame time from 99.9ms down to 17.3ms (-83%), and `cut_video` from 66.6ms down to 17.3ms (-74%).
- **Backdrop Blur Elimination**: Removed `backdrop-blur-xs` on full-screen modal overlays, preventing full-viewport Gaussian blur passes on every animation frame.
- **State Hydration**: Batching and deferring mount-time canvas/video initialization by one frame to guarantee fluid 60+ FPS modal openings.

---

## [0.1.0] - 2026-11-03

### Summary
Initial production release of **Wasche**: a native Rust Model Context Protocol (MCP) server, persistent background scheduler sidecar, and concurrent multi-account manager for WhatsApp.

---

### Added

#### Model Context Protocol (MCP) Server
- Implemented official Model Context Protocol server using `rmcp` with declarative `#[tool_router]` and `#[tool]` handlers.
- Exposed 20 comprehensive tools for AI assistants (Claude, Cursor, Codex, Gemini):
  - **Account Management**: `whatsapp_list_accounts`, `whatsapp_add_account`, `whatsapp_remove_account`, `whatsapp_rename_account`, `whatsapp_set_active_account`, `whatsapp_get_status`.
  - **Device Pairing**: `whatsapp_get_qr_code` (raw code, terminal ASCII, deep link, local SVG preview), `whatsapp_pair_with_phone` (8-character link code).
  - **Direct Messaging**: `whatsapp_send_direct`, `whatsapp_send_media` (inline photos/videos), `whatsapp_send_document` (uncompressed raw files up to 100 MB+).
  - **Contact Synchronization**: `whatsapp_list_contacts`, `whatsapp_sync_contacts` (Peer AppState `CriticalUnblockLow` protocol).
  - **Campaign Scheduling**: `whatsapp_schedule_broadcast`, `whatsapp_get_broadcast_status`, `whatsapp_control_broadcast`, `whatsapp_list_broadcasts`, `whatsapp_delete_broadcast`, `whatsapp_update_campaign_template`.
  - **Utilities**: `whatsapp_open_dashboard` to launch the live web interface directly from agent conversation.

#### Multi-Account Architecture
- Concurrent multi-phone management within a single daemon process.
- Isolated filesystem workspaces per account under `data/accounts/{account_id}/session.db`.
- Dynamic on-the-fly registration, linking, and runtime switching without server restarts.
- Coordinated account removal pipeline with engine shutdown, metadata purge, and disk workspace cleanup.

#### Background Scheduler Sidecar
- Continuous background Tokio task monitoring scheduled campaigns and executing delivery queues.
- Single-daemon leader election: the primary process binds port `3030` and runs the scheduler; secondary instances (e.g. MCP stdio bridges) operate strictly as tool bridges.
- Atomic queue checkout (`claim_next_recipient`) protected by SQLite mutex transactions (`conn.lock()`), guaranteeing zero race conditions between concurrent worker threads.
- Multi-run isolation (`broadcast_campaign_runs` and `broadcast_delivery_logs`), disambiguating execution runs and preventing status bleed.
- Targeted recovery actions:
  - `retry_failed`: Resets only failed recipients to `queued` with backoff reset and spawns a dedicated run audit (`Run #N+1`).
  - `resend_aborted`: Resets only canceled recipients from aborted campaigns.

#### Anti-Abuse & Human Emulation Pacing
- Dynamic typing presence emulation calculated proportionally to message length: `t_typing = clamp(len(message) * U(30..50ms), 1.5s, 8.0s)`.
- Inter-recipient delay jittering uniformly sampled between `min_delay_secs` and `max_delay_secs` (default 25–90s).
- Template variable interpolation supporting `{{name}}`, `{{phone}}`, and custom JSON payload attributes.
- 3-strike circuit breaker: quarantines an account for 10 minutes upon 3 consecutive protocol failures to protect SIM reputation.
- Multi-tier anti-duplicate assignment system:
  - Database: Conditional `INSERT INTO broadcast_recipients ... WHERE NOT EXISTS`.
  - REST API: In-memory `HashSet` deduplicating batch request payloads.
  - UI Modal: Selection guard dimming already-added contacts with an `Added` badge.

#### Embedded Web Dashboard (Astro + SolidJS SPA)
- Built on Astro 7 and SolidJS, compiled to static assets and embedded directly into the Rust binary via `rust-embed`.
- Hosted on `http://127.0.0.1:3030` with immediate local browser access.
- Frame-0 SWR local storage hydration (`localStorage.getItem('wasche_cached_accounts')`) eliminating loading flicker.
- Welcoming root landing page (`/`) featuring official brand emblem and automated redirect countdown.
- Real-time campaign tracking: animated typing indicators, breadcrumb navigation, and dual-mode empty states.
- Dedicated tab sliding indicator with hardware-accelerated CSS transforms.
- Live contact avatar streaming proxy (`GET /api/contacts/{jid}/avatar-image`) caching profile photos.
- **WhatsApp Photo Studio**: In-browser canvas editor with cropping, rotating, doodling with 7-color palette, and text caption stamping.
- **Video Trimmer Studio**: Filmstrip scrubber with millisecond precision, keyframe capture, audio mute toggle, and automated 16 MB WhatsApp compliance enforcement.
- Outgoing message preview bubble emulating WhatsApp dark green speech bubble (`#005c4b`) with line break formatting and interactive playable media.

#### npm Distribution & CI/CD
- Cross-platform npm executable wrapper (`npm/bin/run.js`) enabling instant `npx wasche` execution.
- Multi-platform GitHub Actions release workflow cross-compiling for Windows x64, Linux x64, and macOS (arm64 & x64).
- Automatic publishing to the npm registry and creation of GitHub Releases with checksum archives.

---

### Fixed

- **Infinite Staged Run Incrementing**: Fixed issue where starting a newly staged draft campaign queried only `status = 'running'`, causing `COALESCE(MAX(run_number), 0) + 1` to spawn `Run #2` instead of executing `Run #1`.
- **Recipient JID Population**: Fixed missing JID in recipient payloads by implementing fallback resolution from `phone_number` and automatic `@s.whatsapp.net` normalization.
- **Circuit Breaker Deadlock**: Fixed issue where the 10-minute quarantine sleep re-evaluated historical error counts in SQLite, preventing operator resumption actions (`resume`, `start`, `retry_failed`) from resetting the breaker.
- **Multi-Attachment Stanza Deduplication**: Fixed dropped photos when broadcasting bundles containing both photo and video by generating fresh, cryptographically unique stanza IDs for every attachment rather than reusing the first recipient stanza ID.
- **Attachment Inter-Message Delay**: Introduced a 1,500ms pacing delay between multi-media stanzas to prevent WhatsApp server packet collisions.
- **Top Action Bar Style Normalization**: Unified button styling across `Back`, `Start/Pause`, `Abort`, `Retry Failed`, and `Delete` with consistent 32px heights and active scale animations.
- **Account Deletion JSON Parse**: Fixed `ReferenceError: data is not defined` in `store.ts` when removing accounts.
- **Default Account Resurrection**: Removed auto-insertion of `"default"` account in `AccountManager::init()`, enabling users to maintain a clean zero-account state.
- **QR Code Modal Polling**: Restored omitted `else if (m.type === 'qr')` branch in `Modals.tsx`, enabling automatic 30s SVG QR code polling on modal open.
- **Blurry Status Glows**: Removed muddy box-shadow glow halos from `.status-dot.online` and sidebar indicators, rendering clean circular emerald dots.

---

### Security & Durability

- **Local-First Session Storage**: WhatsApp Signal/Noise prekeys and session credentials remain strictly on local disk (`data/accounts/{id}/`), never transmitted to external services.
- **Pre-Flight Handshake Barrier**: Implemented `engine.wait_until_connected(10)` to eliminate false-positive `Connected` states before TLS/Noise handshakes finish.
- **Automated SQLite WAL Checkpoints**: Enforces passive WAL checkpointing on worker shutdown and periodic intervals, preventing unbounded database growth.
- **Single-Flight Transmission Mutex**: Prevents socket collisions and concurrent message transmission from the same SIM card.
- **Apache-2.0 Licensing**: Standardized under the Apache License, Version 2.0 with explicit patent and trademark protections.
