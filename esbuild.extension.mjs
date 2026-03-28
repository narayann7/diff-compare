/**
 * Builds the VSCode extension host (src/extension.ts) with esbuild.
 *
 * The webview UI is built separately by Vite (`vite build`).
 * Run both with:  bun run build:ext && bun run build:webview
 * Or together:    bun run build
 */
import * as esbuild from 'esbuild'

const isProd = process.env.NODE_ENV === 'production'

await esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node16',
  // vscode is provided by the extension host at runtime — never bundle it
  external: ['vscode'],
  outfile: 'dist/extension.cjs',
  sourcemap: !isProd,
  minify: isProd,
})

console.log('Extension host built → dist/extension.cjs')
