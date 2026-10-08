/** @jest-environment node */

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
// Test the actual serialization primitive; this file is not a Next.js page.
// eslint-disable-next-line @next/next/no-document-import-in-page
import { NextScript } from 'next/document'
import Slug, { getStaticProps as getOnePartProps } from '@/pages/[prefix]'
import { getStaticProps as getTwoPartProps } from '@/pages/[prefix]/[slug]'
import { getStaticProps as getManyPartProps } from '@/pages/[prefix]/[slug]/[...suffix]'
import { getStaticProps as getHomeProps } from '@/pages/index'
import { getStaticProps as getPaginatedProps } from '@/pages/page/[page]'
import { getStaticProps as getSearchProps } from '@/pages/search'
import { getStaticProps as getKeywordProps } from '@/pages/search/[keyword]'
import { getStaticProps as getKeywordPageProps } from '@/pages/search/[keyword]/page/[page]'
import { fetchGlobalAllData } from '@/lib/db/SiteDataApi'
import {
  getOrSetDataWithCache,
  getDataFromCache
} from '@/lib/cache/cache_manager'
import { fetchNotionPageBlocks } from '@/lib/db/notion/getPostBlocks'
import { fetchPageFromNotion } from '@/lib/db/notion/getNotionPost'
import { processPostData } from '@/lib/utils/post'
import { generateRss } from '@/lib/utils/rss'
import { Feed } from 'feed'
import { DynamicLayout } from '@/themes/theme'

jest.mock('@/blog.config', () => ({
  __esModule: true,
  default: {
    NOTION_PAGE_ID: 'synthetic-site',
    LANG: 'zh-CN',
    AUTHOR: 'Synthetic author',
    LINK: 'https://example.invalid',
    ENABLE_RSS: true,
    NEXT_REVALIDATE_SECOND: 60,
    ALGOLIA_APP_ID: '',
    THEME: 'synthetic'
  }
}))
jest.mock('@/lib/cache/cache_manager', () => ({
  getOrSetDataWithCache: jest.fn(),
  getDataFromCache: jest.fn()
}))
jest.mock('@/lib/db/notion/getPostBlocks', () => ({
  fetchInBatches: jest.fn(),
  fetchNotionPageBlocks: jest.fn(),
  formatNotionBlock: jest.fn(value => value),
  getPageBlockCacheKey: jest.fn(id => `synthetic_${id}`)
}))
jest.mock('@/lib/db/notion/getPageProperties', () => ({
  __esModule: true,
  default: jest.fn(),
  adjustPageProperties: jest.fn()
}))
jest.mock('@/lib/db/notion/getNotionAPI', () => ({
  __esModule: true,
  default: {}
}))
jest.mock('@/lib/db/notion/getNotionPost', () => ({
  fetchPageFromNotion: jest.fn()
}))
jest.mock('@/lib/db/notion/memberDataSource', () => ({
  fetchMembersFromOfficialAPI: jest.fn()
}))
jest.mock('@/lib/plugins/algolia', () => ({ uploadDataToAlgolia: jest.fn() }))
jest.mock('@/lib/utils/post', () => ({
  processPostData: jest.fn(),
  checkSlugHasNoSlash: jest.fn(),
  checkSlugHasOneSlash: jest.fn(),
  checkSlugHasMorThanTwoSlash: jest.fn()
}))
jest.mock('notion-utils', () => ({ idToUuid: value => value }))
jest.mock('@/lib/config', () => ({
  siteConfig: (key, fallback, config = {}) => config[key] ?? fallback,
  convertVal: value => value
}))
jest.mock('@/lib/db/notion/getPageContentText', () => ({
  getPageContentText: jest.fn(() => [])
}))
jest.mock('@/lib/db/notion/getPageTableOfContents', () => ({
  getPageTableOfContents: jest.fn(() => [])
}))
jest.mock('@/lib/global', () => ({
  useGlobal: () => ({
    locale: { COMMON: { ARTICLE_UNLOCK_TIPS: 'Synthetic unlocked' } }
  })
}))
jest.mock('@/components/Notification', () => ({
  __esModule: true,
  default: () => ({ showNotification: jest.fn(), Notification: () => null })
}))
jest.mock('@/components/TechGrow', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@/components/NotionPage', () => ({
  __esModule: true,
  default: jest.fn(({ post }) => <div>{JSON.stringify(post.blockMap)}</div>)
}))
jest.mock('@/themes/theme', () => ({
  DynamicLayout: jest.fn(() => <div>Ordinary layout</div>)
}))
jest.mock('@/lib/build/staticPaths', () => ({ getStaticPathsBase: jest.fn() }))
jest.mock('@/lib/plugins/mailEncrypt', () => ({ decryptEmail: () => '' }))
jest.mock('feed', () => ({ Feed: jest.fn() }))
jest.mock('p-limit', () => () => task => task())
jest.mock('fs', () => ({
  statSync: jest.fn(() => {
    throw new Error('Synthetic missing feed')
  }),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn()
}))

const PROTECTED = [
  ['185a18e7-c6be-80e2-ac8a-e3a9b38be389', 'video2025'],
  ['1a3a18e7-c6be-80f2-a606-f7e6f55ac045', '春季视频'],
  ['c340487b-971a-4b17-896b-9d62d91f79aa', 'videos'],
  ['c925f8c2-f6ec-4537-9b57-4210997b9e8c', 'lunwen'],
  ['f7ed1283-7712-44bc-b6d2-f4d950802c1d', 'organic']
]
const ORDINARY_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const BODY = 'SYNTHETIC_ROUTE_PRIVATE_BODY_48927'
const HEADING = 'SYNTHETIC_ROUTE_PRIVATE_HEADING_48927'
const PASSWORD = 'SYNTHETIC_ROUTE_PASSWORD_48927'
const HASH = 'SYNTHETIC_ROUTE_HASH_48927'
const RAW = 'SYNTHETIC_ROUTE_RAW_PROPERTY_48927'
const markers = [BODY, HEADING, PASSWORD, HASH, RAW]
const variants = id => [
  id,
  id.toUpperCase(),
  id.replace(/-/g, ''),
  id.replace(/-/g, '').toUpperCase()
]

function protectedFixture([id, slug] = PROTECTED[0]) {
  return {
    id,
    slug,
    title: `Public fixture title ${slug}`,
    summary: 'Public fixture summary',
    href: `/${slug}`,
    type: 'Post',
    status: 'Published',
    tags: ['public'],
    publishDay: '2026-01-01',
    publishDate: 1,
    lastEditedDate: 1,
    password: PASSWORD,
    passwordHash: HASH,
    hash: HASH,
    properties: { secret: RAW },
    rawProperties: { secret: RAW },
    content: [BODY],
    body: BODY,
    toc: [{ text: HEADING }],
    blockMap: {
      block: {
        [id]: {
          value: {
            id,
            type: 'page',
            properties: { password: RAW },
            content: ['private-child']
          }
        },
        'private-child': {
          value: {
            id: 'private-child',
            parent_id: id,
            type: 'text',
            properties: { title: [[BODY]] }
          }
        }
      }
    }
  }
}

function ordinaryFixture(overrides = {}) {
  return {
    id: ORDINARY_ID,
    title: 'Ordinary public title',
    slug: 'ordinary',
    summary: 'Ordinary public summary',
    status: 'Published',
    type: 'Post',
    publishDay: '2026-01-01',
    tags: [],
    blockMap: { block: {} },
    ...overrides
  }
}

function siteFixture(allPages = PROTECTED.map(protectedFixture)) {
  return {
    NOTION_CONFIG: { ENABLE_RSS: true },
    allPages,
    latestPosts: allPages,
    allNavPages: allPages,
    allLinkPages: allPages,
    customMenu: [{ title: 'Public menu', subMenus: allPages }],
    notice: null,
    siteInfo: { title: 'Synthetic site', link: 'https://example.invalid' }
  }
}

function useFixture(value) {
  getOrSetDataWithCache.mockImplementation(key => {
    if (!key.startsWith('global_data_'))
      throw new Error(`Unexpected cache read: ${key}`)
    return Promise.resolve(JSON.parse(JSON.stringify(value)))
  })
}

function expectSafeSerialization(props) {
  const nextData = {
    props: { pageProps: props },
    page: '/[prefix]',
    query: {},
    buildId: 'synthetic-build'
  }
  // Exercise Next.js's actual inline script escaping/serialization in addition
  // to the page-data JSON shape used for /_next/data requests.
  const nextScript = NextScript.getInlineScriptSource({
    __NEXT_DATA__: nextData,
    largePageDataBytes: Infinity
  })
  for (const serialized of [
    JSON.stringify({ pageProps: props, __N_SSG: true }),
    nextScript
  ]) {
    for (const marker of markers) expect(serialized).not.toContain(marker)
  }
  expect(props).not.toHaveProperty('allPages')
}

const ROUTES = [
  ['one-part', getOnePartProps, last => ({ prefix: last })],
  [
    'two-part arbitrary prefix',
    getTwoPartProps,
    last => ({ prefix: 'arbitrary-prefix', slug: last })
  ],
  [
    'catch-all arbitrary prefix',
    getManyPartProps,
    last => ({
      prefix: 'arbitrary-prefix',
      slug: '2026',
      suffix: ['10', '08', last]
    })
  ]
]

describe('protected bodies cannot enter article page payloads', () => {
  beforeEach(() => {
    useFixture(siteFixture())
    fetchNotionPageBlocks.mockResolvedValue({ block: {} })
    processPostData.mockResolvedValue(undefined)
    getDataFromCache.mockResolvedValue(null)
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  it.each(PROTECTED)(
    'resolves the public slug for %s without acquiring its body',
    async (id, slug) => {
      const result = await getOnePartProps({
        params: { prefix: slug },
        locale: 'zh-CN'
      })
      expect(result.notFound).toBe(false)
      expect(result.props.post).toMatchObject({
        id,
        slug,
        summary: 'Public fixture summary',
        bodyPaused: true
      })
      expectSafeSerialization(result.props)
      expect(fetchPageFromNotion).not.toHaveBeenCalled()
      expect(fetchNotionPageBlocks).not.toHaveBeenCalled()
      expect(processPostData).not.toHaveBeenCalled()
    }
  )

  it.each(ROUTES)(
    'blocks every known ID variant through the %s route with index metadata',
    async (_name, getProps, params) => {
      for (const [id] of PROTECTED) {
        for (const variant of variants(id)) {
          for (const locale of ['zh-CN', 'en-US']) {
            const result = await getProps({ params: params(variant), locale })
            expect(result.notFound).toBe(false)
            expect(result.props.post.bodyPaused).toBe(true)
            expectSafeSerialization(result.props)
          }
        }
      }
      expect(fetchPageFromNotion).not.toHaveBeenCalled()
      expect(fetchNotionPageBlocks).not.toHaveBeenCalled()
      expect(processPostData).not.toHaveBeenCalled()
      expect(global.fetch).not.toHaveBeenCalled()
    }
  )

  it.each(ROUTES)(
    'blocks missing-index known IDs through the %s route in both locales',
    async (_name, getProps, params) => {
      useFixture(siteFixture([]))
      for (const [id] of PROTECTED) {
        for (const variant of variants(id)) {
          for (const locale of ['zh-CN', 'en-US']) {
            const result = await getProps({ params: params(variant), locale })
            expect(result.notFound).toBe(false)
            expect(result.props.post.bodyPaused).toBe(true)
            expectSafeSerialization(result.props)
          }
        }
      }
      expect(fetchPageFromNotion).not.toHaveBeenCalled()
      expect(fetchNotionPageBlocks).not.toHaveBeenCalled()
      expect(processPostData).not.toHaveBeenCalled()
    }
  )

  it.each(ROUTES)(
    'quarantines indexed full slugs in the %s route',
    async (_name, getProps, params) => {
      const routeParams = params('protected-slug')
      const fullSlug = [
        routeParams.prefix,
        routeParams.slug,
        ...(routeParams.suffix || [])
      ]
        .filter(Boolean)
        .join('/')
      const post = { ...protectedFixture(), slug: fullSlug }
      useFixture(siteFixture([post]))
      const result = await getProps({ params: routeParams, locale: 'zh-CN' })
      expect(result.props.post).toMatchObject({
        id: post.id,
        slug: fullSlug,
        bodyPaused: true
      })
      expectSafeSerialization(result.props)
      expect(fetchPageFromNotion).not.toHaveBeenCalled()
      expect(fetchNotionPageBlocks).not.toHaveBeenCalled()
    }
  )

  it.each(['Published', 'Invisible'])(
    'retains direct routing and body processing for an ordinary %s post',
    async status => {
      const ordinary = ordinaryFixture({ status })
      useFixture(siteFixture([ordinary, ...PROTECTED.map(protectedFixture)]))
      const result = await getOnePartProps({
        params: { prefix: ordinary.slug },
        locale: 'zh-CN'
      })
      expect(result.notFound).toBe(false)
      expect(result.props.post.id).toBe(ORDINARY_ID)
      expect(result.props.post.bodyPaused).not.toBe(true)
      expect(result.props.post.blockMap).toBeDefined()
      expect(processPostData).toHaveBeenCalledTimes(1)
      expectSafeSerialization(result.props)
    }
  )

  it.each(ROUTES)(
    'retains the unknown UUID fallback for the %s route',
    async (_name, getProps, params) => {
      useFixture(siteFixture([]))
      fetchPageFromNotion.mockResolvedValue(ordinaryFixture())
      const result = await getProps({
        params: params(ORDINARY_ID),
        locale: 'en-US'
      })
      expect(fetchPageFromNotion).toHaveBeenCalledWith(ORDINARY_ID)
      expect(result.notFound).toBe(false)
      expect(result.props.post.id).toBe(ORDINARY_ID)
      expect(processPostData).toHaveBeenCalledTimes(1)
    }
  )

  it('retains a missing ordinary slug as not found', async () => {
    useFixture(siteFixture([]))
    const result = await getOnePartProps({
      params: { prefix: 'missing-ordinary-slug' },
      locale: 'zh-CN'
    })
    expect(result.notFound).toBe(true)
    expect(result.props.post).toBeNull()
    expect(fetchPageFromNotion).not.toHaveBeenCalled()
    expect(fetchNotionPageBlocks).not.toHaveBeenCalled()
  })

  it('keeps the pause signal in cached public lists after passwords are removed', async () => {
    const props = await fetchGlobalAllData({
      pageId: 'synthetic-site',
      locale: 'zh-CN',
      from: 'synthetic-list-test'
    })
    for (const collection of [
      'allPages',
      'latestPosts',
      'allNavPages',
      'allLinkPages'
    ]) {
      expect(props[collection]).toHaveLength(5)
      expect(props[collection].every(post => post.bodyPaused === true)).toBe(
        true
      )
    }
    for (const marker of markers)
      expect(JSON.stringify(props)).not.toContain(marker)
  })

  it.each([
    ['search', getSearchProps],
    ['keyword search', getKeywordProps],
    ['paginated keyword search', getKeywordPageProps]
  ])(
    'never emits protected body or credentials in %s data',
    async (_name, getProps) => {
      const result = await getProps({
        params: { keyword: 'Public', page: '1' },
        locale: 'zh-CN'
      })
      expectSafeSerialization(result.props)
      expect(fetchNotionPageBlocks).not.toHaveBeenCalled()
      // Full-text cache reads should not occur for paused posts, even though
      // their former password/hash fields are now absent.
      expect(getDataFromCache).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['homepage', getHomeProps],
    ['paginated list', getPaginatedProps]
  ])(
    'skips paused previews and sanitizes late-added blocks in the %s',
    async (_name, getProps) => {
      const fixture = siteFixture([
        ordinaryFixture(),
        ...PROTECTED.map(protectedFixture)
      ])
      fixture.NOTION_CONFIG = {
        ENABLE_RSS: true,
        POST_LIST_PREVIEW: true,
        POST_PREVIEW_MAX_COUNT: 12,
        POSTS_PER_PAGE: 20
      }
      useFixture(fixture)
      fetchNotionPageBlocks.mockResolvedValue({
        block: {
          ...protectedFixture().blockMap.block,
          [ORDINARY_ID]: {
            value: { id: ORDINARY_ID, type: 'page', content: ['public-text'] }
          },
          'public-text': {
            value: {
              id: 'public-text',
              parent_id: ORDINARY_ID,
              type: 'text',
              properties: { title: [['ordinary preview text']] }
            }
          }
        }
      })
      const result = await getProps({ params: { page: '1' }, locale: 'en-US' })
      expect(fetchNotionPageBlocks).toHaveBeenCalledTimes(1)
      expect(fetchNotionPageBlocks.mock.calls[0][0]).toBe(ORDINARY_ID)
      expectSafeSerialization(result.props)
      expect(JSON.stringify(result.props)).toContain('ordinary preview text')
      expect(result.props.posts.filter(post => post.bodyPaused)).toHaveLength(5)
    }
  )

  it('removes protected synced blocks before rendering ordinary RSS content', async () => {
    const items = []
    Feed.mockImplementation(() => ({
      addItem: item => items.push(item),
      rss2: () => '',
      atom1: () => '',
      json1: () => ''
    }))
    const protectedId = PROTECTED[0][0]
    const ordinary = ordinaryFixture({
      content: ['public-text', 'synced-reference']
    })
    fetchNotionPageBlocks.mockResolvedValue({
      block: {
        [ORDINARY_ID]: {
          value: { id: ORDINARY_ID, type: 'page', content: ordinary.content }
        },
        'public-text': {
          value: {
            id: 'public-text',
            parent_id: ORDINARY_ID,
            type: 'text',
            properties: { title: [['ordinary RSS body']] }
          }
        },
        'synced-reference': {
          value: {
            id: 'synced-reference',
            parent_id: ORDINARY_ID,
            type: 'transclusion_reference',
            format: { transclusion_reference_pointer: { id: 'private-sync' } }
          }
        },
        [protectedId]: {
          value: { id: protectedId, type: 'page', content: ['private-sync'] }
        },
        'private-sync': {
          value: {
            id: 'private-sync',
            parent_id: protectedId,
            type: 'transclusion_container',
            content: ['private-child']
          }
        },
        'private-child': {
          value: {
            id: 'private-child',
            parent_id: 'private-sync',
            type: 'text',
            properties: { title: [[BODY]] }
          }
        }
      }
    })
    await generateRss(siteFixture([ordinary]))
    expect(items).toHaveLength(1)
    expect(items[0].content).toContain('ordinary RSS body')
    for (const marker of markers) expect(items[0].content).not.toContain(marker)
    expect(fetchNotionPageBlocks).toHaveBeenCalledWith(
      ORDINARY_ID,
      'rss-content'
    )
  })

  it('excludes protected raw cache snippets from paginated search for an ordinary post', async () => {
    useFixture(siteFixture([ordinaryFixture()]))
    const protectedId = PROTECTED[0][0]
    // Legacy iteration treats this numeric text as an index into [summary, '2', BODY].
    // Without cache sanitization it selects BODY and incorrectly returns this post.
    getDataFromCache.mockResolvedValue({
      block: {
        [ORDINARY_ID]: {
          value: { id: ORDINARY_ID, type: 'page', content: ['public-text'] }
        },
        'public-text': {
          value: {
            id: 'public-text',
            parent_id: ORDINARY_ID,
            type: 'text',
            properties: { title: [['2']] }
          }
        },
        [protectedId]: {
          value: { id: protectedId, type: 'page', content: ['private-text'] }
        },
        'private-text': {
          value: {
            id: 'private-text',
            parent_id: protectedId,
            type: 'text',
            properties: { title: [[BODY]] }
          }
        }
      }
    })
    const result = await getKeywordPageProps({
      params: { keyword: BODY, page: '1' },
      locale: 'zh-CN'
    })
    expect(result.props.posts).toEqual([])
    expect(result.props.postCount).toBe(0)
    // The keyword itself is public request input, so inspect only result data.
    expect(JSON.stringify(result.props.posts)).not.toContain(BODY)
    expect(getDataFromCache).toHaveBeenCalledTimes(1)
    expect(fetchNotionPageBlocks).not.toHaveBeenCalled()
  })

  it('runs real Next.js SSG rendering with a data request and the real route getStaticProps', async () => {
    const { renderToHTML } = jest.requireActual('next/dist/server/render')
    const Document = jest.requireActual('next/document').default
    const App = ({ Component, pageProps }) => <Component {...pageProps} />
    App.getInitialProps = () => Promise.resolve({ pageProps: {} })
    App.origGetInitialProps = App.getInitialProps
    const id = PROTECTED[0][0].replace(/-/g, '').toUpperCase()
    const request = {
      url: `/_next/data/synthetic-build/${id}.json`,
      method: 'GET',
      headers: {}
    }
    const response = {
      finished: false,
      headersSent: false,
      getHeader: jest.fn(),
      setHeader: jest.fn()
    }
    const render = await renderToHTML(
      request,
      response,
      '/[prefix]',
      {},
      {
        Component: Slug,
        App,
        Document,
        getStaticProps: getOnePartProps,
        getStaticPaths: () =>
          Promise.resolve({ paths: [], fallback: 'blocking' }),
        params: { prefix: id },
        isNextDataRequest: true,
        buildManifest: {
          pages: { '/[prefix]': [], '/_app': [] },
          ampDevFiles: [],
          devFiles: [],
          polyfillFiles: [],
          lowPriorityFiles: [],
          rootMainFiles: []
        },
        reactLoadableManifest: {},
        pageConfig: {},
        assetPrefix: '',
        basePath: '',
        canonicalBase: '',
        locale: 'en-US',
        locales: ['zh-CN', 'en-US'],
        defaultLocale: 'zh-CN',
        experimental: {},
        supportsDynamicResponse: false,
        largePageDataBytes: Infinity
      },
      { buildId: 'synthetic-build' },
      { isFallback: false }
    )
    // For SSG, Next exposes the actual data-response payload in pageData;
    // the server's response cache uses that object for /_next/data requests.
    const pageData = render.metadata.pageData
    expect(pageData.__N_SSG).toBe(true)
    expect(pageData.pageProps.post.bodyPaused).toBe(true)
    expectSafeSerialization(pageData.pageProps)
    const html = await render.toUnchunkedString()
    expect(html).toContain('__NEXT_DATA__')
    expect(html).toContain('暂时停止')
    for (const marker of markers) expect(html).not.toContain(marker)
    expect(fetchPageFromNotion).not.toHaveBeenCalled()
    expect(fetchNotionPageBlocks).not.toHaveBeenCalled()
  })

  it('uses public summaries for RSS after protection credentials have been stripped', async () => {
    const items = []
    Feed.mockImplementation(() => ({
      addItem: item => items.push(item),
      rss2: () => '',
      atom1: () => '',
      json1: () => ''
    }))
    const props = await fetchGlobalAllData({
      pageId: 'synthetic-site',
      locale: 'zh-CN'
    })
    await generateRss(props)
    expect(items).toHaveLength(5)
    expect(items.every(item => item.content === 'Public fixture summary')).toBe(
      true
    )
    for (const marker of markers)
      expect(JSON.stringify(items)).not.toContain(marker)
    expect(fetchNotionPageBlocks).not.toHaveBeenCalled()
  })

  it('renders an explicit pause without forwarding an unlock flow or a body to the theme', () => {
    const html = renderToStaticMarkup(
      <Slug
        post={{
          id: PROTECTED[0][0],
          title: 'Public fixture title',
          bodyPaused: true
        }}
        NOTION_CONFIG={{}}
      />
    )
    expect(html).toMatch(/暂停|暂时停止|temporarily|paused/i)
    expect(html).not.toMatch(/type="password"/i)
    expect(DynamicLayout).not.toHaveBeenCalled()
    expect(global.localStorage.setItem.mock.calls).toHaveLength(0)
  })
})
