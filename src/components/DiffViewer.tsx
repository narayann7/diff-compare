import { Fragment, useRef, useState, useCallback, forwardRef } from 'react'
import { type DiffLine, type DiffWord } from '../lib/diff-utils'
import { cn } from '../lib/utils'
import { CommentBox } from './CommentBox'
import { type LineComment } from '../lib/github-utils'

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
  onAddComment?: () => void
}

export function DiffLineRow({ line, showLeft = true, showRight = true, onAddComment }: DiffLineRowProps) {
  const lineClass = cn(
    'diff-line',
    onAddComment && 'group',
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
      <span className="diff-line-number relative">
        <span className={cn(onAddComment && 'group-hover:opacity-0 transition-opacity duration-100')}>
          {lineNum ?? ''}
        </span>
        {onAddComment && (
          <button
            onClick={e => { e.stopPropagation(); onAddComment() }}
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-100 text-blue-400 hover:text-blue-300 font-bold text-base leading-none"
            title="Add a comment"
          >
            +
          </button>
        )}
      </span>
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
  comments?: LineComment[]
  filename?: string
  onSubmitComment?: (filename: string, diffLine: DiffLine, body: string) => Promise<void>
  isDark?: boolean
}

function CommentThread({ comment, isDark }: { comment: LineComment; isDark?: boolean }) {
  return (
    <div
      className={cn(
        'flex gap-2.5 px-4 py-2 text-xs font-sans',
        isDark
          ? 'bg-surface-raised border-b border-surface-border/40'
          : 'bg-gray-50 border-b border-surfaceLight-border/60',
      )}
    >
      <div
        className={cn(
          'shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold',
          isDark ? 'bg-white/10 text-white/60' : 'bg-gray-200 text-gray-600',
        )}
      >
        {comment.author[0]?.toUpperCase() ?? '?'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className={cn('font-medium', isDark ? 'text-white/80' : 'text-gray-700')}>
            {comment.author}
          </span>
          <span className={isDark ? 'text-white/30' : 'text-gray-400'}>·</span>
          <a
            href={comment.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'hover:underline',
              isDark ? 'text-white/30 hover:text-white/50' : 'text-gray-400 hover:text-gray-600',
            )}
          >
            {new Date(comment.createdAt).toLocaleDateString()}
          </a>
        </div>
        <p className={cn('whitespace-pre-wrap break-words', isDark ? 'text-white/70' : 'text-gray-600')}>
          {comment.body}
        </p>
      </div>
    </div>
  )
}

export function UnifiedDiffViewer({ lines, wrapLines, showMinimap, comments, filename, onSubmitComment, isDark }: UnifiedDiffViewerProps) {
  const minimapRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [activeCommentRow, setActiveCommentRow] = useState<number | null>(null)

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

  const getLineComments = (line: DiffLine): LineComment[] => {
    if (!comments || !filename) return []
    return comments.filter(c => {
      if (c.filename !== filename) return false
      if (line.type === 'removed') return c.side === 'left' && c.lineNumber === line.lineNumberLeft
      return c.side === 'right' && c.lineNumber === line.lineNumberRight
    })
  }

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
            <Fragment key={i}>
              <DiffLineRow
                line={line}
                showLeft={line.type !== 'added'}
                showRight={line.type !== 'removed'}
                onAddComment={onSubmitComment ? () => setActiveCommentRow(i) : undefined}
              />
              {getLineComments(line).map(c => (
                <CommentThread key={c.id} comment={c} isDark={isDark} />
              ))}
              {activeCommentRow === i && (
                <div className="px-2 py-1.5">
                  <CommentBox
                    isDark={isDark}
                    onSubmit={async body => {
                      await onSubmitComment!(filename!, line, body)
                      setActiveCommentRow(null)
                    }}
                    onCancel={() => setActiveCommentRow(null)}
                  />
                </div>
              )}
            </Fragment>
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
  comments?: LineComment[]
  filename?: string
  onSubmitComment?: (filename: string, diffLine: DiffLine, body: string) => Promise<void>
  isDark?: boolean
}

export function SideBySideDiffViewer({ leftLines, rightLines, wrapLines, showMinimap, comments, filename, onSubmitComment, isDark }: SideBySideDiffViewerProps) {
  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const minimapRef = useRef<HTMLDivElement>(null)

  const [leftWidth, setLeftWidth] = useState(50)
  const [isResizing, setIsResizing] = useState(false)
  const [activeCommentLeft, setActiveCommentLeft] = useState<number | null>(null)
  const [activeCommentRight, setActiveCommentRight] = useState<number | null>(null)

  const getComments = (line: DiffLine, side: 'left' | 'right'): LineComment[] => {
    if (!comments || !filename) return []
    const lineNum = side === 'left' ? line.lineNumberLeft : line.lineNumberRight
    return comments.filter(c => c.filename === filename && c.side === side && c.lineNumber === lineNum)
  }

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
            <Fragment key={i}>
              <DiffLineRow
                line={line}
                showLeft={true}
                showRight={false}
                onAddComment={onSubmitComment && line.lineNumberLeft ? () => setActiveCommentLeft(i) : undefined}
              />
              {getComments(line, 'left').map(c => (
                <CommentThread key={c.id} comment={c} isDark={isDark} />
              ))}
              {activeCommentLeft === i && (
                <div className="px-2 py-1.5">
                  <CommentBox
                    isDark={isDark}
                    onSubmit={async body => {
                      await onSubmitComment!(filename!, line, body)
                      setActiveCommentLeft(null)
                    }}
                    onCancel={() => setActiveCommentLeft(null)}
                  />
                </div>
              )}
            </Fragment>
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
            <Fragment key={i}>
              <DiffLineRow
                line={line}
                showLeft={false}
                showRight={true}
                onAddComment={onSubmitComment && line.lineNumberRight ? () => setActiveCommentRight(i) : undefined}
              />
              {getComments(line, 'right').map(c => (
                <CommentThread key={c.id} comment={c} isDark={isDark} />
              ))}
              {activeCommentRight === i && (
                <div className="px-2 py-1.5">
                  <CommentBox
                    isDark={isDark}
                    onSubmit={async body => {
                      await onSubmitComment!(filename!, line, body)
                      setActiveCommentRight(null)
                    }}
                    onCancel={() => setActiveCommentRight(null)}
                  />
                </div>
              )}
            </Fragment>
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
