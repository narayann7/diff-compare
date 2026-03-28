# Improving Share: Replace PeerJS Signaling with Firebase Firestore

## Problem with current approach

DiffCompare currently uses PeerJS for WebRTC signaling, which relies on `0.peerjs.com` — a community-hosted server with no SLA. Thousands of other projects depend on it too. If it goes down, sharing breaks with no recourse.

Since DiffCompare is already hosted on Firebase, we can use **Firestore as the signaling channel** instead — giving us full control, better reliability, and no new infrastructure to manage.

---

## What changes and what stays the same

| | Current | Improved |
|--|---------|---------|
| Signaling | `0.peerjs.com` (PeerJS) | Firestore |
| Data transfer | WebRTC DataChannel (P2P) | WebRTC DataChannel (P2P) — unchanged |
| Dependency | `peerjs` npm package | `firebase/firestore` (already present) |
| Control | None | Full |
| Reliability | Community-hosted | Your Firebase project |

The actual diff payload still travels **browser → browser** over a WebRTC DataChannel. Firestore only handles the handshake, exactly like the PeerJS signaling server did — it just lives in your own project now.

---

## How Firebase signaling works

WebRTC requires two peers to exchange three things before a DataChannel can open:

1. **SDP Offer** — User A describes their connection capabilities
2. **SDP Answer** — User B responds with their own capabilities
3. **ICE Candidates** — Both sides share network paths they can be reached on

Firestore acts as the shared whiteboard where both peers write and read these messages.

```
User A                          Firestore                         User B
──────                          ────────                          ──────
1. new RTCPeerConnection()
2. createOffer()
3. setLocalDescription(offer)
4. Write offer ──────────► rooms/{roomId}/offer
   + listen for ICE
                                                    5. Read offer ◄──────────
                                                    6. setRemoteDescription(offer)
                                                    7. createAnswer()
                                                    8. setLocalDescription(answer)
                           rooms/{roomId}/answer ◄── 9. Write answer
                           rooms/{roomId}/iceCandidatesB ◄── 10. Write ICE candidates
10. Read answer ◄──────────
11. setRemoteDescription(answer)
12. Write ICE ──────────► rooms/{roomId}/iceCandidatesA

        ◄─────────────────── DataChannel open ──────────────────────►
                     (Firestore no longer involved — pure P2P)

13. Send SharePayload over DataChannel
                                                    14. Receive SharePayload
                                                    15. Load diff into app state
16. Delete rooms/{roomId} from Firestore (cleanup)
```

---

## Firestore document structure

```
rooms/
  {roomId}/                      ← roomId = random UUID, becomes the share URL param
    offer: RTCSessionDescription
    answer: RTCSessionDescription | null
    iceCandidatesA: RTCIceCandidate[]   ← from User A (sharer)
    iceCandidatesB: RTCIceCandidate[]   ← from User B (receiver)
    createdAt: Timestamp               ← for TTL / cleanup
```

The `roomId` replaces the PeerJS peer ID in the share URL:
```
https://diff-compare.web.app/?share={roomId}
```

---

## Implementation plan

### 1. Firebase setup

Enable Firestore in the Firebase project. Add a TTL rule or scheduled function to delete rooms older than 1 hour to avoid stale data buildup.

Firestore security rules:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId} {
      // Anyone can create and read a room (needed for signaling)
      allow read, write: if true;
    }
  }
}
```

> Note: Since the diff content never touches Firestore (only handshake metadata does), open read/write rules here are acceptable. Tighten if needed.

### 2. Replace `usePeerShare.ts`

The hook interface stays identical — `startSharing`, `connectToPeer`, `stopSharing`, `shareState`, `shareUrl` — so no changes needed in components like `SharePanel.tsx` or `App.tsx`.

Internally, swap out PeerJS calls for raw WebRTC + Firestore writes/listens:

```ts
// useFirebaseShare.ts (replaces usePeerShare.ts)

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  doc, setDoc, onSnapshot, updateDoc, arrayUnion, deleteDoc, getFirestore
} from 'firebase/firestore'
import { v4 as uuidv4 } from 'uuid'
import type { SharePayload, ShareState } from './usePeerShare'

const db = getFirestore()

export function useFirebaseShare({ onReceive }: { onReceive: (p: SharePayload) => void }) {
  const [shareState, setShareState] = useState<ShareState>('idle')
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<RTCDataChannel | null>(null)
  const roomIdRef = useRef<string | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  const cleanup = useCallback((deleteRoom = false) => {
    channelRef.current?.close()
    pcRef.current?.close()
    unsubRef.current?.()
    if (deleteRoom && roomIdRef.current) {
      deleteDoc(doc(db, 'rooms', roomIdRef.current)).catch(() => {})
    }
    pcRef.current = null
    channelRef.current = null
    unsubRef.current = null
    roomIdRef.current = null
    setShareState('idle')
    setShareUrl(null)
    setErrorMessage(null)
  }, [])

  // ── User A: Sharer ──────────────────────────────────────────────────────────
  const startSharing = useCallback(async (payload: SharePayload) => {
    cleanup()

    const roomId = uuidv4()
    roomIdRef.current = roomId
    const roomRef = doc(db, 'rooms', roomId)

    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    pcRef.current = pc

    // Create DataChannel (sharer side initiates it)
    const channel = pc.createDataChannel('diff')
    channelRef.current = channel
    channel.onopen = () => {
      setShareState('connected')
      channel.send(JSON.stringify(payload))
      setShareState('sent')
      setTimeout(() => cleanup(true), 3000)
    }
    channel.onerror = () => {
      setShareState('error')
      setErrorMessage('DataChannel error')
    }

    // Collect ICE candidates and write them to Firestore
    pc.onicecandidate = async ({ candidate }) => {
      if (candidate) {
        await updateDoc(roomRef, {
          iceCandidatesA: arrayUnion(candidate.toJSON())
        }).catch(() => {})
      }
    }

    // Create offer
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await setDoc(roomRef, {
      offer: { type: offer.type, sdp: offer.sdp },
      answer: null,
      iceCandidatesA: [],
      iceCandidatesB: [],
      createdAt: new Date()
    })

    // Build share URL
    const url = new URL(window.location.href)
    url.searchParams.set('share', roomId)
    setShareUrl(url.toString())
    setShareState('waiting')

    // Listen for answer + ICE candidates from User B
    unsubRef.current = onSnapshot(roomRef, async (snap) => {
      const data = snap.data()
      if (!data) return

      if (data.answer && !pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer))
      }
      for (const candidate of data.iceCandidatesB ?? []) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
      }
    })
  }, [cleanup])

  // ── User B: Receiver ────────────────────────────────────────────────────────
  const connectToPeer = useCallback(async (roomId: string) => {
    cleanup()
    roomIdRef.current = roomId
    const roomRef = doc(db, 'rooms', roomId)
    setShareState('receiving')

    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    pcRef.current = pc

    // Receive DataChannel
    pc.ondatachannel = ({ channel }) => {
      channelRef.current = channel
      channel.onmessage = ({ data }) => {
        try {
          onReceive(JSON.parse(data) as SharePayload)
          setShareState('received')
          const url = new URL(window.location.href)
          url.searchParams.delete('share')
          window.history.replaceState({}, '', url.toString())
          setTimeout(() => cleanup(), 3000)
        } catch {
          setShareState('error')
          setErrorMessage('Failed to parse received diff')
        }
      }
    }

    pc.onicecandidate = async ({ candidate }) => {
      if (candidate) {
        await updateDoc(roomRef, {
          iceCandidatesB: arrayUnion(candidate.toJSON())
        }).catch(() => {})
      }
    }

    // Listen for offer + ICE candidates from User A
    unsubRef.current = onSnapshot(roomRef, async (snap) => {
      const data = snap.data()
      if (!data?.offer) return

      if (!pc.currentRemoteDescription) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await updateDoc(roomRef, { answer: { type: answer.type, sdp: answer.sdp } })
      }

      for (const candidate of data.iceCandidatesA ?? []) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {})
      }
    })
  }, [onReceive, cleanup])

  // Auto-connect if ?share= is in URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const roomId = params.get('share')
    if (roomId) connectToPeer(roomId)
    return () => cleanup()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { shareState, shareUrl, startSharing, stopSharing: cleanup, errorMessage }
}
```

### 3. Update imports

In whichever file imports `usePeerShare`:

```ts
// Before
import { usePeerShare } from './hooks/usePeerShare'

// After
import { useFirebaseShare as usePeerShare } from './hooks/useFirebaseShare'
```

No other changes needed — the hook API is identical.

### 4. Remove PeerJS

```bash
bun remove peerjs
```

---

## Firestore data never contains diff content

Just like the current approach, Firestore only ever holds:
- SDP offer/answer (~2 KB of connection metadata)
- ICE candidates (~a few hundred bytes each)

The actual diff (original text, modified text, settings) travels over the WebRTC DataChannel, peer-to-peer, and never touches Firestore.

---

## Cleanup strategy

Rooms should be deleted after use to avoid Firestore buildup:
- **On success**: sharer deletes the room after `sent` (3s timeout)
- **On tab close**: best-effort via `cleanup(true)` in the `useEffect` teardown
- **Scheduled cleanup**: Firebase scheduled function deletes rooms where `createdAt < now - 1 hour`

```ts
// functions/src/index.ts (Firebase scheduled function)
export const cleanupRooms = onSchedule('every 60 minutes', async () => {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000)
  const old = await db.collection('rooms').where('createdAt', '<', cutoff).get()
  const batch = db.batch()
  old.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
})
```

---

## Summary

| Step | Action |
|------|--------|
| 1 | Enable Firestore, set security rules |
| 2 | Create `useFirebaseShare.ts` with raw WebRTC + Firestore signaling |
| 3 | Update import alias in consuming components |
| 4 | Remove `peerjs` package |
| 5 | (Optional) Add scheduled cleanup function |
