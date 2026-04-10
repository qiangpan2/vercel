/**
 * Helpers for rendering untrusted markdown links in the chat widget.
 */

/** Remove ASCII control characters so scheme checks cannot be bypassed with e.g. java\u0000script:. */
export function normalizeChatMarkdownHref(href: string): string {
  return href.replace(/[\u0000-\u001F\u007F]/g, '')
}

/**
 * True if the href may be rendered as a clickable link.
 * Allows http(s), mailto, protocol-relative //host, and same-site path-style hrefs.
 * Blocks javascript:, data:, vbscript:, and unknown foo: schemes.
 */
export function isSafeChatMarkdownHref(href: string | undefined | null): boolean {
  if (href == null) return false
  const raw = href.trim()
  if (raw === '') return false
  const t = normalizeChatMarkdownHref(raw)
  const lower = t.toLowerCase()
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:')
  ) {
    return false
  }
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:')) {
    return true
  }
  // Protocol-relative URL (e.g. //evil.com) — allow link but mark external in the renderer
  if (t.startsWith('//')) {
    return true
  }
  if (t.startsWith('/') && !t.startsWith('//')) {
    return true
  }
  if (t.startsWith('#') || t.startsWith('?') || t.startsWith('./') || t.startsWith('../')) {
    return true
  }
  return !t.includes(':')
}

/** True when the link should open in a new tab with noopener. */
export function isExternalChatMarkdownHref(href: string): boolean {
  const t = normalizeChatMarkdownHref(href.trim())
  return /^https?:\/\//i.test(t) || /^\/\//.test(t)
}

/** Like link rules but disallows mailto: for <img src>. */
export function isSafeChatMarkdownImgSrc(src: string | undefined | null): boolean {
  if (!isSafeChatMarkdownHref(src)) return false
  const t = normalizeChatMarkdownHref(String(src).trim()).toLowerCase()
  if (t.startsWith('mailto:')) return false
  return true
}
