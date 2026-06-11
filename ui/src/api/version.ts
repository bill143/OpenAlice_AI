import type { VersionInfo } from './types'

export const versionApi = {
  async get(): Promise<VersionInfo> {
    const res = await fetch('/api/version')
    if (!res.ok) throw new Error(`Failed to fetch version info: ${res.status}`)
    return res.json()
  },
}
