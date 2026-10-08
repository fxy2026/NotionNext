/** @jest-environment node */
import BLOG from '@/blog.config'
import handler from '@/pages/api/rss'
import { fetchGlobalAllData } from '@/lib/db/SiteDataApi'

jest.mock('@/lib/db/SiteDataApi', () => ({ fetchGlobalAllData: jest.fn() }))
jest.mock('@/lib/utils/rss', () => ({ generateRss: jest.fn(), shouldGenerateRssForLocale: jest.fn() }))
jest.mock('@/lib/global', () => ({ getGlobalSnapshot: () => null }))

const props = config => ({
  siteInfo: { title: 'Synthetic feed', description: 'Test', link: 'https://example.com' },
  NOTION_CONFIG: config,
  allPages: [{ title: 'Synthetic post', slug: 'live', type: 'Post', status: 'Published', publishDay: '2026-01-01' }]
})
const response = () => ({
  status: jest.fn().mockReturnThis(), setHeader: jest.fn(), json: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis()
})

describe('RSS availability', () => {
  const originalEnabled = BLOG.ENABLE_RSS
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T00:00:00Z'))
    BLOG.ENABLE_RSS = true
  })
  afterEach(() => {
    BLOG.ENABLE_RSS = originalEnabled
    jest.useRealTimers()
  })

  it('returns 404 when RSS is disabled', async () => {
    fetchGlobalAllData.mockResolvedValue(props({ ENABLE_RSS: false }))
    const res = response()
    await handler({ method: 'GET', query: {} }, res)
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.send).not.toHaveBeenCalled()
  })

  it('does not publish a Notion failure placeholder as a successful feed', async () => {
    fetchGlobalAllData.mockResolvedValue({ ...props({}), dataSourceStatus: 'unavailable' })
    const res = response()
    await handler({ method: 'GET', query: {} }, res)
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.send).not.toHaveBeenCalled()
  })

  it('serves RSS/Atom/JSON and refuses non-GET methods', async () => {
    jest.setSystemTime(new Date('2026-10-09T00:00:00Z'))
    fetchGlobalAllData.mockResolvedValue(props({}))
    for (const [format, type] of [['rss', 'application/rss+xml'], ['atom', 'application/atom+xml'], ['json', 'application/json']]) {
      const res = response()
      await handler({ method: 'GET', query: { format } }, res)
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', `${type}; charset=utf-8`)
    }
    const res = response()
    await handler({ method: 'POST', query: {} }, res)
    expect(res.status).toHaveBeenCalledWith(405)
  })

  it('returns unavailable if expired cache refresh has no eligible posts', async () => {
    jest.setSystemTime(new Date('2026-10-10T00:00:00Z'))
    fetchGlobalAllData.mockResolvedValue({ ...props({}), allPages: [] })
    const res = response()
    await handler({ method: 'GET', query: {} }, res)
    expect(res.status).toHaveBeenCalledWith(503)
  })
})
