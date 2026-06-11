import { headers } from './client'

export const personaApi = {
  async get(): Promise<{ content: string; path: string }> {
    const res = await fetch('/api/persona')
    if (!res.ok) throw new Error('Failed to load persona')
    return res.json()
  },

  async update(content: string): Promise<void> {
    const res = await fetch('/api/persona', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ content }),
    })
    if (!res.ok) throw new Error('Failed to save persona')
  },
}
