# How WebRTC Sharing Works in DiffCompare

## Overview

DiffCompare uses WebRTC (via PeerJS) to share diffs directly between two browsers — no backend, no file uploads, no size limits. The diff data travels peer-to-peer once the initial connection is established.

---

## The Two Roles

| Role | What they do |
|------|-------------|
| **Sharer (User A)** | Clicks "Share", gets a link, waits for receiver to open it |
| **Receiver (User B)** | Opens the share link, automatically receives the diff |

---

## Step-by-Step Flow

```
User A (Sharer)                          PeerJS Signaling Server              User B (Receiver)
───────────────                          ──────────────────────               ─────────────────
1. Clicks "Share"
2. new Peer() created
3. Peer registers with signaling ──────► Assigned peerId (UUID)
4. URL generated:
   ?share=<peerId>
5. User A copies & sends link ──────────────────────────────────────────────► 6. User B opens link
                                                                               7. App reads ?share=<peerId>
                                                                               8. new Peer() created
                                                                               9. Registers with signaling ──► Gets own peerId
                                                                              10. peer.connect(<peerIdA>) ───► Signals User A
11. peer.on('connection') fires
12. conn.on('open') fires
13. conn.send(payload) ──────────────────────────── P2P DataChannel ────────► 14. conn.on('data') fires
                                                   (no server involved)       15. Diff loaded into app state
                                                                              16. URL cleaned (?share= removed)
```

---

## What Happens in the Code

### User A side — `startSharing()`

```ts
// usePeerShare.ts
const peer = new Peer()           // Creates a peer, connects to signaling server
peer.on('open', (id) => {
  // id is a UUID like "a3f9c2d1-..."
  // Build share URL: https://diff-compare.web.app/?share=a3f9c2d1-...
  setShareUrl(...)
  setShareState('waiting')
})

peer.on('connection', (conn) => { // Fires when User B connects
  setShareState('connected')
  conn.on('open', () => {
    conn.send(payload)             // Send entire diff payload over DataChannel
    setShareState('sent')
  })
})
```

### User B side — `connectToPeer(peerId)`

Called automatically on mount when `?share=<peerId>` is in the URL:

```ts
// usePeerShare.ts (useEffect on mount)
const params = new URLSearchParams(window.location.search)
const peerId = params.get('share')
if (peerId) connectToPeer(peerId)

// connectToPeer:
const peer = new Peer()
peer.on('open', () => {
  const conn = peer.connect(peerId)  // Initiate connection to User A's peer
  conn.on('data', (data) => {
    onReceive(data as SharePayload)  // Load diff into app state
    history.replaceState(...)        // Clean ?share= from URL
  })
})
```

---

## The Payload

Everything needed to reproduce the diff view is sent in one object:

```ts
interface SharePayload {
  version: 1
  original: string           // Left editor content
  modified: string           // Right editor content
  originalFileName?: string  // e.g. "main.ts"
  modifiedFileName?: string  // e.g. "main.ts"
  diffSettings: {
    ignoreWhitespace: boolean
    ignoreCase: boolean
    ignoreEmptyLines: boolean
    ignoreLineEndings: boolean
    showMinimap: boolean
  }
}
```

PeerJS automatically chunks large payloads over the DataChannel, so there is no practical size limit.

---

## The Role of PeerJS / Signaling

WebRTC peers cannot find each other directly — they need a **signaling server** to exchange connection metadata (ICE candidates, SDP offers/answers). PeerJS handles this transparently using its free hosted server at `0.peerjs.com`.

```
Signaling server role:
  - Assigns each peer a UUID
  - Relays the initial handshake messages between peers
  - NOT involved after the DataChannel is open

After handshake:
  - All data flows directly browser → browser (P2P)
  - The signaling server sees nothing
```

This means:
- The diff content itself never touches any server
- Sharing works as long as both browsers can reach `0.peerjs.com` for the handshake

---

## State Machine

```
idle
 │
 ├─ startSharing() called
 │
waiting         ← Peer registered, URL generated, waiting for receiver
 │
 ├─ peer.on('connection') fires
 │
connected       ← DataChannel negotiated
 │
 ├─ conn.on('open') fires, payload sent
 │
sent            ← Diff transmitted
 │
 └─ auto-reset to idle after 3s


(Receiver side)
idle
 │
 ├─ ?share= detected on load → connectToPeer()
 │
receiving       ← Connecting to sharer's peer
 │
 ├─ conn.on('data') fires
 │
received        ← Diff loaded into app state, URL cleaned
 │
 └─ auto-reset to idle after 3s
```

---

## Key Constraints

| Constraint | Why |
|-----------|-----|
| Sharer must keep tab open | The DataChannel exists on their `Peer` object. If they close the tab before User B connects, `peer-unavailable` error fires on User B. |
| One receiver per share session | Once `peer.on('connection')` fires, the peer sends data and destroys itself. To share again, a new peer (and new URL) is created. |
| Requires internet for handshake | `0.peerjs.com` must be reachable to exchange ICE candidates. The P2P data transfer itself does not require it. |
| Same-browser tab test works | Two tabs on the same machine can connect via localhost WebRTC — useful for local testing. |
