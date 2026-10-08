/** @jest-environment node */

import SEO, { serializeJsonLd } from '@/components/SEO'
import { siteConfig } from '@/lib/config'
import { JSDOM } from 'jsdom'
import { HeadManagerContext } from 'next/dist/shared/lib/head-manager-context.shared-runtime'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'
import { renderToStaticMarkup } from 'react-dom/server'

// Exercise Next's actual server-side head collection, not jest.setup.js mocks.
jest.unmock('next/head')
jest.unmock('next/router')
jest.mock('@/lib/config', () => ({ siteConfig: jest.fn() }))
jest.mock('@/lib/global', () => ({ useGlobal: () => ({ locale: {} }) }))
jest.mock('@/lib/utils', () => ({
  isHttpLink: value => /^https?:\/\//i.test(value),
  loadExternalResource: jest.fn()
}))

const siteUrl = 'https://example.com'
const siteInfo = {
  title: 'Example 博客',
  description: 'English & 中文说明 🌍',
  icon: '/logo.png',
  pageCover: '/cover.png'
}

const renderHead = ({ post, locale = 'en-US', site = siteInfo }) => {
  let head = []
  const headManager = {
    mountedInstances: new Set(),
    updateHead: elements => {
      head = elements
    }
  }
  const router = {
    route: post ? '/[...slug]' : '/',
    query: {},
    locale
  }

  renderToStaticMarkup(
    <HeadManagerContext.Provider value={headManager}>
      <RouterContext.Provider value={router}>
        <SEO post={post} siteInfo={site} />
      </RouterContext.Provider>
    </HeadManagerContext.Provider>
  )

  // Serialize the collected server head as an HTML document fragment.
  // eslint-disable-next-line @next/next/no-head-element
  return renderToStaticMarkup(<head>{head}</head>)
}

const readJsonLd = html => {
  // Parse only: jsdom does not execute scripts or load subresources by default.
  const dom = new JSDOM(html)
  try {
    const { document } = dom.window
    const scripts = document.querySelectorAll('script')
    expect(scripts).toHaveLength(1)
    expect(scripts[0].type).toBe('application/ld+json')
    expect(scripts[0].parentElement).toBe(document.head)
    // No HTML opening delimiter may remain anywhere inside the JSON-LD.
    expect(scripts[0].textContent).not.toContain('<')
    return JSON.parse(scripts[0].textContent)
  } finally {
    dom.window.close()
  }
}

beforeEach(() => {
  const config = {
    LINK: siteUrl,
    TITLE: siteInfo.title,
    AUTHOR: 'Example 作者',
    KEYWORDS: 'notion, seo',
    LANG: 'zh-CN',
    BLOG_FAVICON: '/favicon.ico'
  }
  siteConfig.mockImplementation((key, fallback) => config[key] ?? fallback)
})

describe('SEO JSON-LD serialization', () => {
  it('escapes every less-than sign and preserves JSON values and Unicode', () => {
    const data = {
      '<key>': '</script><script>void 0</script>',
      text: 'English 中文 🧪 café e\u0301 & > " \\ \n \t \u2028 \u2029',
      literalEscape: '\\u003c',
      nested: [{ value: '<!--<script>text</script>-->' }, null, true, 42]
    }
    const serialized = serializeJsonLd(data)

    expect(serialized).not.toContain('<')
    expect(serialized).toContain('\\u003c')
    expect(serialized).toContain('中文 🧪 café')
    expect(serialized).toContain('& >')
    expect(JSON.parse(serialized)).toEqual(data)
  })

  it.each(['en-US', 'zh-CN'])(
    'preserves %s article structured data, metadata and canonical URL during SSR',
    locale => {
      const post = {
        type: 'Post',
        title: 'English & 中文文章 🌍',
        summary: 'A < B, C > D & café',
        slug: `${locale}/article`,
        category: ['Engineering 技术'],
        tags: ['notion', '中文'],
        publishDate: '2026-07-01T00:00:00.000Z',
        lastEditedTime: '2026-07-02T00:00:00.000Z',
        pageCoverThumbnail: '/article.png'
      }
      const html = renderHead({ post, locale })
      const data = readJsonLd(html)
      const canonical = `${siteUrl}/${locale}/article`

      expect(html).toContain(`<link rel="canonical" href="${canonical}"/>`)
      expect(html).toContain(`content="${locale}"`)
      expect(html).toContain(`content="${locale.replace('-', '_')}"`)
      expect(data).toEqual({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: `${post.title} | ${siteInfo.title}`,
        description: post.summary,
        image: `${siteUrl}/article.png`,
        url: canonical,
        datePublished: post.publishDate,
        dateModified: post.lastEditedTime,
        author: { '@type': 'Person', name: 'Example 作者' },
        publisher: {
          '@type': 'Organization',
          name: siteInfo.title,
          logo: { '@type': 'ImageObject', url: `${siteUrl}/logo.png` }
        },
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
        keywords: 'notion, 中文',
        articleSection: 'Engineering 技术'
      })
    }
  )

  it.each(['en-US', 'zh-CN'])(
    'preserves %s website structured data and canonical URL during SSR',
    locale => {
      const html = renderHead({ locale })
      const data = readJsonLd(html)

      expect(html).toContain(`<link rel="canonical" href="${siteUrl}"/>`)
      expect(data).toEqual({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: siteInfo.title,
        description: siteInfo.description,
        url: siteUrl,
        author: { '@type': 'Person', name: 'Example 作者' },
        publisher: {
          '@type': 'Organization',
          name: siteInfo.title,
          logo: { '@type': 'ImageObject', url: `${siteUrl}/logo.png` }
        }
      })
    }
  )

  it.each([
    '</script><script data-jsonld-probe="true">void 0</script>',
    '</ScRiPt ><span data-jsonld-probe="true">中文 🧪</span>',
    '</script\t\n bar><span data-jsonld-probe="true">中文</span>',
    '<!--<script>English & 中文</script>-->'
  ])('keeps HTML-like article text inside one JSON-LD script: %s', text => {
    const post = {
      type: 'Post',
      title: text,
      summary: text,
      slug: 'article',
      tags: [text],
      category: [text]
    }
    const data = readJsonLd(renderHead({ post }))

    expect(data.headline).toBe(`${text} | ${siteInfo.title}`)
    expect(data.description).toBe(text)
    expect(data.keywords).toBe(text)
    expect(data.articleSection).toBe(text)
  })

  it('keeps HTML-like site information inside one JSON-LD script', () => {
    const text = '</script><script data-jsonld-probe="true">void 0</script>'
    const site = { ...siteInfo, title: text, description: text }
    const data = readJsonLd(renderHead({ site, locale: 'zh-CN' }))

    expect(data.name).toBe(text)
    expect(data.description).toBe(text)
    expect(data.publisher.name).toBe(text)
  })
})
