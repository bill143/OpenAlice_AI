/**
 * OpenTypeBB — HTTP Server entry point.
 *
 * Usage:
 *   npx tsx src/server.ts
 *   # or after build:
 *   node dist/server.js
 *
 * Environment variables:
 *   OPENTYPEBB_PORT   — Server port (default: 6901)
 *   FMP_API_KEY       — Financial Modeling Prep API key
 *
 * Credentials can also be passed per-request via:
 *   X-OpenBB-Credentials: {"fmp_api_key": "..."}
 */

import { setupProxy } from './core/utils/proxy.js'
import { createApp, startServer, mountWidgetsEndpoint } from './core/api/rest-api.js'
import { createExecutor, createRegistry, loadAllRouters } from './core/api/app-loader.js'
import { buildWidgetsJson } from './core/api/widgets.js'

// Must be called before any fetch() calls
setupProxy()

// Build default credentials from environment variables
const defaultCredentials: Record<string, string> = {}
if (process.env.FMP_API_KEY) {
  defaultCredentials.fmp_api_key = process.env.FMP_API_KEY
}

// Create registry and executor with all providers loaded
const registry = createRegistry()
const executor = createExecutor()

// Create Hono app
const app = createApp(defaultCredentials)

// Load all extension routers
const rootRouter = loadAllRouters()

// Build widgets.json from router commands + provider registry + Zod schemas
const widgetsJson = buildWidgetsJson(rootRouter, registry)
mountWidgetsEndpoint(app, widgetsJson)
console.log(`Built widgets.json with ${Object.keys(widgetsJson).length} widgets`)

// Mount all extension routers as API endpoints
rootRouter.mountToHono(app, executor)

// Start server
const port = parseInt(process.env.OPENTYPEBB_PORT ?? '6901', 10)
startServer(app, port)
