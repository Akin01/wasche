# Wasche Web Dashboard

> Modern client-side SPA (Astro + SolidJS + Tailwind CSS) embedded directly within the Wasche Rust binary for monitoring WhatsApp campaigns, account pairing, and media editing.

---

## Architecture

The dashboard is built on **Astro 7** with client-only **SolidJS** islands (`client:only="solid-js"`):

- **Frame-0 SWR Hydration**: Active accounts hydrate synchronously from `localStorage` with zero latency before background REST calls complete.
- **Embedded Asset Serving**: The production build (`dist/`) is embedded directly into the Rust executable at compile time via `rust-embed`, serving on `http://127.0.0.1:3030`.
- **Real-Time Polling & Reactive Signals**: Monitored queues, typing indicators, and delivery statistics update smoothly without page reloads.

---

## Directory Structure

```text
dashboard/
├── src/
│   ├── components/solid/
│   │   ├── Dashboard.tsx            # Main layout controller and view switcher
│   │   ├── Header.tsx               # Top navigation bar with active account status
│   │   ├── Sidebar.tsx              # Navigation rail and account indicators
│   │   ├── CampaignsView.tsx        # Broadcast campaigns grid and status pills
│   │   ├── CampaignDetailView.tsx   # Contacts table, template composer, and run logs
│   │   ├── ContactsView.tsx         # Address book search and quick direct messaging
│   │   ├── DevicesView.tsx          # Multi-account pairing and connection manager
│   │   ├── Modals.tsx               # Photo Studio, Video Trimmer, QR pairing modals
│   │   ├── ToastContainer.tsx       # Reactive toast notification alerts
│   │   ├── store.ts                 # Central SolidJS reactive signals & API actions
│   │   └── types.ts                 # Shared TypeScript interfaces and enums
│   ├── layouts/
│   │   └── Layout.astro             # Base HTML shell and theme fonts
│   ├── pages/
│   │   ├── index.astro              # Brand welcome landing page with auto-redirect
│   │   ├── campaign.astro           # Campaigns and campaign detail view
│   │   ├── contacts.astro           # Address book contacts route
│   │   └── devices.astro            # Managed WhatsApp accounts route
│   └── styles/
│       └── global.css               # Dark theme color variables and animations
├── public/                          # Static brand icons, logos, and wallpapers
├── astro.config.mjs                 # Astro configuration with SolidJS integration
└── package.json
```

---

## Development & Build Commands

All commands are run from the `dashboard/` directory:

| Command | Description |
| :--- | :--- |
| `pnpm install` | Installs frontend dependencies. |
| `pnpm dev` | Starts local Vite development server on `http://localhost:4321`. |
| `pnpm build` | Compiles the production SPA to `dist/` (required before `cargo build`). |
| `pnpm preview` | Serves the local `dist/` build preview. |

---

## Media Editing Studios

1. **WhatsApp Photo Studio**: Interactive in-browser canvas editor supporting cropping, rotating, doodling with color palette, and text caption stamps.
2. **Video Trimmer Studio**: Filmstrip scrubber with millisecond precision, keyframe capture, audio mute toggle, and automated WhatsApp 16 MB rate control enforcement.

---

## License

Licensed under the **Apache License, Version 2.0**.
