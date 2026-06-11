import { http, HttpResponse } from 'msw'
import { demoCronJobs } from '../fixtures/cron'

export const cronHandlers = [
  http.get('/api/cron/jobs', () => HttpResponse.json({ jobs: demoCronJobs })),
  http.post('/api/cron/jobs', () => HttpResponse.json({ id: 'demo-job' })),
  http.put('/api/cron/jobs/:id', () => new HttpResponse(null, { status: 204 })),
  http.delete('/api/cron/jobs/:id', () => new HttpResponse(null, { status: 204 })),
  http.post('/api/cron/jobs/:id/run', () => new HttpResponse(null, { status: 204 })),
]
