/**
 * ChatWidget — floating chat bubble for OpenClaw AI Agent.
 *
 * Renders a fixed-position bubble in the bottom-right corner of every page.
 * Clicking the bubble opens a chat panel backed by the OpenClaw Gateway
 * WebSocket (see src/lib/chat/useGateway.ts).
 *
 * Only rendered on the client (the Gateway WebSocket and localStorage auth
 * are browser-only APIs).
 */

import { useState, useRef, useEffect, type KeyboardEvent, type FormEvent } from 'react'
import { useGateway, type UseGatewayReturn } from '../lib/chat/useGateway'
import { getCurrentUser } from '../utils/auth'
import { MessageSquare, X, Send, Loader2, AlertCircle, WifiOff } from 'lucide-react'
import type { GatewayMessage } from '../lib/chat/gateway-client'

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// --- MessageList -----------------------------------------------------------

interface MessageListProps {
  messages: GatewayMessage[]
  stream: string | null
}

function MessageList({ messages, stream }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Scroll to bottom when new content arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, stream])

  function extractText(msg: GatewayMessage): string {
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
        return (
          <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                isUser
                  ? 'bg-cyan-600 text-white rounded-br-sm'
                  : 'bg-gray-700 text-gray-100 rounded-bl-sm'
              }`}
            >
              {extractText(msg)}
            </div>
          </div>
        )
      })}

      {/* In-progress streaming text */}
      {stream !== null && (
        <div className="flex justify-start">
          <div className="max-w-[80%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm whitespace-pre-wrap break-words bg-gray-700 text-gray-100">
            {stream.length > 0 ? stream : <Loader2 className="w-4 h-4 animate-spin" />}
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
  gateway: UseGatewayReturn
  onClose: () => void
}

function ChatPanel({ gateway, onClose }: ChatPanelProps) {
  const { connected, messages, stream, sendMessage, error } = gateway
  const [sendError, setSendError] = useState<string | null>(null)

  async function handleSend(text: string) {
    setSendError(null)
    try {
      await sendMessage(text)
    } catch (e) {
      setSendError((e as Error).message)
    }
  }

  return (
    <div className="flex flex-col bg-gray-800 rounded-2xl shadow-2xl border border-gray-700 w-80 h-[28rem] overflow-hidden">
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
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-700 rounded-lg transition-colors text-gray-400 hover:text-white"
          aria-label="Close chat"
        >
          <X className="w-4 h-4" />
        </button>
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
 * on the server (window guard) and only when a user is logged in.
 */
export default function ChatWidget() {
  // Guard: do not mount on server or if not logged in
  if (typeof window === 'undefined') return null
  const user = getCurrentUser()
  if (!user) return null

  return <ChatWidgetInner />
}

function ChatWidgetInner() {
  const gateway = useGateway()
  const [isOpen, setIsOpen] = useState(false)
  // Track unread: increment when a final message arrives while panel is closed
  const [unreadCount, setUnreadCount] = useState(0)
  const prevMsgLen = useRef(0)

  useEffect(() => {
    if (!isOpen && gateway.messages.length > prevMsgLen.current) {
      setUnreadCount((c) => c + gateway.messages.length - prevMsgLen.current)
    }
    prevMsgLen.current = gateway.messages.length
  }, [gateway.messages.length, isOpen])

  function handleOpen() {
    setIsOpen(true)
    setUnreadCount(0)
  }

  function handleClose() {
    setIsOpen(false)
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {isOpen && <ChatPanel gateway={gateway} onClose={handleClose} />}
      <ChatBubble
        isOpen={isOpen}
        hasUnread={unreadCount > 0}
        onClick={isOpen ? handleClose : handleOpen}
      />
    </div>
  )
}
