import { useState, useEffect } from 'react'
import { isVsCode, onHostMessage } from '../webview/vscode-bridge'

export type Theme = 'dark' | 'dracula' | 'ocean' | 'light' | 'skillz'

const ALL_THEMES: Theme[] = ['dark', 'dracula', 'ocean', 'light', 'skillz']

const getSystemTheme = (): Theme => {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [selectedTheme, setSelected] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'dark'
    const stored = localStorage.getItem('diff-theme')
    if (stored === 'system') return getSystemTheme()
    if (stored && ALL_THEMES.includes(stored as Theme)) return stored as Theme
    return getSystemTheme()
  })

  // Sync theme classes to the document root and persist locally
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('dark', 'dracula', 'ocean', 'light', 'skillz')
    root.classList.add(selectedTheme)
    localStorage.setItem('diff-theme', selectedTheme)
  }, [selectedTheme])

  // When running inside a VSCode WebviewPanel, listen for theme change messages
  // from the extension host so the UI stays in sync with the editor theme.
  useEffect(() => {
    if (!isVsCode()) return
    return onHostMessage((msg) => {
      if (msg.type === 'init' || msg.type === 'themeChange') {
        // Map the VSCode light/dark signal to our closest built-in theme,
        // but only override if the user hasn't already picked a custom one.
        const stored = localStorage.getItem('diff-theme')
        const hasCustom = stored && stored !== 'dark' && stored !== 'light' && stored !== 'system'
        if (!hasCustom) {
          setSelected(msg.theme === 'light' ? 'light' : 'dark')
        }
      }
    })
  }, [])

  const setTheme = (t: Theme) => setSelected(t)

  return { theme: selectedTheme, selectedTheme, setTheme, isDark: selectedTheme !== 'light' }
}
