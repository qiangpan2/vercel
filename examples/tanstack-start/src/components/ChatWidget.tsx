/**
 * ChatWidget — floating chat bubble backed by the app Hermes proxy (/api/chat/*).
 *
 * Renders a fixed-position bubble in the bottom-right corner of every page.
 * Uses the logged-in session cookie; transcript is stored per user in SQLite.
 *
 * Only rendered on the client after GET /api/auth/me confirms a session (avoids stale localStorage vs cookie mismatch).
 */

import { useState, useRef, useEffect, type KeyboardEvent, type FormEvent } from 'react'
import { useHermesChat, type UseHermesChatReturn } from '../lib/chat/useHermesChat'
import { clearStoredUser, getCurrentUser } from '../utils/auth'
import { MessageSquare, X, Send, Loader2, AlertCircle, WifiOff, RotateCcw } from 'lucide-react'
import type { ChatMessage } from '../lib/chat/chat-types'
import {
  isExternalChatMarkdownHref,
  isSafeChatMarkdownHref,
  isSafeChatMarkdownImgSrc,
} from '../lib/chat/markdown-link-safety'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

// ---------------------------------------------------------------------------
// Markdown rendering constants (hoisted to avoid recreating on every render)
// ---------------------------------------------------------------------------

const REMARK_PLUGINS = [remarkGfm]

const MARKDOWN_COMPONENTS = {
  code({ className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '')
    return match ? (
      <SyntaxHighlighter
        style={oneDark}
        language={match[1]}
        PreTag="div"
        customStyle={{ fontSize: '12px', borderRadius: '8px', margin: '8px 0', padding: '12px' }}
      >
        {String(children).replace(/\n$/, '')}
      </SyntaxHighlighter>
    ) : (
      <code className="bg-gray-600 px-1 py-0.5 rounded text-xs font-mono" {...props}>
        {children}
      </code>
    )
  },
  img({ src, alt }: any) {
    if (!isSafeChatMarkdownImgSrc(src)) {
      return (
        <span className="text-gray-400 text-xs italic" title="Image URL not allowed">
          [image omitted]
        </span>
      )
    }
    return (
      <img
        src={src}
        alt={alt ?? ''}
        loading="lazy"
        className="max-w-full rounded-lg my-2 border border-gray-600"
        style={{ maxHeight: '300px', objectFit: 'contain' }}
      />
    )
  },
  p({ children }: any) {
    return <p className="mb-2 last:mb-0">{children}</p>
  },
  ul({ children }: any) {
    return <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>
  },
  ol({ children }: any) {
    return <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>
  },
  strong({ children }: any) {
    return <strong className="font-semibold text-white">{children}</strong>
  },
  h1({ children }: any) {
    return <h1 className="font-bold text-white text-base mb-1 mt-2">{children}</h1>
  },
  h2({ children }: any) {
    return <h2 className="font-bold text-white text-sm mb-1 mt-2">{children}</h2>
  },
  h3({ children }: any) {
    return <h3 className="font-semibold text-white text-sm mb-1 mt-2">{children}</h3>
  },
  h4({ children }: any) {
    return <h4 className="font-semibold text-white text-xs mb-1 mt-2">{children}</h4>
  },
  h5({ children }: any) {
    return <h5 className="font-semibold text-gray-300 text-xs mb-1 mt-2">{children}</h5>
  },
  h6({ children }: any) {
    return <h6 className="font-medium text-gray-400 text-xs mb-1 mt-1">{children}</h6>
  },
  a({ href, children }: any) {
    if (!isSafeChatMarkdownHref(href)) {
      return <span className="text-gray-300">{children}</span>
    }
    const isExternal = isExternalChatMarkdownHref(String(href))
    return (
      <a
        href={href}
        className="text-cyan-400 underline"
        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    )
  },
  blockquote({ children }: any) {
    return <blockquote className="border-l-2 border-cyan-500 pl-3 text-gray-400 italic my-2">{children}</blockquote>
  },
  table({ children }: any) {
    return (
      <div className="overflow-x-auto my-2">
        <table className="text-xs border-collapse w-full">{children}</table>
      </div>
    )
  },
  th({ children }: any) {
    return <th className="border border-gray-600 px-2 py-1 text-left font-semibold">{children}</th>
  },
  td({ children }: any) {
    return <td className="border border-gray-600 px-2 py-1">{children}</td>
  },
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// --- MarkdownMessage -------------------------------------------------------

function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
      {content}
    </ReactMarkdown>
  )
}

// --- MessageList -----------------------------------------------------------

interface MessageListProps {
  messages: ChatMessage[]
  stream: string | null
}

function MessageList({ messages, stream }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when new content arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, stream])

  function extractText(msg: ChatMessage): string {
    return msg.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('')
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {messages.length === 0 && stream === null && (
        <p className="text-center text-gray-400 text-sm mt-4">
          Ask me anything about GPU server bookings, CI status, or machine availability.
        </p>
      )}

      {messages.map((msg, i) => {
        const isUser = msg.role === 'user'
        const text = extractText(msg)
        return (
          <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm break-words ${
                isUser
                  ? 'bg-cyan-600 text-white rounded-br-sm whitespace-pre-wrap'
                  : 'bg-gray-700 text-gray-100 rounded-bl-sm'
              }`}
            >
              {isUser ? text : <MarkdownMessage content={text} />}
            </div>
          </div>
        )
      })}

      {/* In-progress streaming text */}
      {stream !== null && (
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm break-words bg-gray-700 text-gray-100">
            {stream.length > 0 ? <MarkdownMessage content={stream} /> : <Loader2 className="w-4 h-4 animate-spin" />}
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

// --- InputBar -------------------------------------------------------------

interface InputBarProps {
  onSend: (text: string) => void
  disabled: boolean
}

function InputBar({ onSend, disabled }: InputBarProps) {
  const [text, setText] = useState('')

  function submit() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    submit()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 p-3 border-t border-gray-700"
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={disabled ? 'Connecting…' : 'Message AI assistant…'}
        rows={1}
        className="flex-1 resize-none rounded-xl bg-gray-700 text-white placeholder-gray-400 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-50 max-h-28 overflow-y-auto"
        style={{ minHeight: '2.25rem' }}
      />
      <button
        type="submit"
        disabled={disabled || !text.trim()}
        className="p-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Send message"
      >
        <Send className="w-4 h-4" />
      </button>
    </form>
  )
}

// --- ChatPanel ------------------------------------------------------------

interface ChatPanelProps {
  chat: UseHermesChatReturn
  onClose: () => void
}

function ChatPanel({ chat, onClose }: ChatPanelProps) {
  const { connected, messages, stream, sendMessage, error, resetChat } = chat
  const [sendError, setSendError] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 384, height: 512 })
  const dragRef = useRef<{ type: 'width' | 'height'; startX: number; startY: number; startW: number; startH: number } | null>(null)
  // Store handlers in refs so document listeners always call the stable reference
  const handlersRef = useRef<{ move: (e: MouseEvent) => void; up: () => void } | null>(null)

  function startResizeWidth(e: React.MouseEvent) {
    e.preventDefault()
    dragRef.current = { type: 'width', startX: e.clientX, startY: e.clientY, startW: size.width, startH: size.height }
    attachDragListeners()
  }

  function startResizeHeight(e: React.MouseEvent) {
    e.preventDefault()
    dragRef.current = { type: 'height', startX: e.clientX, startY: e.clientY, startW: size.width, startH: size.height }
    attachDragListeners()
  }

  function attachDragListeners() {
    function onMouseMove(e: MouseEvent) {
      const d = dragRef.current
      if (!d) return
      if (d.type === 'width') {
        const newW = Math.min(Math.max(d.startW - (e.clientX - d.startX), 280), Math.min(800, window.innerWidth * 0.9))
        setSize(s => ({ ...s, width: newW }))
      } else {
        const newH = Math.min(Math.max(d.startH - (e.clientY - d.startY), 360), Math.min(700, window.innerHeight * 0.85))
        setSize(s => ({ ...s, height: newH }))
      }
    }
    function onMouseUp() {
      dragRef.current = null
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      handlersRef.current = null
    }
    handlersRef.current = { move: onMouseMove, up: onMouseUp }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  // Cleanup on unmount in case mouse is released outside
  useEffect(() => {
    return () => {
      if (handlersRef.current) {
        document.removeEventListener('mousemove', handlersRef.current.move)
        document.removeEventListener('mouseup', handlersRef.current.up)
      }
    }
  }, [])

  async function handleSend(text: string) {
    setSendError(null)
    try {
      await sendMessage(text)
    } catch (e) {
      setSendError((e as Error).message)
    }
  }

  async function handleReset() {
    setSendError(null)
    try {
      await resetChat()
    } catch (e) {
      setSendError((e as Error).message)
    }
  }

  return (
    <div
      className="flex flex-col bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden relative"
      style={{ width: size.width, height: size.height }}
    >
      {/* 上边缘拖拽句柄（调整高度） */}
      <div
        onMouseDown={startResizeHeight}
        className="absolute top-0 left-0 right-0 h-1.5 cursor-ns-resize hover:bg-cyan-500/40 z-10 rounded-t-2xl"
      />
      {/* 左边缘拖拽句柄（调整宽度） */}
      <div
        onMouseDown={startResizeWidth}
        className="absolute top-0 left-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-cyan-500/40 z-10 rounded-l-2xl"
      />
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white text-sm">AI Assistant</span>
          {connected ? (
            <span className="inline-block w-2 h-2 rounded-full bg-green-400" title="Connected" />
          ) : (
            <span title="Reconnecting…">
              <WifiOff className="w-3 h-3 text-yellow-400" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={stream !== null}
            className="p-1 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white disabled:opacity-40"
            title="Start a new conversation"
            aria-label="Reset conversation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
            aria-label="Close chat"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status banners */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-900/60 text-yellow-300 text-xs">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {sendError && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-red-900/60 text-red-300 text-xs">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <span>{sendError}</span>
        </div>
      )}

      {/* Message list */}
      <MessageList messages={messages} stream={stream} />

      {/* Input */}
      <InputBar onSend={handleSend} disabled={!connected || stream !== null} />
    </div>
  )
}

// --- ChatBubble -----------------------------------------------------------

interface ChatBubbleProps {
  isOpen: boolean
  hasUnread: boolean
  onClick: () => void
}

function ChatBubble({ isOpen, hasUnread, onClick }: ChatBubbleProps) {
  return (
    <button
      onClick={onClick}
      className="w-14 h-14 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg flex items-center justify-center transition-all hover:scale-105 relative"
      aria-label={isOpen ? 'Close chat' : 'Open AI assistant'}
    >
      {isOpen ? (
        <X className="w-6 h-6" />
      ) : (
        <MessageSquare className="w-6 h-6" />
      )}
      {hasUnread && !isOpen && (
        <span className="absolute top-1 right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-gray-900" />
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// ChatWidget (root export)
// ---------------------------------------------------------------------------

/**
 * Drop-in floating chat widget.  Mount once in __root.tsx; it renders nothing
 * on the server (window guard) and only when the server reports an active session.
 */
export default function ChatWidget() {
  if (typeof window === 'undefined') return null
  return <ChatWidgetGate />
}

type AuthGate = 'checking' | 'in' | 'out'

function ChatWidgetGate() {
  const [gate, setGate] = useState<AuthGate>('checking')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' })
        const data = (await res.json()) as { user?: unknown }
        if (cancelled) return
        if (data.user) {
          setGate('in')
          return
        }
        if (getCurrentUser()) {
          clearStoredUser()
        }
        setGate('out')
      } catch {
        if (!cancelled) setGate('out')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (gate === 'checking' || gate === 'out') return null
  return (
    <ChatWidgetInner
      onAuthLost={() => {
        clearStoredUser()
        setGate('out')
      }}
    />
  )
}

function ChatWidgetInner({ onAuthLost }: { onAuthLost: () => void }) {
  const chat = useHermesChat({ onUnauthorized: onAuthLost })
  const [isOpen, setIsOpen] = useState(false)
  // Track unread: increment when a final message arrives while panel is closed
  const [unreadCount, setUnreadCount] = useState(0)
  const prevMsgLen = useRef(0)

  useEffect(() => {
    if (!isOpen && chat.messages.length > prevMsgLen.current) {
      setUnreadCount((c) => c + chat.messages.length - prevMsgLen.current)
    }
    prevMsgLen.current = chat.messages.length
  }, [chat.messages.length, isOpen])

  function handleOpen() {
    setIsOpen(true)
    setUnreadCount(0)
  }

  function handleClose() {
    setIsOpen(false)
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {isOpen && <ChatPanel chat={chat} onClose={handleClose} />}
      <ChatBubble
        isOpen={isOpen}
        hasUnread={unreadCount > 0}
        onClick={isOpen ? handleClose : handleOpen}
      />
    </div>
  )
}
