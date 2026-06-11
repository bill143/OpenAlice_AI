/**
 * Error classes for OpenTypeBB.
 * Maps to: openbb_core/app/model/abstract/error.py
 *          openbb_core/provider/utils/errors.py
 */

/** Base error for all OpenBB errors. */
export class OpenBBError extends Error {
  readonly original?: unknown

  constructor(message: string, original?: unknown) {
    super(message)
    this.name = 'OpenBBError'
    this.original = original
  }
}

/** Raised when a query returns no data. */
export class EmptyDataError extends OpenBBError {
  constructor(message = 'No data found.') {
    super(message)
    this.name = 'EmptyDataError'
  }
}

/** Raised when credentials are missing or invalid. */
export class UnauthorizedError extends OpenBBError {
  constructor(message = 'Unauthorized.') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

/**
 * Raised when the request never reached the provider — DNS failure, TLS
 * failure, connection refused, host unreachable, etc. Distinct from
 * provider-side errors (HTTP 4xx/5xx, malformed JSON) because the fix
 * is on the user's network/proxy, not on the provider, and retrying
 * with the same network state is futile.
 *
 * Surfaced to AI agents with a "do not retry" hint so they don't burn
 * tokens on silent re-attempts that all fail the same way.
 */
export class NetworkUnreachableError extends OpenBBError {
  readonly host: string

  constructor(host: string, cause: string, original?: unknown) {
    super(
      `NETWORK_UNREACHABLE: cannot reach ${host} from this machine (${cause}). ` +
      `This is a network-layer failure (DNS / routing / TLS / proxy), not a provider error — ` +
      `the provider's API may well be operational, the connection from this network cannot complete. ` +
      `Do NOT retry the same call; ask the user to check their VPN / proxy routing for this hostname, ` +
      `or fall back to a different data source.`,
      original,
    )
    this.name = 'NetworkUnreachableError'
    this.host = host
  }
}
