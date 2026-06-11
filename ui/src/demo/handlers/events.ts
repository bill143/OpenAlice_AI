import { http, HttpResponse } from 'msw'
import { demoEvents } from '../fixtures/events'

// SSE: emit historical events back-to-back on connect so the feed looks
// populated, then leave the stream open idle. The UI's connectSSE treats
// stream close as an error and reconnects with backoff, so we MUST NOT
// close the controller.
function eventsStream(): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const ev of demoEvents) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`))
      }
      // Stream stays open — Stage 3 may script live ticks here.
    },
  })
  return new HttpResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

const lastSeq = demoEvents[demoEvents.length - 1].seq

export const eventsHandlers = [
  http.get('/api/events', () =>
    HttpResponse.json({
      entries: [...demoEvents].reverse(),
      total: demoEvents.length,
      page: 1,
      pageSize: 50,
      totalPages: 1,
    }),
  ),
  http.get('/api/events/recent', () =>
    HttpResponse.json({ entries: [...demoEvents].reverse(), lastSeq }),
  ),
  http.get('/api/events/stream', () => eventsStream()),
  http.post('/api/events/ingest', () =>
    HttpResponse.json(demoEvents[demoEvents.length - 1], { status: 201 }),
  ),
  http.get('/api/events/auth-status', () =>
    HttpResponse.json({ configured: false, tokenCount: 0, tokenIds: [] }),
  ),
]
