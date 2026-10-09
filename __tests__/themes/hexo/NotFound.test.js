import React from 'react'
import userEvent from '@testing-library/user-event'
import { act, cleanup, render, screen } from '@testing-library/react'
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime'
import { Layout404 } from '@/themes/hexo'
import { useGlobal } from '@/lib/global'
import { useRouter } from 'next/router'
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

const missingPath = '/audit-nonexistent-page-20261009'
let router

function view() {
  return (
    <RouterContext.Provider value={router}>
      <Layout404 />
    </RouterContext.Provider>
  )
}

beforeEach(() => {
  jest.useFakeTimers()
  window.history.replaceState({}, '', missingPath)
  router = {
    pathname: '/404',
    route: '/404',
    asPath: missingPath,
    query: {},
    push: jest.fn().mockResolvedValue(true),
    replace: jest.fn().mockResolvedValue(true),
    back: jest.fn(),
    beforePopState: jest.fn(),
    prefetch: jest.fn().mockResolvedValue(undefined)
  }
  useRouter.mockReturnValue(router)
  useGlobal.mockReturnValue({ locale: enUS })
  siteConfig.mockImplementation((key, fallback) =>
    key === 'LINK' ? window.location.origin : fallback
  )
})

afterEach(() => {
  cleanup()
  jest.clearAllTimers()
  jest.useRealTimers()
})

it.each([enUS, zhCN])(
  'renders the error and localized, accessible recovery links for $LOCALE',
  locale => {
    useGlobal.mockReturnValue({ locale })
    render(view())
    expect(screen.getByRole('heading', { level: 1, name: '404' })).toBeVisible()
    expect(screen.getByText(locale.COMMON.NOT_FOUND)).toBeVisible()
    for (const [name, href] of [
      [locale.NAV.INDEX, '/'],
      [locale.NAV.SEARCH, '/search']
    ]) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveClass('min-h-11', 'focus-visible:outline-2')
      expect(link).not.toHaveAttribute('tabindex', '-1')
    }
  }
)

it('does not schedule navigation on initial render, repeated renders, or unmount', () => {
  const { rerender, unmount } = render(view())
  for (let cycle = 0; cycle < 4; cycle++) {
    rerender(view())
    expect(jest.getTimerCount()).toBe(0)
    act(() => jest.advanceTimersByTime(60000))
    expect(window.location.pathname).toBe(missingPath)
    expect(screen.getByText(enUS.COMMON.NOT_FOUND)).toBeVisible()
  }
  unmount()
  act(() => jest.advanceTimersByTime(60000))
  expect(router.push).not.toHaveBeenCalled()
  expect(router.replace).not.toHaveBeenCalled()
  expect(router.back).not.toHaveBeenCalled()
  expect(jest.getTimerCount()).toBe(0)
})

it.each([
  ['Home', '/', 1],
  ['Search', '/search', 2]
])('activates %s only after keyboard input', async (label, href, tabs) => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
  render(view())
  for (let tab = 0; tab < tabs; tab++) await user.tab()
  expect(screen.getByRole('link', { name: label })).toHaveFocus()
  expect(router.push).not.toHaveBeenCalled()
  await user.keyboard('{Enter}')
  expect(router.push).toHaveBeenCalledTimes(1)
  expect(router.push).toHaveBeenCalledWith(href, href, expect.any(Object))
})

it('keeps a newer navigation intact after leaving the error page quickly', () => {
  const { unmount } = render(view())
  act(() => jest.advanceTimersByTime(1000))
  unmount()
  window.history.pushState({}, '', '/article/synthetic-public-article')
  act(() => jest.advanceTimersByTime(60000))
  expect(window.location.pathname).toBe('/article/synthetic-public-article')
  expect(router.push).not.toHaveBeenCalled()
  expect(router.replace).not.toHaveBeenCalled()
})

it('does not trap repeated Back/Forward visits in a timed Home loop', async () => {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
  router.push.mockImplementation((_href, as) => {
    window.history.pushState({}, '', as)
    return Promise.resolve(true)
  })
  const originalHistoryLength = window.history.length
  let rendered = render(view())
  await user.click(screen.getByRole('link', { name: 'Home' }))
  rendered.unmount()
  expect(window.location.pathname).toBe('/')
  expect(window.history.length).toBe(originalHistoryLength + 1)

  for (let cycle = 0; cycle < 3; cycle++) {
    await act(async () => {
      window.history.back()
      await jest.advanceTimersByTimeAsync(100)
    })
    expect(window.location.pathname).toBe(missingPath)
    rendered = render(view())
    act(() => jest.advanceTimersByTime(60000))
    expect(window.location.pathname).toBe(missingPath)
    expect(screen.getByText(enUS.COMMON.NOT_FOUND)).toBeVisible()
    expect(window.history.length).toBe(originalHistoryLength + 1)
    rendered.unmount()

    await act(async () => {
      window.history.forward()
      await jest.advanceTimersByTimeAsync(100)
    })
    expect(window.location.pathname).toBe('/')
    act(() => jest.advanceTimersByTime(60000))
    expect(window.location.pathname).toBe('/')
  }
  expect(router.push).toHaveBeenCalledTimes(1)
})

it('preserves the existing SmartLink query behavior on explicit recovery', () => {
  window.history.replaceState({}, '', `${missingPath}?theme=hexo`)
  render(view())
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
    'href',
    '/?theme=hexo'
  )
  expect(screen.getByRole('link', { name: 'Search' })).toHaveAttribute(
    'href',
    '/search?theme=hexo'
  )
})
