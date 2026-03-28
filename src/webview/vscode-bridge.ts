/**
 * VSCode Webview bridge — works in both VSCode webview and plain browser.
 *
 * In a VSCode webview the extension host injects `acquireVsCodeApi` on
 * `window`. This module wraps it into a singleton so callers never need to
 * worry about the runtime environment.
 */

type VsCodeApi = {
  postMessage: (msg: unknown) => void
  getState: () => unknown
  setState: (state: unknown) => void
}

let _api: VsCodeApi | null = null

function getApi(): VsCodeApi | null {
  if (_api) return _api
  if (typeof window !== 'undefined' && typeof (window as unknown as Record<string, unknown>).acquireVsCodeApi === 'function') {
    _api = (window as unknown as { acquireVsCodeApi: () => VsCodeApi }).acquireVsCodeApi()
  }
  return _api
}

/** True when running inside a VSCode WebviewPanel. */
export function isVsCode(): boolean {
  return getApi() !== null
}

// ---------------------------------------------------------------------------
// Message types
// ---------------------------------------------------------------------------

export type HostToWebviewMessage =
  | {
      type: 'init'
      theme: 'dark' | 'light'
      fileContent?: { side: 'left' | 'right'; name?: string; content: string }
    }
  | { type: 'themeChange'; theme: 'dark' | 'light' }
  | { type: 'fileContent'; side: 'left' | 'right'; name: string; content: string }

export type WebviewToHostMessage =
  | { type: 'openFile'; side: 'left' | 'right' }
  | { type: 'copyToClipboard'; text: string }
  | { type: 'saveState'; state: unknown }

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

/** Send a message from the webview to the extension host. No-op in browser. */
export function postMessageToHost(msg: WebviewToHostMessage): void {
  getApi()?.postMessage(msg)
}

/**
 * Register a handler for messages sent from the extension host.
 * Returns a cleanup function — call it in a `useEffect` return.
 * Works in browser (no-op listener registered but never fired).
 */
export function onHostMessage(
  handler: (msg: HostToWebviewMessage) => void
): () => void {
  const listener = (e: MessageEvent) => {
    if (e.data && typeof e.data.type === 'string') {
      handler(e.data as HostToWebviewMessage)
    }
  }
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}
