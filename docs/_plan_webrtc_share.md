# Plan: WebRTC P2P Diff Sharing

## Goal
Allow users to share any diff (regardless of size) via a link — no backend required.
Uses PeerJS (free cloud signaling) to establish a WebRTC data channel between two browsers.

---

## How It Works

```
User A (Sharer)                          User B (Receiver)
─────────────────                        ─────────────────
1. Clicks "Share"
2. PeerJS creates peer → gets peerId
3. URL generated:
   ?share=<peerId>
4. User A copies & sends link ──────────► 5. User B opens link
                                          6. App reads ?share=<peerId>
                                          7. PeerJS connects to peerId
8. A detects connection
9. A sends diff payload ────────────────► 10. B receives payload
   { original, modified,                  11. B loads diff into state
     originalFileName,
     modifiedFileName,
     diffSettings }
```

**Key constraint**: User A must keep the tab open while User B opens the link.
Once data is transferred, User B can close the connection — diff stays loaded.

---

## Tech Choice

**PeerJS** (`peerjs` npm package)
- Wraps WebRTC DataChannel API
- Uses PeerJS free cloud signaling server (`0.peerjs.com`) for initial handshake
- After handshake, data flows P2P — no server involved
- Handles chunking automatically for large payloads

---

## Files to Create / Modify

### New Files
| File | Purpose |
|------|---------|
| `src/hooks/usePeerShare.ts` | PeerJS lifecycle: create peer, generate link, send/receive data |
| `src/components/SharePanel.tsx` | UI: share button, status indicators, copy link, waiting state |

### Modified Files
| File | Change |
|------|--------|
| `src/App.tsx` | Add `usePeerShare` hook, pass share props to Toolbar, handle incoming data |
| `src/components/Toolbar.tsx` | Add `SharePanel` to right action buttons, pass `onShare`/share state props |
| `package.json` | Add `peerjs` dependency |

---

## Data Payload Shape

```ts
interface SharePayload {
  version: 1
  original: string
  modified: string
  originalFileName?: string
  modifiedFileName?: string
  diffSettings: DiffSettingsState
}
```

---

## `usePeerShare` Hook API

```ts
const {
  shareState,     // 'idle' | 'waiting' | 'connected' | 'sent' | 'receiving' | 'received' | 'error'
  shareUrl,       // e.g. "https://diff-compare.web.app/?share=abc123xyz"
  startSharing,   // (payload: SharePayload) => void — creates peer, generates URL
  stopSharing,    // () => void — destroys peer connection
  errorMessage,   // string | null
} = usePeerShare({
  onReceive: (payload: SharePayload) => void  // called on User B side
})
```

---

## URL Strategy

- On app load, check `window.location.search` for `?share=<peerId>`
- If found → auto-trigger receiver mode (connect to that peer)
- After data received → clean URL with `history.replaceState` (remove `?share=...`)

---

## SharePanel UI States

```
[idle]        → "Share" button in toolbar
[waiting]     → Modal/popover: spinner + copyable link + "Waiting for someone to open the link..."
[connected]   → "Connected! Sending..." (brief)
[sent]        → "Diff sent successfully!" + auto-close
[receiving]   → (User B) "Receiving diff..." banner
[received]    → (User B) "Diff loaded from peer!" toast → dismiss
[error]       → "Connection failed. Try again." + retry button
```

---

## Edge Cases & Handling

| Scenario | Handling |
|----------|---------|
| User A closes tab before B opens link | Show "Host disconnected" error on B |
| Very large diffs (>10MB) | PeerJS chunks automatically; show progress indicator |
| Peer ID collision | PeerJS generates UUID-based IDs — collision probability negligible |
| User opens own share link | Peer can't connect to itself; show friendly error |
| Signaling server down | Show fallback message: "Sharing unavailable, try URL encoding for small diffs" |

---

## Implementation Steps

1. `bun add peerjs` — install dependency
2. Create `src/hooks/usePeerShare.ts` — peer lifecycle logic
3. Create `src/components/SharePanel.tsx` — UI component
4. Modify `src/App.tsx` — wire hook, handle `?share=` on load, pass data
5. Modify `src/components/Toolbar.tsx` — add share button + panel
6. Test: open two browser tabs, share from one to other

---

## Out of Scope (for now)
- Persistent share links (requires backend storage)
- Real-time collaborative editing (both users editing simultaneously)
- Password-protected shares
- Expiring links
