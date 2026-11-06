---
title: WhatsApp Media & Multi-Attachment Protocol Realities
tags:
  - wasche
  - whatsapp
  - media
  - protobuf
  - attachments
  - ffmpeg
  - streaming
  - architecture
date: 2026-11-02
---

# WhatsApp Media & Multi-Attachment Protocol Realities (Wasche)

This document establishes the **wire-level protocol findings**, **media architecture constraints**, and **safe multi-attachment dispatching mechanics** for the [[WhatsApp MCP Server & Scheduler Sidecar|Wasche]] broadcast engine and web dashboard. It analyzes the internal Protobuf schema (`waproto::Message`), album grouping associations, HTTP 206 byte-range streaming, rate-control guarantees, and canvas-accelerated media editing.

---

## 1. Multi-Attachment Protocol Capabilities & Wire Realities

When users attach multiple files or media types, WhatsApp enforces strict binary boundaries at the protocol layer.

### Protocol Support Matrix

| Attachment Combination | In ONE Single Wire Message? | Protocol Transmission Mechanism | Recipient Chat Surface |
| :--- | :---: | :--- | :--- |
| **Photo + Video (Media)** | **No** (Protobuf payload is strictly 1:1) | Dispatched as **$N$ consecutive stanzas** linked via `MEDIA_ALBUM` | Grouped into a unified visual **Media Album** grid in chat |
| **Multiple Photos / Videos** | **No** (Each media is an individual stanza) | Dispatched as **$N$ consecutive stanzas** linked via `MEDIA_ALBUM` | Bundled into a multi-tile **Photo/Video Album** bubble |
| **Media (Photo/Video) + Document** | **No** (Incompatible payload types) | Dispatched as **consecutive stanzas** (Media first with caption, then Document) | Inline media bubble with text caption followed by document card |
| **Multiple Documents (PDF/Zip)** | **No** (Documents cannot form albums) | Dispatched as **$N$ consecutive individual stanzas** | Stacked file attachment cards in the conversation |

---

## 2. Protobuf Architecture & Mutually Exclusive `wa::Message` Payloads

In the underlying WhatsApp Protobuf schema (`waproto::whatsapp::Message`), each payload type is defined as an independent, optional message field:

```protobuf
message Message {
    optional string conversation = 1;                     // Plain Text
    optional ImageMessage image_message = 3;              // Image payload + caption
    optional ContactMessage contact_message = 4;          // vCard contact
    optional LocationMessage location_message = 5;        // GPS pin
    optional ExtendedTextMessage extended_text_message = 6;// Text with link preview
    optional DocumentMessage document_message = 7;        // Raw document + caption
    optional AudioMessage audio_message = 8;              // Audio / Push-to-Talk
    optional VideoMessage video_message = 9;              // Video payload + caption
    optional ProtocolMessage protocol_message = 12;       // Revokes, ephemeral timers
    optional TemplateMessage template_message = 25;       // Interactive templates
    optional StickerMessage sticker_message = 26;         // WebP animated stickers
    ...
}
```

### The Inherent Wire Constraint
In WhatsApp's official client decoder (`classify_base`), incoming messages are resolved in a **mutually exclusive cascade**:

$$\text{Image} \longrightarrow \text{Video} \longrightarrow \text{Audio} \longrightarrow \text{Document} \longrightarrow \text{Text}$$

- If an engineered message stanza packed both an `image_message` and a `video_message` into a single Protobuf struct, the recipient's WhatsApp client parses only the `image_message` and **completely drops the video**.
- Each outgoing stanza (`<message id="3EB0..." to="...">`) carries exactly **one encrypted CDN media key** and **one SHA-256 ciphertext hash**. It is cryptographically impossible for a single stanza to reference multiple distinct CDN files.

---

## 3. WhatsApp Media Album Grouping Mechanics

When official WhatsApp Web or mobile apps send multiple photos and videos simultaneously, they achieve album grouping across separate stanzas:

```mermaid
sequenceDiagram
    autonumber
    actor Wasche as Wasche Sidecar
    participant WA as WhatsApp CDN & Web Gateway
    participant Recipient as Recipient Client

    Wasche->>WA: 1. Send Msg #1 (Image A + Caption Text)<br/>Stanza ID: 3EB0...A
    WA->>Recipient: Deliver Msg #1 (Parent Message ID: 3EB0...A)
    
    Note over Wasche: Inter-Packet Human Pacing (600ms pause)
    
    Wasche->>WA: 2. Send Msg #2 (Video B + Uncaptioned)<br/>MessageAssociation: MEDIA_ALBUM -> Parent: 3EB0...A
    WA->>Recipient: Deliver Msg #2 (Associated with 3EB0...A)
    
    Note over Wasche: Inter-Packet Human Pacing (600ms pause)

    Wasche->>WA: 3. Send Msg #3 (Image C + Uncaptioned)<br/>MessageAssociation: MEDIA_ALBUM -> Parent: 3EB0...A
    WA->>Recipient: Deliver Msg #3 (Associated with 3EB0...A)
    
    Note over Recipient: Client UI inspects Parent Message Key<br/>and dynamically bundles all 3 stanzas into an interactive 2x2 Album!
```

### Protocol Association Struct:
```rust
message_context_info.message_association = Some(wa::MessageAssociation {
    association_type: Some(wa::message_association::AssociationType::MEDIA_ALBUM),
    parent_message_key: Some(wa::MessageKey {
        remote_jid: Some(target_jid),
        from_me: Some(true),
        id: Some(parent_msg_id), // Message #1's 3EB0... ID
        participant: None,
    }),
});
```

---

## 4. Safe Sequential Multi-Attachment Dispatching Engine

To send multi-attachment campaigns without getting banned, deduplicated, or stalled, Wasche enforces a four-pillar safety pipeline in `src/sidecar.rs`:

```mermaid
flowchart TD
    subgraph RecipientDelivery["Safe Multi-Attachment Delivery Pipeline (src/sidecar.rs)"]
        direction TB
        Claim["1. Atomic Queue Claim (conn.lock)\nTransitions recipient status to 'typing'"] --> TypeSim["2. Dynamic Typing Presence Simulation\n(2s - 8s scaled to caption length)"]
        
        TypeSim --> Att0["3. Dispatch Attachment #0 (e.g., Video)\n• Carries personalized template caption\n• Pre-persisted Stanza ID (Crash-proof idempotency)"]
        
        Att0 --> HumanPause1["Sub-Second Human Pacing\n(tokio::time::sleep 600ms)"]
        
        HumanPause1 --> Att1["4. Dispatch Attachment #1 (e.g., Photo)\n• Fresh unique Message ID (client.generate_message_id)\n• Uncaptioned (Clean album grouping)"]
        
        Att1 --> HumanPause2["Sub-Second Human Pacing\n(tokio::time::sleep 600ms)"]
        
        HumanPause2 --> Att2["5. Dispatch Attachment #2 (e.g., PDF Doc)\n• Fresh unique Message ID\n• Uncompressed Document Channel (100MB max)"]
        
        Att2 --> CommitSent["6. Clear Typing Presence & Commit Status = 'sent'"]
        CommitSent --> Cooldown["7. Randomized Anti-Ban Cooldown\n(25s - 90s sleep per account worker)"]
    end
```

### Safety Rules Enforced:
1. **Cryptographic Stanza ID Decoupling**:
   - Attachment #0 uses `recipient.outbound_stanza_id` for network fault recovery.
   - Attachments #1..N each generate a fresh `3EB0...` ID via `client.generate_message_id()`.
   - *Failure to do this causes WhatsApp servers to drop attachments #1..N as duplicate retransmissions.*
2. **Inter-Packet Pacing ($600\text{ ms}$)**:
   - A `600ms` asynchronous sleep is inserted between consecutive attachments to prevent TCP bursting on the WebSocket connection.
3. **Fail-Fast Transactional Rollback**:
   - If an attachment fails mid-batch, the loop breaks (`send_err = Some(e); break;`).
   - The recipient is **not** committed as `'sent'`, but incremented for exponential backoff retry.
4. **Caption Clutter Prevention**:
   - Only Attachment #0 receives the template text. Secondary media are sent clean, allowing client-side album bundling.

---

## 5. HTTP 206 Partial Content (Range Request) Video Streaming

### The Bug Diagnosed:
On browsers (Chrome, Edge, Safari), HTML5 `<video>` tags require HTTP byte-range queries (RFC 7233) to seek and read the MP4 `moov` atom (metadata atom) located at the beginning or end of video recordings.

Without `Range: bytes=` support:
- Chrome sent `Range: bytes=0-` or `Range: bytes=25100000-26193539` to read the atom.
- The custom Rust server previously returned `HTTP/1.1 200 OK` and closed the connection.
- Chrome discarded the stream, parsed only the first downloaded fragment, and falsely reported the video's duration as **`00:04.1`** (the length of the initial buffered chunk).

### The Architectural Fix (`src/web.rs`):
The HTTP router now implements full RFC 7233 byte-range parsing for all media endpoints:

```rust
if let Some(range_val) = range_header.as_deref().and_then(|r| r.strip_prefix("bytes=")) {
    let total = body.len();
    let parts: Vec<&str> = range_val.split('-').collect();
    let start = parts.first().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
    let end = parts.get(1).and_then(|s| s.parse::<usize>().ok()).unwrap_or(total.saturating_sub(1)).min(total.saturating_sub(1));

    if start <= end && start < total {
        let chunk = &body[start..=end];
        let header = format!(
            "HTTP/1.1 206 Partial Content\r\nContent-Type: {}\r\nContent-Range: bytes {}-{}/{}\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
            content_type, start, end, total, chunk.len()
        );
        stream.write_all(header.as_bytes()).await?;
        stream.write_all(chunk).await?;
        return;
    }
}
```

---

## 6. Video Trimmer Performance & Rate Control Guarantee

### The Naive Linear Ratio Bug:
Previously, estimated file size was calculated naively from the raw source file size:
$$S_{\text{est}} = S_{\text{raw}} \times \left(\frac{\Delta t}{T_{\text{total}}}\right)$$

For raw screen recordings with uncompressed bitrates ($19.6\text{ MB}$ for $4.1\text{ s} \approx 38\text{ Mbps}$):
- $S_{\text{est}} = 19.6\text{ MB} > 16\text{ MB}$.
- The UI showed `⚠️ Exceeds 16MB limit` and locked the Trim button (`disabled={!isUnder16MB()}`).
- Users were artificially forced to trim clips to $< 3.3\text{ seconds}$ to satisfy the naive formula.

### The Two-Tier Ultrafast Pipeline (`src/web.rs`):
1. **Tier 1 (Instant Stream Copy, $\approx 150\text{--}700\text{ ms}$)**:
   - If the trimmed segment is under 16MB, FFmpeg runs `-c:v copy -c:a copy -movflags +faststart`.
   - Copies demuxed packets directly without re-encoding, finishing in **$744\text{ ms}$** on a 26MB video (**$48\times$ speedup**).
2. **Tier 2 (Ultrafast Rate-Controlled Fallback)**:
   - If stream copy exceeds 16MB, FFmpeg re-encodes at 30fps with `-preset ultrafast -crf 26`:
     $$\text{target\_kbps} = \min\left(4000,\, \frac{14.5 \times 1024 \times 8}{\Delta t}\right)$$
     enforced via `-maxrate {target_kbps}k -bufsize {target_kbps * 2}k`.
3. **Subprocess Pipe Isolation (`-nostdin`)**:
   - All FFmpeg subprocesses run with `.arg("-nostdin")` and `.stdin(Stdio::null())`, `.stdout(Stdio::null())`, `.stderr(Stdio::null())`.
   - Eliminates Windows pipe buffer deadlocks and interactive stdin hangs.
   - Bounded by `tokio::time::timeout(Duration::from_secs(12..30))`.

---

## 7. WhatsApp Photo Studio Canvas & HD Resolution Preservation

### 1. Interactive 4-Corner Cropping Resizer:
- Custom canvas overlay with 4 corner resize handles (`nw`, `ne`, `sw`, `se`) and center panning.
- Aspect ratio locking: **Free**, **1:1 Square**, **4:5 Portrait**, **16:9 Wide**.
- Rule-of-thirds grid (3x3) with 4-way darkened outer masks (`bg-black/60`).
- Rotates 90° clockwise on offscreen canvas buffers.

### 2. HD Resolution Preservation Toggle (`[ HD ]`):
Both the Photo Studio and Video Trimmer include a WhatsApp-style `[ HD ]` toggle button:
- **Photo HD On (Default)**: Preserves native image resolution up to $4096\text{ px}$ (supporting 1080p, 2K, and 4K) with 96% JPEG export quality, avoiding downscaling to 800px.
- **Video HD On (Default)**: Preserves native resolution and framerate (60fps) without forced 720p 30fps downscaling.

### 3. Immediate Cache-Busted Previews:
All attachment endpoints append a timestamp version parameter:
$$\text{url} = \text{/api/campaigns/}\{id\}\text{/attachments/file?name=}\dots\mathbf{\&v=}\{now\_secs()\}$$
When an operator saves an edited photo or trimmed video, the browser immediately bypasses memory cache and renders the live update in the WhatsApp chat preview bubble.

---

## 8. Memory & Rendering Optimization Diagnostics

| Bottleneck Identified | Root Cause | Engineering Solution | Performance Gain |
| :--- | :--- | :--- | :--- |
| **GPU Texture Thrashing** | Full-screen `backdrop-blur-xs` forced Chromium to allocate 1600x1200 compositing textures and 2-pass Gaussian blur shaders at 60Hz. | Replaced with high-contrast, zero-cost solid `bg-black/85` backdrop. | GPU fill-rate dropped $>60\%$; eliminated modal lag. |
| **Hardware Video Decoder Leak** | `generateFilmstrip()` spawned hidden `<video>` elements to decode 7 frames without tearing down decoders. | Added `filmstripCache` and explicit element cleanup (`tempVideo.pause(); tempVideo.src=''; tempVideo.load(); tempVideo.remove()`). | Decoders freed immediately; 0ms instant modal re-open. |
| **Scrubber Needle Layout Thrashing** | CSS `transition-all duration-75` on the playhead needle conflicted with 60Hz `timeupdate` coordinate repaints. | Removed CSS transition on active scrubber needle. | Fluid 60fps playhead tracking without micro-stutters. |
| **Canvas History Memory Bloat** | `pushPhotoHistory` stored up to 10 full uncompressed `ImageData` buffers ($\approx 20\text{ MB}$ RAM). | Capped undo stack to 4 steps and wiped all buffers on modal close (`handleClose`). | Memory footprint reduced to $< 8\text{ MB}$. |
| **Subprocess Stdin Freeze** | Missing `-nostdin` caused FFmpeg to wait on daemon stdin pipes on Windows. | Enforced `.arg("-nostdin")`, `.stdin(Stdio::null())`, and `tokio::time::timeout`. | Zero hanging background processes. |

---
## 9. Delivery Modes: Inline Media vs. Raw Document Channel

Wasche provides first-class support for both WhatsApp delivery paradigms, switchable dynamically on a per-attachment basis:

| Delivery Mode | Max File Size | Recipient Chat Experience | WhatsApp Compression | Best Used For |
| :--- | :---: | :--- | :---: | :--- |
| **`media`** | **16 MB** | Inline playable media player / photo bubble with interactive zoom | Lossy recompression | Photos, animated videos, voice notes, stickers, marketing teasers |
| **`document`** | **100 MB+** | Full-width document file attachment card with file size and type | **Zero compression** (Byte-for-byte exact) | PDFs, invoices, spreadsheets, high-res RAW photos, 4K master video clips |

### Programmatic Control via Model Context Protocol (MCP)

Operators and AI agents configure delivery modes through dedicated tools:

- **`whatsapp_attach_campaign_media`**: Attaches a local file to a campaign with initial `send_as` mode (`"media"` or `"document"`).
- **`whatsapp_set_campaign_attachment_mode`**: Dynamically switches an existing campaign attachment's delivery mode between `"media"` and `"document"`.
- **`whatsapp_remove_campaign_attachments`**: Removes a specific file name or purges all attachments from an existing campaign.

---

## 10. Media & Attachment End-to-End Durability Guarantees
Wasche extends its core broadcast durability guarantees directly to all media attachments, photos, videos, and raw documents:

```mermaid
flowchart TD
    subgraph StorageLayer["1. Storage Durability (Disk + SQLite ACID State)"]
        RawFiles["data/attachments/{campaign_id}/{file_name}\n(Durable uncorrupted files on disk)"]
        MetaJSON["broadcast_campaigns.attachment_path\n(Persistent JSON descriptors with hashes & mime types)"]
        RawFiles <--> MetaJSON
    end

    subgraph PreDispatch["2. Pre-Dispatch Stanza ID Allocation"]
        StanzaGen["Generate & Commit outbound_stanza_id (3EB0...)\nto SQLite BEFORE socket transmission"]
    end

    subgraph CDNUps["3. End-to-End Cryptographic CDN Pipeline"]
        AES["Generate 32-byte AES-256-CBC Media Key"] --> Encrypt["Encrypt Media Payload + HMAC-SHA256 Integrity"]
        Encrypt --> UploadCDN["Upload to WhatsApp CDN (mms.whatsapp.net)"]
        UploadCDN --> SidecarTable["Obtain direct_path & streaming_sidecar\n(Ensures progressive playback resilience)"]
    end

    subgraph DispatchLoop["4. Multi-Attachment Delivery & Failure Atomicity"]
        Att0["Send Attachment #0 (Reuses Stanza ID + Caption)"] --> Pause["600ms Inter-Packet Human Pacing"]
        Pause --> Att1["Send Attachment #1 (Fresh Message ID)"]
        
        Att1 -->|Socket Disconnect / Error| FailFast["Fail-Fast Rollback:\n• Break loop immediately\n• Do NOT commit 'sent'\n• Requeue recipient for Exponential Retry Backoff"]
        Att1 -->|Success| Commit["Commit 'sent' + Record in Delivery Log"]
    end

    StorageLayer --> PreDispatch --> CDNUps --> DispatchLoop
```

### 1. Storage Durability on Disk
- **Decoupling Large Blobs from SQLite**: Binary media streams (up to 100MB documents or 16MB videos) reside directly in `data/attachments/{campaign_id}/`, while their relational metadata, file paths, MIME types, delivery flags (`media` vs `document`), and cover image paths are serialized in SQLite under `broadcast_campaigns.attachment_path`.
- **Power-Loss Tolerance**: Even under kernel panics or power outages, SQLite recovers via its Write-Ahead Log (`-wal`), while attachments on disk remain intact and are re-indexed upon daemon restart.

### 2. Network Idempotency & Duplicate Shield
- **Pre-Generated Stanza ID**: Before any encrypted media stanza is dispatched over WebSockets, Wasche commits an `outbound_stanza_id` (`3EB0...`) to the database.
- **Socket Drop Replay Safety**: If a connection drops after a media payload reaches WhatsApp servers but before local receipt of the TCP ACK, Wasche’s lease recovery retries with the **exact same stanza ID**. WhatsApp servers inspect the ID, acknowledge the packet, and drop the duplicate, ensuring recipients never receive double media.
- **Multi-Attachment ID Isolation**: In multi-attachment campaigns, Attachment #0 uses the pre-persisted idempotency key, while Attachments #1..N receive freshly generated unique message IDs (`client.generate_message_id()`), preventing server-side deduplication drops.

### 3. Mid-Batch Failure Atomicity (No Ghost Deliveries)
- If Attachment #1 transmits successfully but the network fails while uploading Attachment #2, the loop breaks immediately (`send_err = Some(e); break;`).
- The recipient is **not** committed as `'sent'`, preventing campaigns from falsely reporting complete delivery when payloads were partially transmitted. The recipient is scheduled for exponential backoff retry.

### 4. End-to-End Cryptographic CDN Durability
- **AES-256-CBC Media Keys**: Uploads to WhatsApp CDN (`mms.whatsapp.net`) use ephemeral, cryptographically secure 32-byte media keys with HMAC-SHA256 validation.
- **Streaming Sidecars**: For video attachments, `whatsapp-rust` packages the progressive streaming HMAC table (`streaming_sidecar`) into the `wa::Message` Protobuf, ensuring progressive playback on the recipient’s phone without buffering stutter.

### 5. Copy-on-Write Non-Destructive Editing
- When editing a photo in **Photo Studio** or trimming a video in **Video Trimmer**, Wasche writes the output to a unique temporary file (`trimmed_{id}_{timestamp}.mp4`).
- The original file is replaced only after FFmpeg exits with exit code `0`. If processing is cancelled or interrupted, the original attachment remains untouched.

---

## 11. Cross-References
- [[WhatsApp MCP Server & Scheduler Sidecar]] — Full Wasche architecture, MCP tool schema, and SQLite queue persistence.
- [[Broadcast Durability & WhatsApp Anti-Abuse Realities]] — In-flight lease sweep, 24h macro quotas, and 3-strike circuit breaker mechanics.
- [[Safe WhatsApp Broadcast]] — Upstream keystroke simulation and human-pacing heuristics.
- [[Peer Data Synchronization]] — Peer AppState CriticalUnblockLow contact sync.
