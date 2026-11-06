# Wasche Web Dashboard

> Modern client-side SPA (SolidJS v2 + Vite 8 + TypeScript 7 + Tailwind CSS v4) embedded directly within the Wasche Rust binary for monitoring WhatsApp campaigns, account pairing, and media editing.

---

## Architecture

The dashboard is built natively on **Vite 8** and **SolidJS v2** (`@solidjs/web`):

- **Ultra-Fast 500ms Compilation**: Native Vite SPA architecture builds 20x faster with zero SSR overhead.
- **Frame-0 SWR Hydration**: Active accounts hydrate synchronously from `localStorage` with zero latency before background REST calls complete.
- **Embedded Asset Serving**: The production build (`dist/`) is embedded directly into the Rust executable at compile time via `rust-embed`, serving on `http://127.0.0.1:3030` (with automatic port discovery fallback).
- **Real-Time Polling & Reactive Signals**: Monitored queues, typing indicators, run logs, and delivery statistics update smoothly without page reloads.
- **Auto-Focused Active Runs**: Initiating or re-running a broadcast automatically switches the view to the **Run Logs** tab and focuses the running run for real-time delivery monitoring.

## Directory Structure

```text
dashboard/
├── src/
│   ├── components/
│   │   ├── Dashboard.tsx            # Main layout controller and view switcher
│   │   ├── Header.tsx               # Top navigation bar with active account status
│   │   ├── Sidebar.tsx              # Navigation rail and account indicators
│   │   ├── CampaignsView.tsx        # Broadcast campaigns grid, live search bar, and status pills
│   │   ├── CampaignDetailView.tsx   # Lightweight orchestrator for campaign tabs
│   │   ├── ContactsView.tsx         # Address book search and quick direct messaging
│   │   ├── DevicesView.tsx          # Multi-account pairing and connection manager
│   │   ├── Modals.tsx               # Lightweight dialog orchestrator
│   │   ├── ToastContainer.tsx       # Reactive toast notification alerts
│   │   ├── store.ts                 # Central SolidJS reactive signals & API actions
│   │   ├── types.ts                 # Shared TypeScript interfaces and enums
│   │   ├── campaign-detail/         # Decomposed campaign detail views
│   │   │   ├── CampaignMacroCards.tsx
│   │   │   ├── CampaignContactsTab.tsx
│   │   │   ├── CampaignTemplateTab.tsx
│   │   │   └── CampaignRunLogsTab.tsx
│   │   └── modals/                  # Decomposed modal dialog views
│   │       ├── AddAccountModal.tsx
│   │       ├── QrScanModal.tsx
│   │       ├── PairPhoneModal.tsx
│   │       ├── DirectMessageModal.tsx
│   │       ├── AddContactsModal.tsx
│   │       ├── CreateCampaignModal.tsx
│   │       ├── RenameModal.tsx
│   │       ├── ConfirmModal.tsx
│   │       ├── VideoTrimmerModal.tsx
│   │       ├── PhotoStudioModal.tsx
│   │       └── shared.ts
│   ├── styles/
│   │   └── global.css               # Dark theme color variables and animations
│   ├── icons.tsx                    # Native SolidJS v2 SVG icon components
│   └── index.tsx                    # Application bootstrap & DOM mount entry
├── public/                          # Static brand icons, logos, and wallpapers
├── index.html                       # Single-page application HTML entrypoint
├── vite.config.ts                   # Vite configuration with SolidJS v2 and Tailwind v4
└── package.json
```

---

## Development & Build Commands

All commands are run from the `dashboard/` directory:

| Command                 | Description                                                              |
| :---------------------- | :----------------------------------------------------------------------- |
| `pnpm install`          | Installs frontend dependencies.                                          |
| `pnpm dev`              | Starts local Vite development server on `http://localhost:3000`.         |
| `pnpm build`            | Compiles the production SPA to `dist/` (required before `cargo build`).  |
| `pnpm preview`          | Serves the local `dist/` build preview.                                  |
| `pnpm run lint`         | Runs `oxlint` high-performance linter across all dashboard source files. |
| `pnpm run lint:fix`     | Runs `oxlint --fix` to auto-fix linting issues.                          |
| `pnpm run format`       | Formats all source files in place with `oxfmt` (~100ms).                 |
| `pnpm run format:check` | Verifies formatting compliance with `oxfmt --check`.                     |

---

## Key UI Modules & Features

1. **Multi-Sender Account Pooling Popover**: Interactive selector in `CampaignDetailView` allowing operators to pool multiple linked WhatsApp numbers (`account_id: "Grlossy, sales"` or `"all"`) with live status dots, phone numbers, and one-click selection.
2. **Anti-Ban Jitter Delay Range Editor**: Inline editor directly on the macro card allowing operators to adjust minimum and maximum delay seconds (e.g. 5s – 15s) with live toast feedback.
3. **Real-Time Campaign Table Search**: Instant client-side filtering on `CampaignsView` across campaign names, sender accounts, and statuses with dynamic item counters.
4. **Automated Live Run Logs Focusing**: Re-running or launching a campaign automatically shifts tabs to **Run Logs** and locks onto the active `running` execution run.
5. **WhatsApp Photo Studio**: Interactive in-browser canvas editor supporting cropping, rotating, doodling with color palette, and text caption stamps.
6. **Video Trimmer Studio**: Filmstrip scrubber with millisecond precision, keyframe capture, audio mute toggle, and automated WhatsApp 16 MB rate control enforcement.

## License

Licensed under the **Apache License, Version 2.0**.
