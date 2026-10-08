import { act, cleanup, render, screen } from '@testing-library/react'
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

const post = { title: 'Public synthetic article' }
const frameCallbacks = new Map()
let frameId = 0
let originalRAF
let originalCancelRAF

function articleLayout() {
  return (
    <LayoutBase post={post}>
      <article id='article-wrapper'>Public synthetic content</article>
    </LayoutBase>
  )
}
function expectCoreVisible(container) {
  const hero = container.querySelector('#article-header-cover').parentElement
  const main = container.querySelector('#article-wrapper').parentElement
  for (const wrapper of [hero, main]) {
    expect(wrapper).not.toHaveClass('opacity-0')
    expect(wrapper).not.toHaveClass('translate-y-16')
    expect(wrapper).not.toHaveClass('-translate-y-16')
    expect(wrapper).not.toHaveAttribute('hidden')
    expect(wrapper).toBeVisible()
  }
}

beforeEach(() => {
  siteConfig.mockImplementation((key, fallback) => {
    if (key === 'LAYOUT_SIDEBAR_REVERSE') return 'false'
    if (key === 'HEXO_HOME_BANNER_ENABLE') return true
    return fallback
  })
  originalRAF = window.requestAnimationFrame
  originalCancelRAF = window.cancelAnimationFrame
  // Deliberately hold animation frames to model interrupted/suspended startup.
  window.requestAnimationFrame = callback => {
    frameCallbacks.set(++frameId, callback)
    return frameId
  }
  window.cancelAnimationFrame = id => frameCallbacks.delete(id)
  useGlobal.mockReturnValue({
    onLoading: false,
    fullWidth: false,
    locale: { COMMON: { LOADING_ARTICLE: 'Loading article' } }
  })
  useRouter.mockReturnValue({
    pathname: '/[prefix]/[slug]',
    route: '/[prefix]/[slug]',
    asPath: '/article/synthetic'
  })
})
afterEach(() => {
  cleanup()
  frameCallbacks.clear()
  window.requestAnimationFrame = originalRAF
  window.cancelAnimationFrame = originalCancelRAF
})

it('keeps hero and article readable when startup animation frames do not run', () => {
  const { container } = render(articleLayout())
  expectCoreVisible(container)
})

it('does not depend on animation frames after a persisted pageshow', () => {
  const { container } = render(articleLayout())
  const pageShow = new Event('pageshow')
  Object.defineProperty(pageShow, 'persisted', { value: true })
  act(() => window.dispatchEvent(pageShow))
  expectCoreVisible(container)
  expect(screen.getByText('Sidebar')).toBeVisible()
})

it('keeps full-width article content visible', () => {
  useGlobal.mockReturnValue({ onLoading: false, fullWidth: true })
  const { container } = render(articleLayout())
  expectCoreVisible(container)
  expect(container.querySelector('#theme-hexo')).toHaveAttribute(
    'data-full-width',
    'true'
  )
})

it('still shows the existing article placeholder during a route load', () => {
  useGlobal.mockReturnValue({
    onLoading: true,
    fullWidth: false,
    locale: { COMMON: { LOADING_ARTICLE: 'Loading article' } }
  })
  render(articleLayout())
  expect(screen.getByText('Loading article')).toBeVisible()
  expect(screen.queryByText('Public synthetic content')).not.toBeInTheDocument()
})

async function finishFrames() {
  // Headless UI schedules two frames plus promise-based nesting callbacks.
  for (let step = 0; step < 12; step++) {
    await act(async () => {
      const callbacks = [...frameCallbacks.values()]
      frameCallbacks.clear()
      callbacks.forEach(callback => callback(step * 16))
      await Promise.resolve()
    })
  }
}

it('finishes normal article route loading without losing the existing placeholder', async () => {
  const { container, rerender } = render(articleLayout())
  useGlobal.mockReturnValue({
    onLoading: true,
    fullWidth: false,
    locale: { COMMON: { LOADING_ARTICLE: 'Loading article' } }
  })
  rerender(articleLayout())
  expect(screen.getByText('Loading article')).toBeVisible()
  await finishFrames()
  useGlobal.mockReturnValue({
    onLoading: false,
    fullWidth: false,
    locale: { COMMON: { LOADING_ARTICLE: 'Loading article' } }
  })
  rerender(articleLayout())
  await finishFrames()
  expect(screen.queryByText('Loading article')).not.toBeInTheDocument()
  expectCoreVisible(container)
})

it('recovers from a canceled article navigation and repeated route-loading cycles', async () => {
  const { container, rerender } = render(articleLayout())
  for (let attempt = 0; attempt < 3; attempt++) {
    useGlobal.mockReturnValue({
      onLoading: true,
      fullWidth: false,
      locale: { COMMON: { LOADING_ARTICLE: 'Loading article' } }
    })
    rerender(articleLayout())
    useGlobal.mockReturnValue({
      onLoading: false,
      fullWidth: false,
      locale: { COMMON: { LOADING_ARTICLE: 'Loading article' } }
    })
    rerender(articleLayout())
    await finishFrames()
    expectCoreVisible(container)
  }
})

it.each([true, false])(
  'initial content remains readable with reduced motion=%s',
  reduced => {
    const originalMatchMedia = window.matchMedia
    window.matchMedia = jest.fn(() => ({ matches: reduced }))
    try {
      const { container } = render(articleLayout())
      expectCoreVisible(container)
    } finally {
      window.matchMedia = originalMatchMedia
    }
  }
)
