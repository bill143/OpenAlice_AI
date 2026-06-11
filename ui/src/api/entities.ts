import { fetchJson } from './client'

export type EntityType = 'asset' | 'topic'

export interface Entity {
  name: string
  description: string
  type: EntityType
  createdAt: number
}

export interface EntityListItem extends Entity {
  /** How many notes reference this entity via `[[name]]`. */
  backlinkCount: number
}

export interface Backlink {
  workspaceId: string
  workspaceTag: string
  /** Path of the note, relative to the workspace root. */
  path: string
}

export interface EntityDetail {
  entity: Entity
  backlinks: Backlink[]
}

export const entitiesApi = {
  async list(): Promise<{ entities: EntityListItem[] }> {
    return fetchJson('/api/entities')
  },
  async get(name: string): Promise<EntityDetail> {
    return fetchJson(`/api/entities/${encodeURIComponent(name)}`)
  },
}
