/** @jest-environment node */
import { getStaticProps as getSearchProps } from '@/pages/search'
import { getStaticProps as getKeywordProps } from '@/pages/search/[keyword]'
import { getStaticProps as getNotFoundProps } from '@/pages/404'
import { fetchGlobalAllData } from '@/lib/db/SiteDataApi'

jest.mock('@/themes/theme', () => ({ DynamicLayout: () => null }))
jest.mock('@/lib/db/SiteDataApi', () => ({ fetchGlobalAllData: jest.fn() }))
jest.mock('@/lib/cache/cache_manager', () => ({ getDataFromCache: jest.fn() }))
jest.mock('@/lib/db/notion/getPostBlocks', () => ({ getPageBlockCacheKey: () => 'synthetic' }))
jest.mock('@/lib/db/notion/getPageContentText', () => ({ getPageContentText: () => [] }))
jest.mock('@/lib/config', () => ({ siteConfig: (_key, fallback) => fallback }))

describe('public page props', () => {
  beforeEach(() => {
    fetchGlobalAllData.mockImplementation(async () => ({
      NOTION_CONFIG: {},
      allPages: [
        { id: 'live', title: 'Live post', summary: 'Public summary', slug: 'live', type: 'Post', status: 'Published' },
        { id: 'future', title: 'Future title', summary: 'Future summary', slug: 'future', type: 'Post', status: 'Invisible' }
      ],
      latestPosts: [], allNavPages: [], allLinkPages: []
    }))
  })

  it.each([
    ['search', getSearchProps],
    ['keyword search', getKeywordProps],
    ['404', getNotFoundProps]
  ])('does not serialize the server-only allPages collection on %s', async (_route, getProps) => {
    const { props } = await getProps({ params: { keyword: 'live' }, locale: 'zh-CN' })
    expect(props).not.toHaveProperty('allPages')
    expect(JSON.stringify(props)).not.toContain('Future title')
    if (_route !== '404') expect(props.posts.map(post => post.slug)).toEqual(['live'])
  })
})
