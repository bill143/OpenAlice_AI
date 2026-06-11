import { http, HttpResponse } from 'msw'

export const toolsSimulatorHandlers = [
  http.get('/api/tools', () => HttpResponse.json({ inventory: [], disabled: [] })),
  http.put('/api/tools', () => HttpResponse.json({ disabled: [] })),
  http.get('/api/tools/:name', () =>
    HttpResponse.json({ error: 'not found' }, { status: 404 }),
  ),
  http.post('/api/tools/:name/execute', () =>
    HttpResponse.json({ content: [{ type: 'text', text: 'Demo mode — tool execution is disabled.' }], isError: true }),
  ),

  http.get('/api/simulator/utas', () => HttpResponse.json({ utas: [] })),
  http.get('/api/simulator/uta/:id/state', () =>
    HttpResponse.json({ positions: [], orders: [], cash: '0' }),
  ),
  http.post('/api/simulator/uta/:id/mark-price', () => HttpResponse.json({ filled: [] })),
  http.post('/api/simulator/uta/:id/tick-price', () => HttpResponse.json({ filled: [] })),
  http.post('/api/simulator/uta/:id/orders/:orderId/fill', () => HttpResponse.json({ ok: true })),
  http.post('/api/simulator/uta/:id/orders/:orderId/cancel', () => HttpResponse.json({ ok: true })),
  http.post('/api/simulator/uta/:id/external-deposit', () => HttpResponse.json({ ok: true })),
  http.post('/api/simulator/uta/:id/external-withdraw', () => HttpResponse.json({ ok: true })),
  http.post('/api/simulator/uta/:id/external-trade', () => HttpResponse.json({ ok: true })),
]
