/**
 * Provider class.
 * Maps to: openbb_core/provider/abstract/provider.py
 *
 * Serves as the provider extension entry point. Each data provider
 * (yfinance, fmp, sec, etc.) creates a Provider instance with its
 * name, description, credentials, and a fetcher_dict mapping model
 * names to Fetcher classes.
 */

import type { FetcherClass } from './fetcher.js'

export interface ProviderConfig {
  /** Short name of the provider (e.g., "fmp", "yfinance"). */
  name: string
  /** Description of the provider. */
  description: string
  /** Website URL of the provider. */
  website?: string
  /**
   * List of required credential names (without provider prefix).
   * Will be auto-prefixed with the provider name.
   * Example: ["api_key"] → ["fmp_api_key"]
   */
  credentials?: string[]
  /**
   * Dictionary mapping model names to Fetcher classes.
   * Example: { "EquityHistorical": FMPEquityHistoricalFetcher }
   */
  fetcherDict: Record<string, FetcherClass>
  /** Full display name of the provider. */
  reprName?: string
  /** Instructions on how to set up the provider (e.g., how to get an API key). */
  instructions?: string
}

export class Provider {
  readonly name: string
  readonly description: string
  readonly website?: string
  readonly credentials: string[]
  readonly fetcherDict: Record<string, FetcherClass>
  readonly reprName?: string
  readonly instructions?: string

  constructor(config: ProviderConfig) {
    this.name = config.name
    this.description = config.description
    this.website = config.website
    this.fetcherDict = config.fetcherDict
    this.reprName = config.reprName
    this.instructions = config.instructions

    // Auto-prefix credentials with provider name (matches Python behavior)
    // Example: credentials=["api_key"], name="fmp" → ["fmp_api_key"]
    if (config.credentials) {
      this.credentials = config.credentials.map(
        (c) => `${this.name.toLowerCase()}_${c}`,
      )
    } else {
      this.credentials = []
    }
  }
}
