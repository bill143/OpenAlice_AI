/**
 * Version awareness route — exposes current app version + latest GitHub
 * release for the UI's update banner.
 *
 * GET /api/version → VersionInfo (see core/version.ts)
 *
 * Response is cheap because the GitHub fetch is cached server-side.
 */

import { Hono } from 'hono'
import { getVersionInfo } from '../../core/version.js'

export function createVersionRoutes() {
  const app = new Hono()

  app.get('/', async (c) => {
    const info = await getVersionInfo()
    return c.json(info)
  })

  return app
}
