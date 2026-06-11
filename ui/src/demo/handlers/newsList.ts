import { http, HttpResponse } from 'msw'
import { demoNewsArticles } from '../fixtures/news'
import type { NewsListResponse } from '../../api/types'

/**
 * News demo handler.
 *
 * `/api/news` returns `NewsListResponse = { items, count, lookback }` per
 * ui/src/api/types.ts — NOT { articles, hasMore }. NewsPage does
 * `setArticles(res.items)`; the wrong shape leaves articles=undefined and
 * crashes the page on `[...articles].reverse()` in render.
 */
export const newsListHandlers = [
  http.get('/api/news', ({ request }) => {
    const lookback = new URL(request.url).searchParams.get('lookback') ?? '24h'
    const body: NewsListResponse = {
      items: demoNewsArticles,
      count: demoNewsArticles.length,
      lookback,
    }
    return HttpResponse.json(body)
  }),
]
