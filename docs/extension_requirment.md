# VSCode Extension Requirements

Requirements for porting the DiffCompare web app into a VSCode extension.

---

## 1. Extension Infrastructure (New Files)

| File | Purpose |
|------|---------|
| `src/extension.ts` | Extension host entry point — registers commands, creates WebviewPanel |
| `src/webview/` | Separate folder for the React UI (webview side) |
| `.vscodeignore` | Exclude dev/source files from the packaged extension |

---

## 2. `package.json` Overhaul

The current `package.json` is a Vite web app config. For a VSCode extension it needs:

- `"engines": { "vscode": "^1.80.0" }`
- `"main": "./dist/extension.js"` — extension host entry point
- `"activationEvents"` — e.g. `onCommand:diffCompare.open`
- `"contributes.commands"` — register `DiffCompare: Open` command
- `"contributes.keybindings"` — optional keyboard shortcut to open the panel
- `"contributes.menus"` — optional right-click on files to compare
- `@vscode/vsce` added as a devDependency for packaging

---

## 3. Dual Build System

Currently Vite only builds the web app. Two separate build targets are needed:

| Target | Runtime | Format | Tool |
|--------|---------|--------|------|
| Extension host (`extension.ts`) | Node.js | CommonJS | esbuild or webpack |
| Webview UI (React app) | Browser | ESM / IIFE | Vite (existing) |

Add a separate esbuild script or webpack config for the extension host alongside the existing Vite config.

---

## 4. Webview Setup in Extension Host

```
ExtensionHost → creates WebviewPanel → serves built React HTML/JS/CSS
```

- Use `webview.asWebviewUri()` to convert local asset paths to webview-safe URIs
- Set a strict **Content Security Policy (CSP)** `<meta>` tag in the HTML template
- Wire up `webview.onDidReceiveMessage` and `panel.webview.postMessage` for bidirectional communication between the React UI and extension host

---

## 5. Feature Adaptations

### `localStorage` — [`src/hooks/useLocalStorage.ts`](../src/hooks/useLocalStorage.ts)
- `localStorage` works in webviews
- Consider syncing with `context.globalState` via postMessage for proper VSCode-level persistence across windows

### File Upload — [`src/components/EditorPanel.tsx`](../src/components/EditorPanel.tsx)
- Drag-and-drop `FileReader` works in webviews for arbitrary files
- To open workspace files, route through the extension host using `vscode.workspace.openTextDocument` via postMessage

### Clipboard — [`src/components/EditorPanel.tsx`](../src/components/EditorPanel.tsx), [`src/components/Toolbar.tsx`](../src/components/Toolbar.tsx)
- `navigator.clipboard` works in webviews with `allowScripts: true` and proper CSP
- Fallback: route clipboard writes through `vscode.env.clipboard` via postMessage

### Example files via `import.meta.glob` — [`src/App.tsx`](../src/App.tsx)
- `import.meta.glob('../dump/examples/*.txt')` won't resolve at runtime inside a webview
- Must be bundled at Vite build time (current behaviour is fine) or removed entirely

### Theme Sync — [`src/hooks/useTheme.ts`](../src/hooks/useTheme.ts)
- On panel open, read `vscode.window.activeColorTheme` in the extension host and send it to the webview via postMessage
- Listen for `vscode.window.onDidChangeActiveColorTheme` and forward changes so the UI stays in sync with the editor theme

---

## 6. VSCode-Specific Features to Add

- **Command** `DiffCompare: Open` — opens the panel (required)
- **Auto-populate from editor** — read the active editor's content and pre-fill one panel via extension host
- **Git diff integration** — use VSCode's built-in git extension API to auto-populate both panels with the git diff of the current file
- **Context menu** — right-click two files in the Explorer → "Compare with DiffCompare"
- **Status bar item** — optional shortcut to open the panel from the status bar

---

## 7. Webview HTML Template

The extension host must generate the HTML that bootstraps the React app with:

- Asset `src` / `href` attributes replaced with `asWebviewUri()` URIs
- A CSP `<meta>` tag: `default-src 'none'; script-src vscode-resource:; style-src vscode-resource: 'unsafe-inline';`
- An injected `const vscode = acquireVsCodeApi();` script so the React app can call `vscode.postMessage()`

---

## 8. postMessage Communication Bridge

Define a typed message protocol between the extension host and the webview:

| Direction | Message type | Payload |
|-----------|-------------|---------|
| Host → Webview | `init` | active theme, initial file content |
| Host → Webview | `themeChange` | new VSCode theme kind |
| Host → Webview | `fileContent` | `{ side: 'left' \| 'right', name, content }` |
| Webview → Host | `openFile` | open file picker via `vscode.window.showOpenDialog` |
| Webview → Host | `copyToClipboard` | text to write via `vscode.env.clipboard` |
| Webview → Host | `saveState` | settings/state to persist in `globalState` |

---

## 9. Packaging & Publishing

- Extension icon: `icon.png` (128×128 px)
- Run `vsce package` to produce a `.vsix` installable locally
- Run `vsce publish` to publish to the VS Marketplace
- Fill in marketplace metadata: description, categories, keywords, screenshots

---

## Priority Order

1. Extension host (`extension.ts`) + WebviewPanel setup
2. Dual build system (esbuild for host + Vite for webview)
3. Fix / remove `import.meta.glob` example files
4. postMessage bridge (state, clipboard, file access)
5. VSCode theme sync
6. Commands, keybindings, context menus
7. Git diff auto-populate
8. Packaging and marketplace prep
