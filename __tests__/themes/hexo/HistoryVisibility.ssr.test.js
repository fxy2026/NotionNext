/** @jest-environment node */
import { renderToStaticMarkup } from 'react-dom/server'
import { LayoutBase } from '@/themes/hexo'
import { useGlobal } from '@/lib/global'
import { useRouter } from 'next/router'
import { siteConfig } from '@/lib/config'

jest.mock('@/lib/global', () => ({ useGlobal: jest.fn() }))
jest.mock('@/lib/config', () => ({ siteConfig: jest.fn() }))
jest.mock('@/lib/utils', () => ({
  isBrowser: typeof globalThis.document !== 'undefined'
}))
jest.mock('next/router', () => ({ useRouter: jest.fn() }))
jest.mock('next/dynamic', () => () => () => null)
jest.mock('@/themes/hexo/config', () => ({}))
jest.mock('@/themes/hexo/style', () => ({ Style: () => null }))
jest.mock('@/themes/hexo/components/PostHero', () => {
  return function MockPostHero({ post }) {
    return (
      <header id='article-header-cover'>
        <h1>{post.title}</h1>
      </header>
    )
  }
})
jest.mock('@/themes/hexo/components/Hero', () => {
  return function MockHero() {
    return (
      <header id='header'>
        <h1>Home</h1>
      </header>
    )
  }
})
jest.mock('@/themes/hexo/components/SideRight', () => {
  return function MockSidebar() {
    return <aside>Sidebar</aside>
  }
})
jest.mock('@/themes/hexo/components/ArticleLock', () => ({
  ArticleLock: () => null
}))
jest.mock('@/components/Comment', () => () => null)
jest.mock('@/components/Mark', () => () => null)
jest.mock('@/components/NotionPage', () => () => null)
jest.mock('@/components/ShareBar', () => () => null)
jest.mock('@/components/SmartLink', () => () => null)
jest.mock('@/themes/hexo/components/ArticleAdjacent', () => () => null)
jest.mock('@/themes/hexo/components/ArticleCopyright', () => () => null)
jest.mock('@/themes/hexo/components/ArticleRecommend', () => () => null)
jest.mock('@/themes/hexo/components/BlogPostArchive', () => () => null)
jest.mock('@/themes/hexo/components/BlogPostListPage', () => () => null)
jest.mock('@/themes/hexo/components/BlogPostListScroll', () => () => null)
jest.mock('@/themes/hexo/components/ButtonJumpToComment', () => () => null)
jest.mock('@/themes/hexo/components/ButtonRandomPostMini', () => () => null)
jest.mock('@/themes/hexo/components/Card', () => () => null)
jest.mock('@/themes/hexo/components/Footer', () => () => null)
jest.mock('@/themes/hexo/components/Header', () => () => null)
jest.mock('@/themes/hexo/components/RightFloatArea', () => () => null)
jest.mock('@/themes/hexo/components/SearchNav', () => () => null)
jest.mock('@/themes/hexo/components/SlotBar', () => () => null)
jest.mock('@/themes/hexo/components/TagItemMini', () => () => null)
jest.mock('@/themes/hexo/components/TocDrawer', () => () => null)
jest.mock('@/themes/hexo/components/TocDrawerButton', () => () => null)

beforeEach(() => {
  siteConfig.mockImplementation((key, fallback) => {
    if (key === 'LAYOUT_SIDEBAR_REVERSE') return 'false'
    if (key === 'HEXO_HOME_BANNER_ENABLE') return true
    return fallback
  })
  useGlobal.mockReturnValue({
    onLoading: false,
    fullWidth: false,
    locale: { COMMON: { LOADING_ARTICLE: 'Loading article' } }
  })
})

it.each([
  ['article', '/[prefix]/[slug]', { title: 'Public synthetic article' }],
  ['home', '/', undefined],
  ['search', '/search/[keyword]', undefined],
  ['archive', '/archive', undefined]
])(
  '%s ships visible core content before JavaScript runs',
  (_name, route, post) => {
    useRouter.mockReturnValue({ pathname: route, route, asPath: route })
    const markup = renderToStaticMarkup(
      <LayoutBase post={post}>
        <article id='article-wrapper'>Public synthetic content</article>
      </LayoutBase>
    )
    expect(markup).toContain('Public synthetic content')
    expect(markup).toContain('Sidebar')
    expect(markup).not.toMatch(/\bopacity-0\b/)
    expect(markup).not.toMatch(/\btranslate-y-16\b/)
    expect(markup).not.toContain('display:none')
  }
)
