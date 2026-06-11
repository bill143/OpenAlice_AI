import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  compareVersions,
  getCurrentVersion,
  getRepoSlug,
  fetchLatestRelease,
  getVersionInfo,
  _resetCacheForTest,
} from './version.js'

describe('compareVersions', () => {
  it('compares core versions numerically', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0)
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0) // not lexicographic
  })

  it('treats release as greater than prerelease for same core', () => {
    expect(compareVersions('1.0.0', '1.0.0-beta.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-beta.0', '1.0.0')).toBeLessThan(0)
  })

  it('compares prerelease tags lexicographically', () => {
    expect(compareVersions('1.0.0-beta.1', '1.0.0-beta.0')).toBeGreaterThan(0)
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBeLessThan(0)
  })

  it('strips a leading v', () => {
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('v1.2.4', 'v1.2.3')).toBeGreaterThan(0)
  })

  it('handles missing parts as zero', () => {
    expect(compareVersions('1', '1.0.0')).toBe(0)
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
  })
})

describe('getCurrentVersion', () => {
  it('returns a non-empty version string from package.json', () => {
    const v = getCurrentVersion()
    expect(typeof v).toBe('string')
    expect(v.length).toBeGreaterThan(0)
  })
})

describe('getRepoSlug', () => {
  it('parses owner/repo from package.json repository url', () => {
    const slug = getRepoSlug()
    expect(slug).not.toBeNull()
    expect(slug?.owner).toBeTruthy()
    expect(slug?.repo).toBeTruthy()
  })
})

describe('fetchLatestRelease (mocked fetch)', () => {
  const origFetch = globalThis.fetch

  beforeEach(() => {
    _resetCacheForTest()
  })

  afterEach(() => {
    globalThis.fetch = origFetch
  })

  it('returns the parsed release on success (array shape, takes first non-draft)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ([
        {
          tag_name: 'v1.2.3',
          html_url: 'https://github.com/owner/repo/releases/tag/v1.2.3',
          body: '## Changelog',
          published_at: '2026-05-09T00:00:00Z',
          draft: false,
          prerelease: true,
        },
      ]),
    }) as unknown as typeof fetch

    const { result, error } = await fetchLatestRelease()
    expect(error).toBeNull()
    expect(result?.version).toBe('1.2.3') // leading v stripped
    expect(result?.url).toContain('github.com')
    expect(result?.body).toBe('## Changelog')
  })

  it('skips draft releases', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      json: async () => ([
        { tag_name: 'v2.0.0', html_url: 'x', body: '', published_at: '', draft: true, prerelease: false },
        { tag_name: 'v1.0.0', html_url: 'y', body: '', published_at: '', draft: false, prerelease: false },
      ]),
    }) as unknown as typeof fetch

    const { result } = await fetchLatestRelease()
    expect(result?.version).toBe('1.0.0') // first non-draft
  })

  it('accepts prereleases as updates', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      json: async () => ([
        { tag_name: 'v0.10.0-beta.0', html_url: 'x', body: '', published_at: '', draft: false, prerelease: true },
      ]),
    }) as unknown as typeof fetch

    const { result } = await fetchLatestRelease()
    expect(result?.version).toBe('0.10.0-beta.0')
  })

  it('returns error when no published releases found', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      json: async () => ([]),
    }) as unknown as typeof fetch
    const { result, error } = await fetchLatestRelease()
    expect(result).toBeNull()
    expect(error).toContain('No published releases')
  })

  it('returns error and caches it on HTTP failure', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 404, statusText: 'Not Found',
      json: async () => ([]),
    }) as unknown as typeof fetch

    const r1 = await fetchLatestRelease()
    expect(r1.error).toContain('404')

    const fetchSpy = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    const callsBefore = fetchSpy.mock.calls.length
    const r2 = await fetchLatestRelease()
    const callsAfter = fetchSpy.mock.calls.length
    expect(callsAfter).toBe(callsBefore)
    expect(r2.error).toBe(r1.error)
  })

  it('caches success responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      json: async () => ([{ tag_name: 'v1.0.0', html_url: 'x', body: '', published_at: '', draft: false, prerelease: false }]),
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await fetchLatestRelease()
    await fetchLatestRelease()
    await fetchLatestRelease()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('handles network errors gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch
    const { result, error } = await fetchLatestRelease()
    expect(result).toBeNull()
    expect(error).toContain('ECONNREFUSED')
  })
})

describe('getVersionInfo', () => {
  beforeEach(() => { _resetCacheForTest() })

  it('reports hasUpdate=true when latest > current', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      json: async () => ([{
        tag_name: 'v999.999.999',
        html_url: 'https://example.com',
        body: '',
        published_at: '2026-05-09T00:00:00Z',
        draft: false, prerelease: false,
      }]),
    }) as unknown as typeof fetch

    const info = await getVersionInfo()
    expect(info.latest).toBe('999.999.999')
    expect(info.hasUpdate).toBe(true)
    expect(info.error).toBeNull()
  })

  it('reports hasUpdate=false when latest = current', async () => {
    const current = getCurrentVersion()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, statusText: 'OK',
      json: async () => ([{ tag_name: current, html_url: 'x', body: '', published_at: '', draft: false, prerelease: false }]),
    }) as unknown as typeof fetch

    const info = await getVersionInfo()
    expect(info.hasUpdate).toBe(false)
  })

  it('returns error when GitHub fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('boom')) as unknown as typeof fetch
    const info = await getVersionInfo()
    expect(info.latest).toBeNull()
    expect(info.hasUpdate).toBe(false)
    expect(info.error).toContain('boom')
  })
})
