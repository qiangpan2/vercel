import { describe, expect, it } from 'vitest'
import {
  isExternalChatMarkdownHref,
  isSafeChatMarkdownHref,
  isSafeChatMarkdownImgSrc,
} from './markdown-link-safety'

describe('markdown-link-safety', () => {
  it('allows https, mailto, same-site paths, and protocol-relative URLs', () => {
    expect(isSafeChatMarkdownHref('https://example.com/x')).toBe(true)
    expect(isSafeChatMarkdownHref('http://localhost/')).toBe(true)
    expect(isSafeChatMarkdownHref('mailto:a@b.com')).toBe(true)
    expect(isSafeChatMarkdownHref('/booking')).toBe(true)
    expect(isSafeChatMarkdownHref('//evil.com/path')).toBe(true)
    expect(isExternalChatMarkdownHref('//evil.com/path')).toBe(true)
    expect(isExternalChatMarkdownHref('https://x')).toBe(true)
    expect(isExternalChatMarkdownHref('/local')).toBe(false)
  })

  it('rejects dangerous schemes and smuggled javascript after control-char strip', () => {
    expect(isSafeChatMarkdownHref('javascript:alert(1)')).toBe(false)
    expect(isSafeChatMarkdownHref('data:text/html,<script>')).toBe(false)
    expect(isSafeChatMarkdownHref('java\u0000script:alert(1)')).toBe(false)
  })

  it('rejects unknown foo: schemes', () => {
    expect(isSafeChatMarkdownHref('foo:bar')).toBe(false)
  })

  it('disallows mailto for img src', () => {
    expect(isSafeChatMarkdownImgSrc('mailto:x@y')).toBe(false)
    expect(isSafeChatMarkdownImgSrc('https://x/y.png')).toBe(true)
  })
})
