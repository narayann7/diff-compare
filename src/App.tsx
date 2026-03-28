import { useState, useMemo, useCallback } from 'react'
import { useTheme } from './hooks/useTheme'
import { computeLineDiff, computeSideBySide } from './lib/diff-utils'
import { Toolbar, type ViewMode } from './components/Toolbar'
import { DiffStatsBar } from './components/DiffStats'
import { EditorPanel } from './components/EditorPanel'
import { UnifiedDiffViewer, SideBySideDiffViewer } from './components/DiffViewer'
import { AnimationModal } from './components/AnimationModal'
import { cn } from './lib/utils'

const EXAMPLE_ORIGINAL = `function greet(name: string): string {
  return "Hello, " + name + "!"
}

const users = ["Alice", "Bob", "Charlie"]

users.forEach(user => {
  console.log(greet(user))
})`

const EXAMPLE_MODIFIED = `function greet(name: string, greeting = "Hello"): string {
  return \`\${greeting}, \${name}!\`
}

const users = ["Alice", "Bob", "Charlie", "Dave"]

for (const user of users) {
  console.log(greet(user))
}

// Done
`

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  const [original, setOriginal] = useState(EXAMPLE_ORIGINAL)
  const [modified, setModified] = useState(EXAMPLE_MODIFIED)
  const [originalFileName, setOriginalFileName] = useState<string>()
  const [modifiedFileName, setModifiedFileName] = useState<string>()

  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false)
  const [wrapLines, setWrapLines] = useState(true)
  const [showAnimation, setShowAnimation] = useState(false)

  const { lines, stats } = useMemo(
    () => computeLineDiff(original, modified, ignoreWhitespace),
    [original, modified, ignoreWhitespace]
  )

  const { left: leftLines, right: rightLines } = useMemo(
    () => computeSideBySide(lines),
    [lines]
  )

  const hasContent = original.trim() !== '' || modified.trim() !== ''

  const handleReset = () => {
    setOriginal('')
    setModified('')
    setOriginalFileName(undefined)
    setModifiedFileName(undefined)
  }

  const getDiffText = useCallback(() => {
    return lines
      .map((l) => {
        if (l.type === 'added') return '+ ' + l.content
        if (l.type === 'removed') return '- ' + l.content
        return '  ' + l.content
      })
      .join('\n')
  }, [lines])

  return (
    <div
      className={cn(
        'flex flex-col h-screen overflow-hidden transition-colors duration-300',
        isDark ? 'bg-surface text-white' : 'bg-surfaceLight text-gray-900'
      )}
    >
      <Toolbar
        theme={theme}
        onToggleTheme={toggleTheme}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        ignoreWhitespace={ignoreWhitespace}
        onIgnoreWhitespaceChange={setIgnoreWhitespace}
        wrapLines={wrapLines}
        onWrapLinesChange={setWrapLines}
        onReset={handleReset}
        getDiffText={getDiffText}
        hasContent={hasContent}
        onAnimate={() => setShowAnimation(true)}
      />

      {hasContent && <DiffStatsBar stats={stats} theme={theme} />}

      {/* Input Panels */}
      <div
        className={cn(
          'grid grid-cols-2 gap-3 px-4 pt-4 shrink-0 transition-all',
          viewMode === 'unified' ? 'pb-1 grid-cols-2' : 'pb-3 grid-cols-2',
        )}
        style={{ height: viewMode === 'unified' ? '38%' : '46%' }}
      >
        <EditorPanel
          label="Original"
          value={original}
          onChange={setOriginal}
          fileName={originalFileName}
          onFileLoad={(name, content) => {
            setOriginalFileName(name)
            setOriginal(content)
          }}
          onClear={() => {
            setOriginal('')
            setOriginalFileName(undefined)
          }}
          side="left"
          theme={theme}
        />
        <EditorPanel
          label="Modified"
          value={modified}
          onChange={setModified}
          fileName={modifiedFileName}
          onFileLoad={(name, content) => {
            setModifiedFileName(name)
            setModified(content)
          }}
          onClear={() => {
            setModified('')
            setModifiedFileName(undefined)
          }}
          side="right"
          theme={theme}
        />
      </div>

      {/* Divider */}
      <div
        className={cn('mx-4 shrink-0 border-b', isDark ? 'border-surface-border' : 'border-surfaceLight-border')}
      />

      {/* Diff Output */}
      <div className={cn('flex-1 overflow-hidden px-4 py-3 flex flex-col gap-1')}>
        <div
          className={cn(
            'text-xs font-semibold uppercase tracking-widest mb-1.5 px-0.5',
            isDark ? 'text-surface-muted' : 'text-gray-400'
          )}
        >
          {viewMode === 'unified' ? 'Unified Diff' : 'Split Diff'}
        </div>

        <div
          className={cn(
            'flex-1 overflow-hidden rounded-lg border',
            isDark ? 'bg-surface-raised border-surface-border' : 'bg-white border-surfaceLight-border'
          )}
        >
          {viewMode === 'unified' ? (
            <UnifiedDiffViewer lines={lines} wrapLines={wrapLines} />
          ) : (
            <SideBySideDiffViewer
              leftLines={leftLines}
              rightLines={rightLines}
              wrapLines={wrapLines}
            />
          )}
        </div>
      </div>

      {/* Remotion Animation Modal */}
      {showAnimation && (
        <AnimationModal
          lines={lines}
          stats={stats}
          theme={theme}
          onClose={() => setShowAnimation(false)}
        />
      )}
    </div>
  )
}
