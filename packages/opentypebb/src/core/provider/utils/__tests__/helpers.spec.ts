/**
 * amakeRequest network-error classification.
 *
 * The point of these tests: when fetch fails at the network layer (DNS,
 * TLS, routing, refused), the helper must throw a NetworkUnreachableError
 * with a "do not retry" hint that surfaces verbatim to AI agents — NOT
 * the generic "Request failed (TypeError: fetch failed)" string that
 * looks indistinguishable from a transient flake.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { amakeRequest } from '../helpers.js'
import { NetworkUnreachableError, OpenBBError } from '../errors.js'

const URL_OK = 'https://api.example.com/data'

describe('amakeRequest — network failure classification', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('classifies TypeError("fetch failed") as NetworkUnreachableError', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(amakeRequest(URL_OK)).rejects.toThrowError(NetworkUnreachableError)
  })

  it('the thrown error message contains NETWORK_UNREACHABLE + the host + a "do not retry" instruction', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    try {
      await amakeRequest(URL_OK)
      throw new Error('should have thrown')
    } catch (e) {
      const err = e as Error
      expect(err.message).toMatch(/NETWORK_UNREACHABLE/)
      expect(err.message).toMatch(/api\.example\.com/)
      expect(err.message.toLowerCase()).toMatch(/do not retry/i)
    }
  })

  it('preserves the underlying cause code when available (ENOTFOUND etc.)', async () => {
    const cause = Object.assign(new Error('getaddrinfo ENOTFOUND api.example.com'), { code: 'ENOTFOUND' })
    const wrapped = Object.assign(new TypeError('fetch failed'), { cause })
    fetchMock.mockRejectedValueOnce(wrapped)
    try {
      await amakeRequest(URL_OK)
      throw new Error('should have thrown')
    } catch (e) {
      const err = e as Error
      expect(err).toBeInstanceOf(NetworkUnreachableError)
      expect(err.message).toContain('ENOTFOUND')
    }
  })

  it('still uses generic OpenBBError for non-network failures (e.g. unhandled non-TypeError throws)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('mystery'))
    try {
      await amakeRequest(URL_OK)
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(OpenBBError)
      expect(e).not.toBeInstanceOf(NetworkUnreachableError)
      expect((e as Error).message).toMatch(/Request failed/)
    }
  })

  it('still uses OpenBBError for HTTP non-2xx (response reached but server rejected)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Forbidden', { status: 403, statusText: 'Forbidden' }))
    try {
      await amakeRequest(URL_OK)
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(OpenBBError)
      expect(e).not.toBeInstanceOf(NetworkUnreachableError)
      expect((e as Error).message).toMatch(/HTTP 403/)
    }
  })

  it('still uses OpenBBError for timeout (DOMException TimeoutError)', async () => {
    const timeoutError = new DOMException('signal timed out', 'TimeoutError')
    fetchMock.mockRejectedValueOnce(timeoutError)
    try {
      await amakeRequest(URL_OK, { timeoutMs: 1 })
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(OpenBBError)
      expect(e).not.toBeInstanceOf(NetworkUnreachableError)
      expect((e as Error).message).toMatch(/timed out/)
    }
  })
})
