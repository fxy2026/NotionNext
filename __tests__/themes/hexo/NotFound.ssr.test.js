/** @jest-environment node */
import { renderToStaticMarkup } from 'react-dom/server'
import { Layout404 } from '@/themes/hexo'
import { useGlobal } from '@/lib/global'
import { siteConfig } from '@/lib/config'
import enUS from '@/lib/lang/en-US'
import zhCN from '@/lib/lang/zh-CN'

jest.mock('@/lib/global', () => ({ useGlobal: jest.fn() }))
jest.mock('@/lib/config', () => ({ siteConfig: jest.fn() }))
jest.mock('@/lib/utils', () => ({
  isBrowser: typeof globalThis.document !== 'undefined'
}))
jest.mock('next/router', () => ({ useRouter: jest.fn() }))
jest.mock('next/dynamic', () => () => () => null)
jest.mock('@/themes/hexo/config', () => ({}))
jest.mock('@/themes/hexo/style', () => ({ Style: () => null }))
jest.mock('@/themes/hexo/components/PostHero', () => () => null)
jest.mock('@/themes/hexo/components/Hero', () => () => null)
jest.mock('@/themes/hexo/components/SideRight', () => () => null)
jest.mock('@/themes/hexo/components/ArticleLock', () => ({
  ArticleLock: () => null
}))
jest.mock('@/components/Comment', () => () => null)
jest.mock('@/components/Mark', () => () => null)
jest.mock('@/components/NotionPage', () => () => null)
jest.mock('@/components/ShareBar', () => () => null)
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

jest.mock('@/themes/hexo/components/ArticleSwitchPlaceholder', () => () => null)
jest.mock('@/themes/hexo/components/LazyAlgoliaSearchModal', () => () => null)

it.each([enUS, zhCN])(
  'ships the $LOCALE error and recovery links before JavaScript runs',
  locale => {
    useGlobal.mockReturnValue({ locale })
    siteConfig.mockImplementation(key =>
      key === 'LINK' ? 'https://example.com' : undefined
    )
    const markup = renderToStaticMarkup(<Layout404 />)
    expect(markup).toMatch(/<h1[^>]*>404<\/h1>/)
    expect(markup).toContain(locale.COMMON.NOT_FOUND)
    expect(markup).toContain(`href="/">${locale.NAV.INDEX}</a>`)
    expect(markup).toContain(`href="/search">${locale.NAV.SEARCH}</a>`)
    expect(markup).not.toMatch(/<script|http-equiv|display:none|opacity-0/)
  }
)
