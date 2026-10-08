/** @jest-environment node */

import SEO from '@/components/SEO'
import { siteConfig } from '@/lib/config'
import { HeadManagerContext } from 'next/dist/shared/lib/head-manager-context.shared-runtime'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

jest.unmock('next/head')
jest.unmock('next/router')
jest.mock('@/lib/config', () => ({ siteConfig: jest.fn() }))
jest.mock('@/lib/global', () => ({
  useGlobal: () => ({ locale: { NAV: { SEARCH: '搜索' } } })
}))
jest.mock('@/lib/utils', () => ({
  isHttpLink: value => /^https?:\/\//i.test(value),
  loadExternalResource: jest.fn()
}))

const siteUrl = 'https://example.com'
const siteInfo = {
  title: 'Example 博客',
  description: 'Search metadata regression fixture',
  pageCover: '/cover.png'
}
const robots =
  'follow, index, max-snippet:-1, max-image-preview:large, max-video-preview:-1'

const renderHead = ({ route, query = {}, ...props }) => {
  let head = []
  const headManager = {
    mountedInstances: new Set(),
    updateHead: elements => {
      head = elements
    }
  }

  renderToStaticMarkup(
    <HeadManagerContext.Provider value={headManager}>
      <RouterContext.Provider value={{ route, query, locale: 'zh-CN' }}>
        <SEO siteInfo={siteInfo} {...props} />
      </RouterContext.Provider>
    </HeadManagerContext.Provider>
  )

  // eslint-disable-next-line @next/next/no-head-element
  return renderToStaticMarkup(<head>{head}</head>)
}

const expectSearchHead = (html, { keyword = '', path }) => {
  const title = `${keyword ? `${keyword} | ` : ''}搜索 | ${siteInfo.title}`
  expect(html).toContain(`<title>${title}</title>`)
  expect(html).toContain(`<meta property="og:title" content="${title}"/>`)
  expect(html).toContain(`<meta name="twitter:title" content="${title}"/>`)
  expect(html).toContain(`<link rel="canonical" href="${siteUrl}/${path}"/>`)
  expect(html).toContain(
    `<meta property="og:url" content="${siteUrl}/${path}"/>`
  )
  expect(html).toContain(`<meta name="robots" content="${robots}"/>`)
}

beforeEach(() => {
  const config = {
    LINK: siteUrl,
    TITLE: siteInfo.title,
    AUTHOR: 'Example 作者',
    LANG: 'zh-CN',
    BLOG_FAVICON: '/favicon.ico'
  }
  siteConfig.mockImplementation((key, fallback) => config[key] ?? fallback)
})

describe('search metadata during real Next.js head collection', () => {
  it.each(['NotionNext', '中文 关键词', '100% # / ?'])(
    'preserves and encodes the dynamic route keyword: %s',
    keyword => {
      const html = renderHead({
        route: '/search/[keyword]',
        query: { keyword }
      })

      expectSearchHead(html, {
        keyword,
        path: `search/${encodeURIComponent(keyword)}`
      })
    }
  )

  it('uses the static page keyword before the router query is populated', () => {
    const html = renderHead({ route: '/search/[keyword]', keyword: '静态搜索' })

    expectSearchHead(html, {
      keyword: '静态搜索',
      path: `search/${encodeURIComponent('静态搜索')}`
    })
  })

  it('uses the keyword for the rendered result set and ignores an unrelated s query', () => {
    const html = renderHead({
      route: '/search/[keyword]',
      keyword: 'NotionNext',
      query: { keyword: 'old-result', s: 'unrelated-query' }
    })

    expectSearchHead(html, { keyword: 'NotionNext', path: 'search/NotionNext' })
  })

  it.each(['1', '2'])(
    'preserves the explicit paginated search path for page %s',
    page => {
      const html = renderHead({
        route: '/search/[keyword]/page/[page]',
        keyword: '中文',
        page
      })

      expectSearchHead(html, {
        keyword: '中文',
        path: `search/${encodeURIComponent('中文')}/page/${page}`
      })
    }
  )

  it('can read a paginated search path from the router during fallback', () => {
    const html = renderHead({
      route: '/search/[keyword]/page/[page]',
      query: { keyword: 'NotionNext', page: '3' }
    })

    expectSearchHead(html, {
      keyword: 'NotionNext',
      path: 'search/NotionNext/page/3'
    })
  })

  it('ignores a page query on the non-paginated search route', () => {
    const html = renderHead({
      route: '/search/[keyword]',
      query: { keyword: 'NotionNext', page: '2' }
    })

    expectSearchHead(html, { keyword: 'NotionNext', path: 'search/NotionNext' })
  })

  it('keeps the query-string search title and its existing canonical policy', () => {
    const html = renderHead({
      route: '/search',
      query: { s: '浏览器搜索', keyword: 'ignored' },
      keyword: 'also-ignored'
    })

    expectSearchHead(html, { keyword: '浏览器搜索', path: 'search' })
  })

  it('keeps the empty search landing page metadata', () => {
    expectSearchHead(renderHead({ route: '/search' }), { path: 'search' })
  })

  it('does not emit undefined for missing dynamic route parameters', () => {
    const html = renderHead({ route: '/search/[keyword]/page/[page]' })

    expectSearchHead(html, { path: 'search/' })
    expect(html).not.toContain('/undefined')
  })
})
