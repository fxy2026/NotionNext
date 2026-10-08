/** @jest-environment node */
import fs from 'fs'
import BLOG from '@/blog.config'
import { getGlobalSnapshot } from '@/lib/global'
import { generateRss } from '@/lib/utils/rss'
import handler from '@/pages/api/rss'
import { fetchGlobalAllData } from '@/lib/db/SiteDataApi'

// Keep lib/config real: these tests guard against its browser-global precedence.
jest.mock('@/lib/global', () => ({ getGlobalSnapshot: jest.fn() }))
jest.mock('@/components/NotionPage', () => ({ __esModule: true, default: () => null }))
jest.mock('@/lib/db/SiteDataApi', () => ({ getPostBlocks: jest.fn(), fetchGlobalAllData: jest.fn() }))
jest.mock('@/lib/db/notion/getPostBlocks', () => ({ formatNotionBlock: value => value }))
jest.mock('@/lib/utils/notion.util', () => ({ adapterNotionBlockMap: value => value }))

const scenarios = [
  ['request false overrides a stale true snapshot', false, true, true, false],
  ['request string false is normalized', 'false', true, true, false],
  ['request true overrides a stale false snapshot', true, false, false, true],
  ['missing request flag uses BLOG, not the snapshot', undefined, true, false, false],
  ['null request flag falls back to BLOG', null, false, true, true]
]
const props = enabled => ({
  NOTION_CONFIG: enabled === undefined ? {} : { ENABLE_RSS: enabled },
  siteInfo: { title: 'Synthetic', description: 'Test', link: 'https://example.com' },
  allPages: [{ id: 'synthetic', title: 'Synthetic post', slug: 'synthetic', type: 'Post', status: 'Published', password: 'synthetic-marker', summary: 'Public summary', publishDay: '2026-01-01' }],
  get latestPosts() { return this.allPages }
})
const response = () => ({
  status: jest.fn().mockReturnThis(), setHeader: jest.fn(), json: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis()
})

describe('request-scoped RSS configuration with real config conversion', () => {
  const originalEnabled = BLOG.ENABLE_RSS
  let testClock = Date.UTC(2026, 9, 8)
  beforeEach(() => {
    testClock += 60 * 60 * 1000
    jest.useFakeTimers().setSystemTime(testClock)
    jest.spyOn(fs, 'statSync').mockImplementation(() => { throw new Error('ENOENT') })
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {})
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
  })
  afterEach(() => {
    BLOG.ENABLE_RSS = originalEnabled
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  it.each(scenarios)('static RSS: %s', async (_name, requestFlag, snapshotFlag, blogFlag, expected) => {
    BLOG.ENABLE_RSS = blogFlag
    getGlobalSnapshot.mockReturnValue({ NOTION_CONFIG: { ENABLE_RSS: snapshotFlag } })
    await generateRss(props(requestFlag))
    expect(fs.writeFileSync).toHaveBeenCalledTimes(expected ? 3 : 0)
  })

  it.each(scenarios)('RSS API: %s', async (_name, requestFlag, snapshotFlag, blogFlag, expected) => {
    BLOG.ENABLE_RSS = blogFlag
    getGlobalSnapshot.mockReturnValue({ NOTION_CONFIG: { ENABLE_RSS: snapshotFlag } })
    fetchGlobalAllData.mockResolvedValue(props(requestFlag))
    const res = response()
    await handler({ method: 'GET', query: {} }, res)
    expect(res.status).toHaveBeenCalledWith(expected ? 200 : 404)
  })
})
