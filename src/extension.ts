import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateNonce(): string {
  let text = ''
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

function resolveTheme(kind: vscode.ColorThemeKind): 'dark' | 'light' {
  return kind === vscode.ColorThemeKind.Light ? 'light' : 'dark'
}

function getWebviewContent(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  const webviewDist = vscode.Uri.joinPath(extensionUri, 'dist', 'webview')
  const indexPath = vscode.Uri.joinPath(webviewDist, 'index.html')

  let html = fs.readFileSync(indexPath.fsPath, 'utf8')

  // Replace relative asset paths (./assets/...) with webview-safe URIs
  html = html.replace(/(src|href)="(\.[^"]+)"/g, (_, attr: string, rel: string) => {
    // Skip data URIs and anchors
    if (rel.startsWith('data:') || rel === './') return `${attr}="${rel}"`
    const assetUri = webview.asWebviewUri(
      vscode.Uri.joinPath(webviewDist, rel.replace(/^\.\//, ''))
    )
    return `${attr}="${assetUri}"`
  })

  const nonce = generateNonce()
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} data: blob:`,
    `style-src ${webview.cspSource} 'unsafe-inline' https://fonts.googleapis.com`,
    // nonce covers the injected acquireVsCodeApi script; the bundled JS is
    // served from webview.cspSource so it only needs the source allowlist.
    `script-src 'nonce-${nonce}' ${webview.cspSource}`,
    `font-src ${webview.cspSource} https://fonts.gstatic.com`,
    `connect-src https://fonts.googleapis.com https://fonts.gstatic.com`,
  ].join('; ')

  // Inject CSP meta + acquireVsCodeApi shim right after <head>
  const injection = `
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <script nonce="${nonce}">
    // Make the VSCode API available to the React app via window.acquireVsCodeApi
    (function() {
      try { window.__vscodeApiInitialized = true; } catch(e) {}
    })();
  </script>`

  html = html.replace('<head>', `<head>${injection}`)

  // Add nonce to every <script> tag that doesn't already have one so that the
  // bundled React chunks are allowed by the CSP.
  html = html.replace(/<script(?![^>]*\bnonce=)/g, `<script nonce="${nonce}"`)

  return html
}

// ---------------------------------------------------------------------------
// Activate / Deactivate
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  let panel: vscode.WebviewPanel | undefined

  // ------------------------------------------------------------------
  // Open / reveal the panel
  // ------------------------------------------------------------------
  const openPanel = (prefillSide?: 'left' | 'right', prefillUri?: vscode.Uri) => {
    if (panel) {
      panel.reveal()
      if (prefillUri) sendFileContent(panel.webview, prefillUri, prefillSide ?? 'left')
      return
    }

    panel = vscode.window.createWebviewPanel(
      'diffCompare',
      'DiffCompare',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(context.extensionUri, 'dist', 'webview'),
        ],
        retainContextWhenHidden: true,
      }
    )

    panel.webview.html = getWebviewContent(panel.webview, context.extensionUri)

    // Theme change forwarding
    const themeDisposable = vscode.window.onDidChangeActiveColorTheme((t) => {
      panel?.webview.postMessage({
        type: 'themeChange',
        theme: resolveTheme(t.kind),
      })
    })

    // Receive messages from webview
    panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.type as string) {
        case 'openFile': {
          const uris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            canSelectFiles: true,
          })
          if (uris?.[0]) {
            sendFileContent(panel!.webview, uris[0], msg.side as 'left' | 'right')
          }
          break
        }
        case 'copyToClipboard': {
          await vscode.env.clipboard.writeText(msg.text as string)
          break
        }
        case 'saveState': {
          await context.globalState.update('diffCompareState', msg.state)
          break
        }
      }
    })

    panel.onDidChangeViewState(({ webviewPanel }) => {
      if (webviewPanel.visible) sendInit(panel!.webview, prefillUri, prefillSide)
    })
    panel.onDidDispose(() => {
      themeDisposable.dispose()
      panel = undefined
    })

    sendInit(panel.webview, prefillUri, prefillSide)
  }

  // ------------------------------------------------------------------
  // Commands
  // ------------------------------------------------------------------
  context.subscriptions.push(
    vscode.commands.registerCommand('diffCompare.open', () => openPanel()),

    // Pre-fill left panel from the active editor
    vscode.commands.registerCommand('diffCompare.openWithActive', () => {
      const editor = vscode.window.activeTextEditor
      if (!editor) {
        openPanel()
        return
      }
      const content = editor.document.getText()
      const name = path.basename(editor.document.fileName)
      openPanel('left')
      // panel was just created — wait a tick so webview is ready
      setTimeout(() => {
        panel?.webview.postMessage({ type: 'fileContent', side: 'left', name, content })
      }, 500)
    }),

    // Right-click two files in Explorer: "Compare with DiffCompare"
    vscode.commands.registerCommand(
      'diffCompare.compareFiles',
      (uri: vscode.Uri, allUris: vscode.Uri[]) => {
        const uris = allUris?.length === 2 ? allUris : [uri]
        openPanel()
        setTimeout(() => {
          if (uris[0]) sendFileContent(panel!.webview, uris[0], 'left')
          if (uris[1]) sendFileContent(panel!.webview, uris[1], 'right')
        }, 500)
      }
    )
  )

  // ------------------------------------------------------------------
  // Status bar
  // ------------------------------------------------------------------
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  statusBar.text = '$(diff) DiffCompare'
  statusBar.command = 'diffCompare.open'
  statusBar.tooltip = 'Open DiffCompare'
  statusBar.show()
  context.subscriptions.push(statusBar)
}

export function deactivate(): void {}

// ---------------------------------------------------------------------------
// Helpers — file sending
// ---------------------------------------------------------------------------

function sendInit(
  webview: vscode.Webview,
  prefillUri?: vscode.Uri,
  prefillSide?: 'left' | 'right'
): void {
  const theme = resolveTheme(vscode.window.activeColorTheme.kind)

  if (prefillUri) {
    try {
      const content = fs.readFileSync(prefillUri.fsPath, 'utf8')
      const name = path.basename(prefillUri.fsPath)
      webview.postMessage({
        type: 'init',
        theme,
        fileContent: { side: prefillSide ?? 'left', name, content },
      })
      return
    } catch {
      // fall through to plain init
    }
  }

  webview.postMessage({ type: 'init', theme })
}

function sendFileContent(
  webview: vscode.Webview,
  uri: vscode.Uri,
  side: 'left' | 'right'
): void {
  try {
    const content = fs.readFileSync(uri.fsPath, 'utf8')
    const name = path.basename(uri.fsPath)
    webview.postMessage({ type: 'fileContent', side, name, content })
  } catch (err) {
    vscode.window.showErrorMessage(`DiffCompare: could not read file — ${String(err)}`)
  }
}
