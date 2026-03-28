import { useRef, useState, useCallback, forwardRef } from 'react'
import { type DiffLine, type DiffWord } from '../lib/diff-utils'
import { cn } from '../lib/utils'

interface WordSpanProps {
  words: DiffWord[]
}

function WordSpans({ words }: WordSpanProps) {
  return (
    <>
      {words.map((word, i) => (
        <span
          key={i}
          className={cn(
            word.type === 'added' && 'word-added',
            word.type === 'removed' && 'word-removed',
          )}
        >
          {word.text}
        </span>
      ))}
    </>
  )
}

interface DiffLineRowProps {
  line: DiffLine
  showLeft?: boolean
  showRight?: boolean
}

export function DiffLineRow({ line, showLeft = true, showRight = true }: DiffLineRowProps) {
  const lineClass = cn(
    'diff-line',
    line.type === 'added' && 'line-added',
    line.type === 'removed' && 'line-removed',
    line.type === 'equal' && 'line-equal',
    line.content === '' && line.type === 'equal' && 'opacity-30',
  )

  const lineNum = showLeft
    ? line.lineNumberLeft
    : showRight
    ? line.lineNumberRight
    : null

  return (
    <div className={lineClass}>
      <span className="diff-line-number">{lineNum ?? ''}</span>
      <span className="diff-line-content">
        {line.words ? <WordSpans words={line.words} /> : line.content}
      </span>
    </div>
  )
}

interface UnifiedDiffViewerProps {
  lines: DiffLine[]
  wrapLines: boolean
  showMinimap?: boolean
}

export function UnifiedDiffViewer({ lines, wrapLines, showMinimap }: UnifiedDiffViewerProps) {
  const minimapRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement
    if (minimapRef.current) {
      const maxScrollTarget = target.scrollHeight - target.clientHeight
      if (maxScrollTarget > 0) {
        const scrollPercent = target.scrollTop / maxScrollTarget
        const maxScrollMinimap = minimapRef.current.scrollHeight - minimapRef.current.clientHeight
        minimapRef.current.scrollTop = scrollPercent * maxScrollMinimap
      }
    }
  }

  const handleMinimapScrollRequest = useCallback((percent: number) => {
    if (contentRef.current) {
      const maxScrollTarget = contentRef.current.scrollHeight - contentRef.current.clientHeight
      contentRef.current.scrollTop = percent * maxScrollTarget
    }
  }, [])

  return (
    <div className="flex flex-1 overflow-hidden relative">
      <div 
        ref={contentRef}
        onScroll={handleScroll}
        className={cn('font-mono text-sm overflow-auto flex-1 animate-fade-in', !wrapLines && 'overflow-x-auto')}
      >
        {lines.length === 0 ? (
          <EmptyState />
        ) : (
          lines.map((line, i) => (
            <DiffLineRow
              key={i}
              line={line}
              showLeft={line.type !== 'added'}
              showRight={line.type !== 'removed'}
            />
          ))
        )}
      </div>
      {showMinimap && <Minimap ref={minimapRef} lines={lines} onScrollRequest={handleMinimapScrollRequest} />}
    </div>
  )
}

interface SideBySideDiffViewerProps {
  leftLines: DiffLine[]
  rightLines: DiffLine[]
  wrapLines: boolean
  showMinimap?: boolean
}

export function SideBySideDiffViewer({ leftLines, rightLines, wrapLines, showMinimap }: SideBySideDiffViewerProps) {
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLDivElement>(null)

  const [leftWidth, setLeftWidth] = useState(50)
  const [isResizing, setIsResizing] = useState(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)

    const handleMouseMove = (mouseMoveEvent: MouseEvent) => {
      if (!containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const newWidthPercent = ((mouseMoveEvent.clientX - containerRect.left) / containerRect.width) * 100
      const clampedWidth = Math.max(10, Math.min(90, newWidthPercent))
      setLeftWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement
    if (target === leftRef.current && rightRef.current) {
      if (rightRef.current.scrollTop !== target.scrollTop) {
        rightRef.current.scrollTop = target.scrollTop
      }
      if (rightRef.current.scrollLeft !== target.scrollLeft) {
        rightRef.current.scrollLeft = target.scrollLeft
      }
    } else if (target === rightRef.current && leftRef.current) {
      if (leftRef.current.scrollTop !== target.scrollTop) {
        leftRef.current.scrollTop = target.scrollTop
      }
      if (leftRef.current.scrollLeft !== target.scrollLeft) {
        leftRef.current.scrollLeft = target.scrollLeft
      }
    }

    if (minimapRef.current) {
      const maxScrollTarget = target.scrollHeight - target.clientHeight
      if (maxScrollTarget > 0) {
        const scrollPercent = target.scrollTop / maxScrollTarget
        const maxScrollMinimap = minimapRef.current.scrollHeight - minimapRef.current.clientHeight
        minimapRef.current.scrollTop = scrollPercent * maxScrollMinimap
      }
    }
  }

  const handleMinimapScrollRequest = useCallback((percent: number) => {
    if (leftRef.current && rightRef.current) {
      const maxScrollTarget = leftRef.current.scrollHeight - leftRef.current.clientHeight
      const newScrollTop = percent * maxScrollTarget
      leftRef.current.scrollTop = newScrollTop
      rightRef.current.scrollTop = newScrollTop
    }
  }, [])

  return (
    <div 
      ref={containerRef}
      className={cn('flex flex-1 overflow-hidden gap-0 animate-fade-in relative')}
    >
      {/* Left Panel */}
      <div 
        ref={leftRef}
        onScroll={handleScroll}
        className={cn('overflow-auto', !wrapLines && 'overflow-x-auto')}
        style={{ flex: `0 0 ${leftWidth}%` }}
      >
        {leftLines.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <EmptyState />
          </div>
        ) : (
          leftLines.map((line, i) => (
            <DiffLineRow key={i} line={line} showLeft={true} showRight={false} />
          ))
        )}
      </div>

      {/* Resizer */}
      <div
        onMouseDown={handleMouseDown}
        className="w-[1px] shrink-0 cursor-col-resize relative z-10"
      >
        <div className={cn(
          "absolute -left-1.5 top-0 bottom-0 w-3 transition-colors flex justify-center group",
          isResizing ? "bg-blue-500/10" : "hover:bg-blue-500/10"
        )}>
          <div className={cn(
            "w-[1px] h-full transition-colors",
            isResizing ? "bg-blue-500" : "bg-surface-border/50 group-hover:bg-blue-400 dark:bg-surface-border/50 light:bg-surfaceLight-border/50"
          )} />
        </div>
      </div>

      {/* Right Panel */}
      <div 
        ref={rightRef}
        onScroll={handleScroll}
        className={cn('flex-1 overflow-auto', !wrapLines && 'overflow-x-auto')}
      >
        {rightLines.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <EmptyState />
          </div>
        ) : (
          rightLines.map((line, i) => (
            <DiffLineRow key={i} line={line} showLeft={false} showRight={true} />
          ))
        )}
      </div>

      {showMinimap && <Minimap ref={minimapRef} leftLines={leftLines} rightLines={rightLines} onScrollRequest={handleMinimapScrollRequest} />}
    </div>
  )
}

const Minimap = forwardRef<HTMLDivElement, { 
  lines?: DiffLine[], 
  leftLines?: DiffLine[], 
  rightLines?: DiffLine[],
  onScrollRequest?: (percent: number) => void
}>(
  ({ lines, leftLines, rightLines, onScrollRequest }, ref) => {
    const [isDragging, setIsDragging] = useState(false)

    const handlePointerEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
      if (!ref || typeof ref === 'function' || !ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const clientY = e.clientY - rect.top
      const percent = Math.max(0, Math.min(1, clientY / rect.height))
      
      if (onScrollRequest) {
        onScrollRequest(percent)
      }
    }, [ref, onScrollRequest])

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(true)
      handlePointerEvent(e)

      const handleMouseMove = (mouseEvent: MouseEvent) => {
        mouseEvent.preventDefault()
        handlePointerEvent(mouseEvent)
      }

      const handleMouseUp = () => {
        setIsDragging(false)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }, [handlePointerEvent])

    return (
      <div 
        ref={ref} 
        onMouseDown={handleMouseDown}
        className={cn(
          "w-8 shrink-0 border-l border-surface-border dark:border-surface-border flex flex-row overflow-hidden bg-surface-raised dark:bg-surface-raised select-none relative",
          isDragging ? "cursor-grabbing" : "cursor-pointer hover:bg-surface-border/20"
        )}
      >
        {lines ? (
          <div className="flex-1 relative w-full h-full">
            {lines.map((l, i) => l.type !== 'equal' && (
              <div 
                key={i} 
                className={cn("absolute w-full h-[2px]", l.type === 'added' ? 'bg-green-500/80' : 'bg-red-500/80')} 
                style={{ top: `${(i / lines.length) * 100}%` }}
              />
            ))}
          </div>
        ) : (
          <>
            <div className="flex-1 relative h-full border-r border-surface-border/30 dark:border-surface-border/30">
               {leftLines?.map((l, i) => l.type === 'removed' && (
                 <div key={i} className="absolute w-full h-[2px] bg-red-500/80" style={{ top: `${(i / leftLines.length) * 100}%` }} />
               ))}
            </div>
            <div className="flex-1 relative h-full">
               {rightLines?.map((l, i) => l.type === 'added' && (
                 <div key={i} className="absolute w-full h-[2px] bg-green-500/80" style={{ top: `${(i / rightLines.length) * 100}%` }} />
               ))}
            </div>
          </>
        )}
      </div>
    )
  }
)

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-surface-muted dark:text-surface-muted select-none">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none" className="opacity-30">
        <rect x="4" y="8" width="14" height="2" rx="1" fill="currentColor" />
        <rect x="4" y="13" width="10" height="2" rx="1" fill="currentColor" />
        <rect x="4" y="18" width="12" height="2" rx="1" fill="currentColor" />
        <rect x="22" y="8" width="14" height="2" rx="1" fill="currentColor" />
        <rect x="22" y="13" width="8" height="2" rx="1" fill="currentColor" />
        <rect x="22" y="18" width="11" height="2" rx="1" fill="currentColor" />
      </svg>
      <p className="text-sm tracking-wide">Paste text or upload files to compare</p>
    </div>
  )
}
