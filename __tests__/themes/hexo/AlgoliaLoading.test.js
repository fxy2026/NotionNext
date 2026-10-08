import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { LayoutBase } from '@/themes/hexo'
import { useRouter } from 'next/router'
import BLOG from '@/blog.config'
import algoliasearch from 'algoliasearch'

// Use the real config resolver and next/dynamic boundary. Only the Algolia
// service is mocked: no test needs real keys, an index, or network requests.
let mockSnapshot = {}
const mockLoadModal = jest.fn()

jest.mock('@/blog.config', () => ({
  __esModule: true,
  default: {
    ALGOLIA_APP_ID: null,
    ALGOLIA_SEARCH_ONLY_APP_KEY: 'synthetic-public-search-key',
    ALGOLIA_INDEX: 'synthetic-index',
    LAYOUT_SIDEBAR_REVERSE: false,
    HEXO_HOME_BANNER_ENABLE: false
  }
}))
jest.mock('@/lib/global', () => ({
  getGlobalSnapshot: () => mockSnapshot,
  useGlobal: () => ({
    ...mockSnapshot,
    onLoading: false,
    fullWidth: false,
    locale: { NAV: { SEARCH: 'Search' } },
    tagOptions: []
  })
}))
jest.mock('@/lib/utils', () => ({
  isBrowser: true,
  isUrlLikePath: () => false
}))
jest.mock('next/router', () => ({ useRouter: jest.fn() }))
jest.mock('algoliasearch', () => jest.fn())
jest.mock('next/dynamic', () => {
  const dynamic = jest.requireActual('next/dynamic').default
  return (loader, options) =>
    dynamic(() => {
      mockLoadModal()
      return loader()
    }, options)
})
jest.mock('@/themes/hexo/config', () => ({}))
jest.mock('@/themes/hexo/style', () => ({ Style: () => null }))
jest.mock('@/themes/hexo/components/Header', () => {
  return function Header() {
    const SearchButton =
      require('@/themes/hexo/components/SearchButton').default
    return <SearchButton />
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
jest.mock('@/themes/hexo/components/Hero', () => () => null)
jest.mock('@/themes/hexo/components/PostHero', () => () => null)
jest.mock('@/themes/hexo/components/SideRight', () => () => null)
jest.mock('@/themes/hexo/components/RightFloatArea', () => () => null)
jest.mock('@/themes/hexo/components/SearchNav', () => () => null)
jest.mock('@/themes/hexo/components/SlotBar', () => () => null)
jest.mock('@/themes/hexo/components/TagItemMini', () => () => null)
jest.mock('@/themes/hexo/components/TocDrawer', () => () => null)
jest.mock('@/themes/hexo/components/TocDrawerButton', () => () => null)

let router
const renderLayout = () => (
  <LayoutBase>
    <p>Public synthetic content</p>
  </LayoutBase>
)

beforeEach(() => {
  mockSnapshot = {}
  BLOG.ALGOLIA_APP_ID = null
  router = {
    pathname: '/',
    route: '/',
    asPath: '/',
    push: jest.fn(),
    events: { on: jest.fn(), off: jest.fn() }
  }
  useRouter.mockReturnValue(router)
  algoliasearch.mockReturnValue({
    initIndex: jest.fn(() => ({ search: jest.fn() }))
  })
})

it.each([null, undefined, '', false, 0, 'false', '0'])(
  'does not load the module or initialize Algolia with app ID %s',
  async appId => {
    BLOG.ALGOLIA_APP_ID = appId
    const { container } = render(renderLayout())
    await act(async () => {})
    expect(mockLoadModal).not.toHaveBeenCalled()
    expect(algoliasearch).not.toHaveBeenCalled()
    expect(document.getElementById('search-wrapper')).not.toBeInTheDocument()
    expect(container).toHaveTextContent(/^Public synthetic content$/)
  }
)

it('keeps the existing local search route available without Algolia', async () => {
  render(renderLayout())
  await act(async () => {})
  const button = screen.getByRole('button', { name: 'Search' })
  expect(button).not.toHaveAttribute('aria-haspopup')
  fireEvent.click(button)
  expect(router.push).toHaveBeenCalledWith('/search')
  expect(algoliasearch).not.toHaveBeenCalled()
})

it.each(['blog', 'notion', 'theme', 'runtime'])(
  'loads and opens configured Algolia using the %s config source',
  async source => {
    if (source === 'blog') BLOG.ALGOLIA_APP_ID = 'synthetic-app'
    if (source === 'notion')
      mockSnapshot.NOTION_CONFIG = { ALGOLIA_APP_ID: 'synthetic-app' }
    if (source === 'theme')
      mockSnapshot.THEME_CONFIG = { ALGOLIA_APP_ID: 'synthetic-app' }
    if (source === 'runtime')
      mockSnapshot.runtimeConfigOverrides = { ALGOLIA_APP_ID: 'synthetic-app' }
    render(renderLayout())
    await act(async () => {})
    expect(algoliasearch).not.toHaveBeenCalled()
    const button = screen.getByRole('button', { name: 'Search' })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    fireEvent.click(button)
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: '搜索' })).toBeInTheDocument()
    )
    expect(algoliasearch).toHaveBeenCalledWith(
      'synthetic-app',
      'synthetic-public-search-key'
    )
    expect(router.push).not.toHaveBeenCalled()
  }
)

it('respects runtime disabling over configured Notion, theme and blog values', async () => {
  BLOG.ALGOLIA_APP_ID = 'synthetic-blog-app'
  mockSnapshot = {
    NOTION_CONFIG: { ALGOLIA_APP_ID: 'synthetic-notion-app' },
    THEME_CONFIG: { ALGOLIA_APP_ID: 'synthetic-theme-app' },
    runtimeConfigOverrides: { ALGOLIA_APP_ID: '' }
  }
  render(renderLayout())
  await act(async () => {})
  expect(algoliasearch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  expect(router.push).toHaveBeenCalledWith('/search')
})

it('mounts after runtime configuration arrives and unmounts when disabled', async () => {
  const { rerender } = render(renderLayout())
  await act(async () => {})
  expect(algoliasearch).not.toHaveBeenCalled()
  mockSnapshot.runtimeConfigOverrides = { ALGOLIA_APP_ID: 'runtime-app' }
  rerender(renderLayout())
  expect(algoliasearch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() =>
    expect(screen.getByRole('dialog', { name: '搜索' })).toBeInTheDocument()
  )
  algoliasearch.mockClear()
  mockSnapshot.runtimeConfigOverrides = { ALGOLIA_APP_ID: false }
  rerender(renderLayout())
  expect(document.getElementById('search-wrapper')).not.toBeInTheDocument()
  expect(algoliasearch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  expect(router.push).toHaveBeenCalledWith('/search')
})

it('uses the highest-priority configured value for both mounting and the client', async () => {
  BLOG.ALGOLIA_APP_ID = 'synthetic-blog-app'
  mockSnapshot = {
    NOTION_CONFIG: { ALGOLIA_APP_ID: 'synthetic-notion-app' },
    THEME_CONFIG: { ALGOLIA_APP_ID: 'synthetic-theme-app' },
    runtimeConfigOverrides: { ALGOLIA_APP_ID: 'synthetic-runtime-app' }
  }
  render(renderLayout())
  expect(algoliasearch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
  await waitFor(() => expect(algoliasearch).toHaveBeenCalled())
  expect(algoliasearch).toHaveBeenCalledWith(
    'synthetic-runtime-app',
    'synthetic-public-search-key'
  )
})
