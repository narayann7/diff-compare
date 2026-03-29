import {
  Bold,
  Code2,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Maximize2,
  Paperclip,
  Quote,
  Strikethrough,
  Table,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { cn } from '../lib/utils'

interface CommentBoxProps {
  onSubmit: (body: string) => Promise<void>
  onCancel: () => void
  isDark?: boolean
}

export function CommentBox({ onSubmit, onCancel, isDark = true }: CommentBoxProps) {
  const [body, setBody] = useState('')
  const [isPreview, setIsPreview] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const insertMarkdown = (prefix: string, suffix = '', placeholder = '') => {
    const el = textareaRef.current
    if (!el || isPreview) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = body.slice(start, end) || placeholder
    const newBody = body.slice(0, start) + prefix + selected + suffix + body.slice(end)
    setBody(newBody)
    setTimeout(() => {
      el.focus()
      el.selectionStart = start + prefix.length
      el.selectionEnd = start + prefix.length + selected.length
    }, 0)
  }

  const handleSubmit = async () => {
    if (!body.trim() || isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSubmit(body.trim())
      setBody('')
    } finally {
      setIsSubmitting(false)
    }
  }

  const canSubmit = body.trim().length > 0 && !isSubmitting
  const border = isDark ? 'border-surface-border' : 'border-surfaceLight-border'

  function Sep() {
    return <div className={cn('w-px h-4 mx-0.5 shrink-0', isDark ? 'bg-surface-border' : 'bg-gray-200')} />
  }

  function TBtn({
    title,
    onClick,
    children,
  }: {
    title: string
    onClick: () => void
    children: React.ReactNode
  }) {
    return (
      <button
        type="button"
        title={title}
        onClick={onClick}
        className={cn(
          'w-6 h-6 flex items-center justify-center rounded transition-colors',
          isDark
            ? 'text-white/40 hover:text-white hover:bg-white/10'
            : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
        )}
      >
        {children}
      </button>
    )
  }

  return (
    <div
      className={cn(
        'rounded-md border overflow-hidden text-sm',
        isDark
          ? 'border-surface-border bg-[hsl(220,4%,8%)]'
          : 'border-surfaceLight-border bg-white',
      )}
    >
      {/* Toolbar */}
      <div className={cn('flex items-center px-2 py-1 gap-0.5 border-b', border)}>
        <button
          type="button"
          onClick={() => setIsPreview(false)}
          className={cn(
            'px-2 py-1 text-xs font-medium rounded transition-colors',
            !isPreview
              ? isDark
                ? 'text-white'
                : 'text-gray-900'
              : isDark
                ? 'text-white/35 hover:text-white'
                : 'text-gray-400 hover:text-gray-700',
          )}
        >
          Write
        </button>
        <button
          type="button"
          onClick={() => setIsPreview(true)}
          className={cn(
            'px-2 py-1 text-xs font-medium rounded transition-colors mr-1',
            isPreview
              ? isDark
                ? 'text-white'
                : 'text-gray-900'
              : isDark
                ? 'text-white/35 hover:text-white'
                : 'text-gray-400 hover:text-gray-700',
          )}
        >
          Preview
        </button>
        <Sep />
        <TBtn title="Bold" onClick={() => insertMarkdown('**', '**', 'bold text')}>
          <Bold size={12} />
        </TBtn>
        <TBtn title="Italic" onClick={() => insertMarkdown('_', '_', 'italic text')}>
          <Italic size={12} />
        </TBtn>
        <TBtn title="Strikethrough" onClick={() => insertMarkdown('~~', '~~', 'strikethrough')}>
          <Strikethrough size={12} />
        </TBtn>
        <Sep />
        <TBtn title="Blockquote" onClick={() => insertMarkdown('> ', '', 'quote')}>
          <Quote size={12} />
        </TBtn>
        <TBtn title="Code" onClick={() => insertMarkdown('`', '`', 'code')}>
          <Code2 size={12} />
        </TBtn>
        <TBtn title="Link" onClick={() => insertMarkdown('[', '](url)', 'link text')}>
          <Link size={12} />
        </TBtn>
        <Sep />
        <TBtn title="Unordered list" onClick={() => insertMarkdown('- ', '', 'list item')}>
          <List size={12} />
        </TBtn>
        <TBtn title="Ordered list" onClick={() => insertMarkdown('1. ', '', 'list item')}>
          <ListOrdered size={12} />
        </TBtn>
        <TBtn title="Task list" onClick={() => insertMarkdown('- [ ] ', '', 'task')}>
          <ListChecks size={12} />
        </TBtn>
        <Sep />
        <TBtn
          title="Table"
          onClick={() =>
            insertMarkdown('| Col 1 | Col 2 |\n| --- | --- |\n| Cell | Cell |', '')
          }
        >
          <Table size={12} />
        </TBtn>
        <TBtn title="Attach file" onClick={() => {}}>
          <Paperclip size={12} />
        </TBtn>
        <div className="flex-1" />
        <TBtn title="Fullscreen" onClick={() => {}}>
          <Maximize2 size={12} />
        </TBtn>
      </div>

      {/* Content */}
      {isPreview ? (
        <div
          className={cn(
            'min-h-[120px] p-3 text-sm whitespace-pre-wrap',
            isDark ? 'text-white/75' : 'text-gray-700',
          )}
        >
          {body || (
            <span className={isDark ? 'text-white/25' : 'text-gray-400'}>Nothing to preview</span>
          )}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write a comment or drag your files here…"
          rows={5}
          className={cn(
            'w-full resize-y font-sans text-sm p-3 outline-none bg-transparent',
            isDark ? 'text-white placeholder:text-white/25' : 'text-gray-800 placeholder:text-gray-400',
          )}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit()
          }}
        />
      )}

      {/* Footer */}
      <div
        className={cn(
          'px-3 py-1.5 border-t text-xs',
          border,
          isDark ? 'text-white/25' : 'text-gray-400',
        )}
      >
        Switch to rich text editing
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
            canSubmit
              ? isDark
                ? 'bg-white/90 text-gray-900 hover:bg-white'
                : 'bg-gray-800 text-white hover:bg-gray-900'
              : isDark
                ? 'bg-white/8 text-white/25 cursor-not-allowed'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed',
          )}
        >
          {isSubmitting ? 'Commenting…' : 'Comment'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className={cn(
            'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
            isDark
              ? 'bg-surface-raised text-white/55 hover:text-white'
              : 'bg-gray-100 text-gray-600 hover:text-gray-800',
          )}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
