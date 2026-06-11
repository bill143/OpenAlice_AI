/**
 * OpenAlice → Pi MCP bridge extension.
 *
 * Pi has no native MCP consumption, so this extension makes OpenAlice's MCP
 * tool surface available to Pi by speaking the MCP streamable-HTTP wire BY HAND
 * (zero runtime deps — just `fetch` + the `pi` ExtensionAPI). On load it lists
 * the tools from OpenAlice's MCP server(s) and registers each as a native Pi
 * tool, proxying calls back over MCP `tools/call`.
 *
 * OpenAlice's MCP server is STATELESS streamable-HTTP (verified against the
 * live server, serverInfo "open-alice", protocol 2025-06-18):
 *   - each POST is independent — NO `Mcp-Session-Id`, NO initialize handshake;
 *     `tools/list` / `tools/call` can be POSTed directly.
 *   - responses are SSE-framed: `event: message\ndata: <json-rpc>`.
 *
 * Two servers, mirroring the codex/opencode adapters:
 *   - global  OPENALICE_MCP_URL            → full tool surface (market, trading,
 *                                             analysis, news, …)
 *   - scoped  OPENALICE_MCP_URL/<AQ_WS_ID> → per-workspace tools (inbox_push,
 *                                             entity_*), prefixed `ws_` to avoid
 *                                             name collisions.
 *
 * Copied into a workspace's `.pi/extensions/` by context-injector when the
 * workspace injects tools; Pi auto-discovers it. It reads OPENALICE_MCP_URL /
 * AQ_WS_ID from the spawn env (set by the launcher, same as .mcp.json's
 * placeholder). NOT type-checked by Alice's tsc (loaded by Pi via jiti).
 */

interface McpTool {
  name: string
  description?: string
  inputSchema?: unknown
}

/** One stateless streamable-HTTP JSON-RPC round-trip; returns `result`. */
async function mcpRpc(
  url: string,
  method: string,
  params: unknown,
  signal?: AbortSignal,
): Promise<{ content?: unknown[]; tools?: McpTool[]; [k: string]: unknown }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // The server replies SSE; it requires both accept types.
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params ?? {} }),
    signal,
  })
  if (!res.ok) throw new Error(`MCP ${method} ${url} → HTTP ${res.status}`)
  const text = await res.text()
  // Response is SSE-framed (`event: message\ndata: <json>`) or, defensively,
  // raw JSON. Pull the last `data:` payload either way.
  let jsonText = text
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const dataLines = text
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim())
    jsonText = dataLines[dataLines.length - 1] ?? '{}'
  }
  const payload = JSON.parse(jsonText)
  if (payload.error) throw new Error(`MCP ${method} error: ${JSON.stringify(payload.error)}`)
  return payload.result ?? {}
}

export default async function openaliceBridge(pi: {
  registerTool: (tool: unknown) => void
}): Promise<void> {
  const base = process.env.OPENALICE_MCP_URL
  if (!base) {
    console.error('[openalice-bridge] OPENALICE_MCP_URL not set — no tools bridged')
    return
  }
  const wsId = process.env.AQ_WS_ID
  const servers: Array<{ prefix: string; url: string }> = [{ prefix: '', url: base }]
  if (wsId) servers.push({ prefix: 'ws_', url: `${base}/${wsId}` })

  let registered = 0
  for (const server of servers) {
    let tools: McpTool[]
    try {
      const result = await mcpRpc(server.url, 'tools/list', {})
      tools = (result.tools ?? []) as McpTool[]
    } catch (err) {
      console.error(`[openalice-bridge] tools/list ${server.url} failed: ${(err as Error).message}`)
      continue
    }
    for (const tool of tools) {
      pi.registerTool({
        name: `${server.prefix}${tool.name}`,
        label: tool.name,
        description: tool.description ?? tool.name,
        // Raw MCP JSON-Schema, passed straight through (Pi accepts it; the
        // TypeBox param type is compile-time only).
        parameters: tool.inputSchema ?? { type: 'object', properties: {} },
        async execute(_toolCallId: string, params: unknown, signal?: AbortSignal) {
          // Pi convention: throw on transport failure (don't encode errors in
          // content). Map MCP result.content (already [{type:'text'|'image',…}])
          // straight to Pi content.
          const result = await mcpRpc(server.url, 'tools/call', { name: tool.name, arguments: params ?? {} }, signal)
          const content = Array.isArray(result.content)
            ? result.content
            : [{ type: 'text', text: JSON.stringify(result) }]
          return { content }
        },
      })
      registered++
    }
  }
  console.error(`[openalice-bridge] registered ${registered} OpenAlice tool(s) from ${servers.length} server(s)`)
}
