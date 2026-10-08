/** @jest-environment node */
import { fetchGlobalAllData } from '@/lib/db/SiteDataApi'
import { getOrSetDataWithCache } from '@/lib/cache/cache_manager'
import { deepClone } from '@/lib/utils'

jest.mock('@/lib/cache/cache_manager', () => ({ getOrSetDataWithCache: jest.fn() }))
jest.mock('@/lib/db/notion/getPostBlocks', () => ({
  fetchInBatches: jest.fn(), fetchNotionPageBlocks: jest.fn(), formatNotionBlock: jest.fn()
}))
jest.mock('@/lib/db/notion/getPageProperties', () => ({ __esModule: true, default: jest.fn(), adjustPageProperties: jest.fn() }))
jest.mock('@/lib/db/notion/getNotionAPI', () => ({ __esModule: true, default: {} }))
jest.mock('@/lib/db/notion/getNotionPost', () => ({ fetchPageFromNotion: jest.fn() }))
jest.mock('@/lib/db/notion/memberDataSource', () => ({ fetchMembersFromOfficialAPI: jest.fn() }))
jest.mock('@/lib/plugins/algolia', () => ({}))
jest.mock('@/lib/utils/post', () => ({ processPostData: jest.fn() }))
jest.mock('notion-utils', () => ({ idToUuid: value => value }))
jest.mock('@/lib/config', () => ({
  siteConfig: (key, fallback, config = {}) => config[key] ?? fallback
}))

function fixture(schedule = true) {
  const post = (id, status, date = {}, type = 'Post') => ({
    id, title: `${id} title`, summary: `${id} summary`, slug: id, href: `/${id}`,
    status, type, date, category: [id], tags: [id], publishDate: 1, lastEditedDate: 1
  })
  const allPages = [
    post('live', 'Published'),
    post('future', 'Published', { start_date: '2099-01-01' }),
    post('expired', 'Published', { end_date: '2000-01-01' }),
    post('unlisted', 'Invisible'),
    post('futurepage', 'Published', { start_date: '2099-01-01' }, 'Page'),
    post('event', 'Published', { start_date: '2099-01-01' }, 'Event')
  ]
  return {
    NOTION_CONFIG: { POST_SCHEDULE_PUBLISH: schedule, LATEST_POST_COUNT: 6 },
    allPages, latestPosts: allPages.filter(p => p.type === 'Post' && p.status === 'Published'),
    allNavPages: allPages.filter(p => p.type === 'Post' && p.status === 'Published'),
    allLinkPages: allPages.filter(p => ['Post', 'Page'].includes(p.type) && p.status === 'Published'),
    categoryOptions: allPages.map(p => ({ id: p.id, name: p.id, count: 1 })),
    tagOptions: allPages.map(p => ({ id: p.id, name: p.id, count: 1, source: 'Published' })),
    customNav: [{ name: 'futurepage title', href: '/futurepage' }],
    customMenu: [{ name: 'Intentional unlisted link', href: '/unlisted' }],
    allMembers: [], allEvents: [allPages[5]], postCount: 3, siteInfo: { title: 'Synthetic' }
  }
}

async function readFixture(schedule) {
  const original = fixture(schedule)
  getOrSetDataWithCache.mockImplementation(async (key, load) =>
    key.startsWith('site_') ? deepClone(original) : load()
  )
  return fetchGlobalAllData({ pageId: 'synthetic', from: 'test' })
}

describe('scheduled public collections', () => {
  it('removes future/expired metadata from every derived public list and count', async () => {
    const data = await readFixture(true)
    expect(data.latestPosts.map(p => p.slug)).toEqual(['live'])
    expect(data.allNavPages.map(p => p.slug)).toEqual(['live'])
    expect(data.allLinkPages.map(p => p.slug)).toEqual(['live'])
    expect(data.categoryOptions.map(p => p.name)).toEqual(['live'])
    expect(data.tagOptions.map(p => p.name)).toEqual(['live'])
    expect(data.customNav).toEqual([])
    expect(data.postCount).toBe(1)
  })

  it('preserves unlisted direct-page data and intentional menu links', async () => {
    const data = await readFixture(true)
    expect(data.allPages.find(p => p.slug === 'unlisted').status).toBe('Invisible')
    expect(data.allPages.find(p => p.slug === 'future').status).toBe('Invisible')
    expect(data.customMenu[0].href).toBe('/unlisted')
    expect(data.allEvents[0].slug).toBe('event')
  })

  it('respects disabled scheduling', async () => {
    const data = await readFixture(false)
    expect(data.latestPosts.map(p => p.slug)).toEqual(['live', 'future', 'expired'])
  })
})
