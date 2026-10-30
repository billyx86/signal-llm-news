import { describe, it, expect } from 'vitest'
import { validateFeedUrl, isPublicHost } from '@/lib/feed-url-guard'

describe('validateFeedUrl — happy path', () => {
  it('accepts a well-formed https feed URL and normalises it', () => {
    const res = validateFeedUrl('https://example.com/blog/rss.xml')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.url).toBe('https://example.com/blog/rss.xml')
  })

  it('accepts http feed URLs', () => {
    const res = validateFeedUrl('http://feeds.feedburner.com/SomeFeed')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.url).toBe('http://feeds.feedburner.com/SomeFeed')
  })

  it('trims surrounding whitespace before parsing', () => {
    const res = validateFeedUrl('  https://example.com/feed  ')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.url).toBe('https://example.com/feed')
  })

  it('accepts a URL with a port and path + query', () => {
    const res = validateFeedUrl('https://example.com:8443/rss?x=1')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.url).toBe('https://example.com:8443/rss?x=1')
  })
})

describe('validateFeedUrl — rejects malformed input', () => {
  it('rejects an empty string', () => {
    expect(validateFeedUrl('').ok).toBe(false)
    expect(validateFeedUrl('   ').ok).toBe(false)
  })

  it('rejects non-URL text', () => {
    const res = validateFeedUrl('not a url')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toMatch(/valid url/i)
  })

  it('rejects a schemeless URL (treated as invalid relative)', () => {
    expect(validateFeedUrl('example.com/rss.xml').ok).toBe(false)
  })
})

describe('validateFeedUrl — scheme restrictions', () => {
  it.each(['ftp://example.com/feed', 'file:///etc/passwd', 'gopher://example.com', 'data:text/plain,hi', 'javascript:alert(1)'])(
    'rejects the %s scheme',
    (url) => {
      const res = validateFeedUrl(url)
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.reason).toMatch(/http/i)
    },
  )
})

describe('validateFeedUrl — SSRF: rejects non-public hosts', () => {
  it('rejects loopback 127.0.0.1 (the acceptance-criterion vector)', () => {
    expect(validateFeedUrl('http://127.0.0.1/admin').ok).toBe(false)
  })

  it('rejects IPv6 loopback [::1]', () => {
    expect(validateFeedUrl('http://[::1]/rss').ok).toBe(false)
  })

  it('rejects the unspecified IPv6 address [::]', () => {
    expect(validateFeedUrl('http://[::]/rss').ok).toBe(false)
  })

  it('rejects cloud metadata / link-local 169.254.169.254', () => {
    expect(validateFeedUrl('http://169.254.169.254/latest/meta-data').ok).toBe(false)
  })

  it('rejects RFC1918 private ranges', () => {
    expect(validateFeedUrl('http://10.0.0.5/rss').ok).toBe(false)
    expect(validateFeedUrl('http://172.16.0.1/rss').ok).toBe(false)
    expect(validateFeedUrl('http://172.31.255.255/rss').ok).toBe(false)
    expect(validateFeedUrl('http://192.168.1.1/rss').ok).toBe(false)
  })

  it('rejects the CGNAT range 100.64.0.0/10', () => {
    expect(validateFeedUrl('http://100.64.0.1/rss').ok).toBe(false)
    expect(validateFeedUrl('http://100.127.255.255/rss').ok).toBe(false)
  })

  it('rejects IETF TEST-NET and 240.0.0.0/4 reserved ranges', () => {
    expect(validateFeedUrl('http://198.51.100.1/rss').ok).toBe(false)
    expect(validateFeedUrl('http://203.0.113.7/rss').ok).toBe(false)
    expect(validateFeedUrl('http://240.0.0.1/rss').ok).toBe(false)
  })

  it('rejects IPv6 unique-local (fc00::/7) and link-local (fe80::/10)', () => {
    expect(validateFeedUrl('http://[fd12:3456::1]/rss').ok).toBe(false)
    expect(validateFeedUrl('http://[fe80::1]/rss').ok).toBe(false)
  })

  it('rejects an IPv4-mapped IPv6 loopback address', () => {
    expect(validateFeedUrl('http://[::ffff:127.0.0.1]/rss').ok).toBe(false)
  })

  it('rejects localhost and *.localhost hostnames', () => {
    expect(validateFeedUrl('http://localhost/rss').ok).toBe(false)
    expect(validateFeedUrl('https://rss.localhost/feed').ok).toBe(false)
  })
})

describe('validateFeedUrl — accepts public hosts', () => {
  it('accepts ordinary public domain names', () => {
    expect(validateFeedUrl('https://openai.com/blog/rss.xml').ok).toBe(true)
    expect(validateFeedUrl('https://www.anthropic.com/news/rss.xml').ok).toBe(true)
    expect(validateFeedUrl('https://deepmind.google/discover/blog/rss.xml').ok).toBe(true)
  })

  it('accepts a public literal IPv4 address', () => {
    expect(validateFeedUrl('http://8.8.8.8/rss').ok).toBe(true)
  })

  it('accepts a public IPv6 literal', () => {
    // 2606:4700::/11 is Cloudflare's public range.
    expect(validateFeedUrl('http://[2606:4700:4700::1111]/rss').ok).toBe(true)
  })

  it('fails closed on a malformed IPv4 literal', () => {
    // 999.999.999.99 is not a valid address — reject, don't guess.
    expect(validateFeedUrl('http://999.999.999.99/rss').ok).toBe(false)
  })
})

describe('isPublicHost — direct host checks', () => {
  it('accepts a normal hostname', () => {
    expect(isPublicHost('example.com')).toBe(true)
    expect(isPublicHost('www.example.com')).toBe(true)
  })

  it('is case-insensitive for hostnames and schemes-agnostic', () => {
    expect(isPublicHost('EXAMPLE.COM')).toBe(true)
    expect(isPublicHost('LocalHost')).toBe(false)
    expect(isPublicHost('LOCALHOST.')).toBe(false) // trailing dot: not the bare name
  })

  it('rejects the bare `localhost` suffix forms', () => {
    expect(isPublicHost('localhost')).toBe(false)
    expect(isPublicHost('foo.localhost')).toBe(false)
  })

  it('rejects an empty host', () => {
    expect(isPublicHost('')).toBe(false)
    expect(isPublicHost('   ')).toBe(false)
  })

  it('rejects the 100.64.0.0/10 CGNAT boundary precisely', () => {
    expect(isPublicHost('100.63.255.255')).toBe(true) // just below the block
    expect(isPublicHost('100.64.0.0')).toBe(false)
    expect(isPublicHost('100.127.255.255')).toBe(false)
    expect(isPublicHost('100.128.0.0')).toBe(true) // just above the block
  })

  it('rejects the 172.16.0.0/12 boundary precisely', () => {
    expect(isPublicHost('172.15.255.255')).toBe(true)
    expect(isPublicHost('172.16.0.0')).toBe(false)
    expect(isPublicHost('172.31.255.255')).toBe(false)
    expect(isPublicHost('172.32.0.0')).toBe(true)
  })

  it('handles 0.0.0.0/8 and the broadcast address', () => {
    expect(isPublicHost('0.0.0.0')).toBe(false)
    expect(isPublicHost('0.1.2.3')).toBe(false)
    expect(isPublicHost('255.255.255.255')).toBe(false)
  })
})
