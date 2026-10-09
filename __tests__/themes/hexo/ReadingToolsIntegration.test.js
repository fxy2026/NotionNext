import * as React from 'react'
import userEvent from '@testing-library/user-event'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import algoliasearch from 'algoliasearch'
import { useRouter } from 'next/router'

jest.doMock('react', () => React)
const mockImportGate = jest.fn()
const mockLoads = jest.fn()
const mockUpdateDarkMode = jest.fn()
jest.mock('@/themes/theme', () => ({ saveDarkModeToLocalStorage: jest.fn() }))
let mockSearchButton
jest.mock('next/dynamic', () => {
  const dynamic = jest.requireActual('next/dynamic').default
  return (loader, options) =>
    dynamic(() => {
      mockLoads()
      return mockImportGate().then(loader)
    }, options)
})
jest.mock('@/lib/config', () => ({
  siteConfig: key => {
    if (key === 'LAYOUT_SIDEBAR_REVERSE') return false
    if (key === 'ALGOLIA_APP_ID') return 'synthetic-app'
    if (key.startsWith('HEXO_WIDGET_')) return true
    return false
  }
}))
jest.mock('@/lib/global', () => ({
  useGlobal: () => ({
    isDarkMode: false,
    updateDarkMode: mockUpdateDarkMode,
    onLoading: false,
    fullWidth: false,
    tagOptions: [],
    locale: {
      NAV: { SEARCH: 'Search' },
      COMMON: { TABLE_OF_CONTENTS: '目录' },
      POST: { TOP: 'Back to top' }
    }
  })
}))
jest.mock('@/lib/utils', () => ({ isBrowser: true }))
jest.mock('notion-utils', () => ({ uuidToId: id => id.replace(/-/g, '') }))
jest.mock('lodash.throttle', () => jest.requireActual('@/lib/utils/throttle'), {
  virtual: true
})
jest.mock('@/themes/hexo/components/Progress', () => () => null)
jest.mock('next/router', () => ({ useRouter: jest.fn() }))
jest.mock('algoliasearch', () => jest.fn())
jest.mock('@/themes/hexo/config', () => ({}))
jest.mock('@/themes/hexo/style', () => ({ Style: () => null }))
jest.mock('@/themes/hexo/components/Header', () => {
  return function Header() {
    const SearchButton = mockSearchButton
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
jest.mock('@/themes/hexo/components/ButtonRandomPostMini', () => () => null)
jest.mock('@/themes/hexo/components/Card', () => () => null)
jest.mock('@/themes/hexo/components/Footer', () => () => null)
jest.mock('@/themes/hexo/components/Hero', () => () => null)
jest.mock('@/themes/hexo/components/PostHero', () => () => null)
jest.mock('@/themes/hexo/components/SideRight', () => () => null)
jest.mock('@/themes/hexo/components/SearchNav', () => () => null)
jest.mock('@/themes/hexo/components/SlotBar', () => () => null)
jest.mock('@/themes/hexo/components/TagItemMini', () => () => null)

let LayoutBase
let frames
let originalMatchMedia
let originalScrollTo
let desktop
let mediaListeners
let routeListeners
const post = {
  id: 'synthetic-coordination-post',
  toc: [
    {
      id: '11111111111111111111111111111111',
      text: 'First section',
      indentLevel: 0
    },
    {
      id: '22222222222222222222222222222222',
      text: 'Last section',
      indentLevel: 1
    }
  ]
}
function deferred() {
  let resolve
  let reject
  const promise = new Promise((success, failure) => {
    resolve = success
    reject = failure
  })
  return { promise, resolve, reject }
}
beforeEach(() => {
  jest.isolateModules(() => {
    LayoutBase = require('@/themes/hexo').LayoutBase
    mockSearchButton = require('@/themes/hexo/components/SearchButton').default
  })
  mockImportGate.mockReset().mockResolvedValue()
  mockLoads.mockClear()
  routeListeners = new Map()
  useRouter.mockReturnValue({
    pathname: '/[prefix]/[slug]',
    route: '/[prefix]/[slug]',
    asPath: '/article/synthetic',
    events: {
      on: jest.fn((name, handler) => {
        if (!routeListeners.has(name)) routeListeners.set(name, new Set())
        routeListeners.get(name).add(handler)
      }),
      off: jest.fn()
    }
  })
  algoliasearch.mockReturnValue({ initIndex: () => ({ search: jest.fn() }) })
  frames = new Map()
  let frameId = 0
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++frameId, callback)
    return frameId
  })
  jest
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation(id => frames.delete(id))
  jest.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}])
  originalScrollTo = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'scrollTo'
  )
  HTMLElement.prototype.scrollTo = jest.fn()
  Object.defineProperty(window, 'pageYOffset', {
    configurable: true,
    value: 300,
    writable: true
  })
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 490,
    writable: true
  })
  desktop = false
  mediaListeners = new Set()
  originalMatchMedia = window.matchMedia
  window.matchMedia = jest.fn(() => ({
    get matches() {
      return desktop
    },
    addEventListener: (_, handler) => mediaListeners.add(handler),
    removeEventListener: (_, handler) => mediaListeners.delete(handler)
  }))
})
afterEach(() => {
  window.matchMedia = originalMatchMedia
  window.pageYOffset = 0
  if (originalScrollTo)
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
  else delete HTMLElement.prototype.scrollTo
})
function fixture() {
  return render(
    <LayoutBase post={post}>
      <input aria-label='Outside input' />
      <div id={post.toc[0].id} className='notion-header-anchor'>
        <h2>First heading</h2>
      </div>
    </LayoutBase>
  )
}
function flushFrame() {
  const pending = [...frames.values()]
  frames.clear()
  act(() => pending.forEach(callback => callback(16)))
}
function openToc(flush = true) {
  if (launcher().getAttribute('aria-expanded') === 'false') openTools()
  const trigger = screen.getByRole('button', { name: '目录' })
  act(() => trigger.focus())
  fireEvent.click(trigger)
  if (flush) {
    flushFrame()
    flushFrame()
  }
  return trigger
}
function shortcut(target) {
  fireEvent.keyDown(target, {
    key: 'Control',
    code: 'ControlLeft',
    ctrlKey: true
  })
  fireEvent.keyDown(target, { key: 'k', code: 'KeyK', ctrlKey: true })
  fireEvent.keyUp(target, { key: 'k', code: 'KeyK', ctrlKey: true })
  fireEvent.keyUp(target, { key: 'Control', code: 'ControlLeft' })
}
function launcher() {
  return screen.getByRole('button', { name: '阅读工具' })
}
function actions() {
  return document.getElementById('hexo-reading-tools-actions')
}
function openTools() {
  const trigger = launcher()
  act(() => trigger.focus())
  fireEvent.click(trigger)
  return trigger
}
function expectTocClosed() {
  expect(document.getElementById('hexo-toc-drawer')).not.toBeVisible()
  expect(
    document.querySelector('[aria-controls="hexo-toc-drawer"]')
  ).toHaveAttribute('aria-expanded', 'false')
}
function resize(wide) {
  desktop = wide
  window.innerWidth = wide ? 1280 : 490
  act(() => [...mediaListeners].forEach(handler => handler({ matches: wide })))
}
async function resolveLoad(gate) {
  await act(async () => {
    gate.resolve()
    await gate.promise
  })
}
async function expectDialogBeforeFocus() {
  await waitFor(() =>
    expect(screen.getByRole('dialog', { name: '搜索' })).toBeInTheDocument()
  )
  expect(screen.getByRole('textbox', { name: '搜索关键词' })).not.toHaveFocus()
}

it.each([390, 490, 959])(
  'starts collapsed at %dpx without changing the reading column',
  width => {
    window.innerWidth = width
    fixture()
    expect(launcher()).toHaveAttribute('aria-expanded', 'false')
    expect(launcher()).toHaveClass('w-11', 'h-11', 'lg:hidden')
    expect(actions()).not.toBeVisible()
    expect(
      screen.queryByRole('button', { name: '目录' })
    ).not.toBeInTheDocument()
    expect(document.querySelector('.hexo-main-column')).toHaveClass(
      'w-full',
      'max-w-4xl'
    )
    expect(document.getElementById('hexo-reading-tools')).toHaveClass(
      'lg:bottom-12',
      'right-1'
    )
    expect(document.getElementById('hexo-reading-tools').className).toContain(
      'bottom-[max(0.25rem,env(safe-area-inset-bottom))]'
    )
  }
)

it('opens with Enter and closes with Escape, returning focus to the 44px launcher', async () => {
  const user = userEvent.setup()
  fixture()
  act(() => launcher().focus())
  await user.keyboard('{Enter}')
  const dark = screen.getByRole('button', { name: 'Dark Mode' })
  expect(dark).toHaveClass('w-11', 'h-11', 'lg:w-7', 'lg:h-7')
  expect(screen.getByRole('button', { name: '目录' })).toHaveClass(
    'w-11',
    'h-11'
  )
  act(() => dark.focus())
  await user.keyboard('{Escape}')
  expect(actions()).not.toBeVisible()
  expect(launcher()).toHaveFocus()
})

it('dismisses on outside pointer without moving focus away from the new target', () => {
  fixture()
  openTools()
  const input = screen.getByRole('textbox', { name: 'Outside input' })
  act(() => input.focus())
  fireEvent.pointerDown(input)
  expect(actions()).not.toBeVisible()
  expect(input).toHaveFocus()
})

it('runs the real keyboard dark-mode action and closes the tools', async () => {
  const user = userEvent.setup()
  fixture()
  openTools()
  act(() => screen.getByRole('button', { name: 'Dark Mode' }).focus())
  await user.keyboard(' ')
  expect(mockUpdateDarkMode).toHaveBeenCalledWith(true)
  expect(actions()).not.toBeVisible()
  expect(launcher()).toHaveFocus()
})

it('keeps the keyboard scroll-to-top return control visible at the top', async () => {
  const user = userEvent.setup()
  const scroll = jest.spyOn(window, 'scrollTo').mockImplementation(() => {})
  fixture()
  openTools()
  act(() => screen.getByRole('button', { name: 'Back to top' }).focus())
  await user.keyboard('{Enter}')
  expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  window.pageYOffset = 0
  fireEvent.scroll(window)
  flushFrame()
  expect(launcher()).toHaveFocus()
  expect(document.getElementById('hexo-reading-tools')).not.toHaveClass(
    'invisible'
  )
})

it('lets TOC Escape and backdrop restore its visible toggle, then a second Escape closes tools', () => {
  fixture()
  let trigger = openToc()
  fireEvent.keyDown(screen.getByRole('link', { name: 'First section' }), {
    key: 'Escape'
  })
  expectTocClosed()
  expect(trigger).toHaveFocus()
  expect(actions()).toBeVisible()
  trigger = openToc()
  fireEvent.pointerDown(document.getElementById('right-drawer-background'))
  fireEvent.click(document.getElementById('right-drawer-background'))
  expect(trigger).toHaveFocus()
  expect(actions()).toBeVisible()
  fireEvent.keyDown(trigger, { key: 'Escape' })
  expect(actions()).not.toBeVisible()
  expect(launcher()).toHaveFocus()
})

it('collapses both panels after a real TOC anchor while preserving native navigation and reading focus', () => {
  fixture()
  openToc()
  const link = screen.getByRole('link', { name: 'First section' })
  expect(fireEvent.click(link, { button: 0 })).toBe(true)
  expectTocClosed()
  expect(actions()).not.toBeVisible()
  expect(document.getElementById(post.toc[0].id)).toHaveFocus()
  expect(document.getElementById(post.toc[0].id)).toHaveAttribute(
    'tabindex',
    '-1'
  )
})

it('returns cancelled pending search from a TOC link to the visible compact launcher', async () => {
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  fixture()
  openToc()
  const link = screen.getByRole('link', { name: 'First section' })
  shortcut(link)
  expectTocClosed()
  expect(actions()).not.toBeVisible()
  fireEvent.keyDown(link, { key: 'Escape' })
  expect(launcher()).toHaveFocus()
  await resolveLoad(gate)
  flushFrame()
  flushFrame()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(launcher()).toHaveFocus()
})

it('returns ready search from a real tool action to the visible launcher', async () => {
  fixture()
  openTools()
  const dark = screen.getByRole('button', { name: 'Dark Mode' })
  act(() => dark.focus())
  shortcut(dark)
  await expectDialogBeforeFocus()
  expect(actions()).not.toBeVisible()
  fireEvent.keyDown(dark, { key: 'Escape' })
  flushFrame()
  flushFrame()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(launcher()).toHaveFocus()
})

it('does not steal newer focus after a cancelled pending search', async () => {
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  fixture()
  openToc(false)
  shortcut(screen.getByRole('button', { name: '目录' }))
  fireEvent.keyDown(document.activeElement, { key: 'Escape' })
  const input = screen.getByRole('textbox', { name: 'Outside input' })
  act(() => input.focus())
  await resolveLoad(gate)
  flushFrame()
  flushFrame()
  expect(input).toHaveFocus()
  expect(actions()).not.toBeVisible()
  expectTocClosed()
})

it('resets tools and TOC on route changes without changing native hash events', () => {
  fixture()
  openToc()
  const toolsExpanded = launcher().getAttribute('aria-expanded')
  act(() =>
    [...routeListeners.get('hashChangeStart')].forEach(handler =>
      handler('#section')
    )
  )
  expect(launcher()).toHaveAttribute('aria-expanded', toolsExpanded)
  act(() =>
    [...routeListeners.get('routeChangeStart')].forEach(handler =>
      handler('/article/new')
    )
  )
  expect(actions()).not.toBeVisible()
  expectTocClosed()
  expect(launcher()).toHaveAttribute('aria-expanded', 'false')
})

it('keeps desktop actions expanded and returns focused actions safely on a narrow resize', () => {
  desktop = true
  window.innerWidth = 1280
  fixture()
  expect(actions()).toBeVisible()
  expect(actions()).toHaveClass('lg:flex')
  const dark = screen.getByRole('button', { name: 'Dark Mode' })
  act(() => dark.focus())
  resize(false)
  expect(actions()).not.toBeVisible()
  expect(launcher()).toHaveFocus()
  resize(true)
  expect(actions()).toBeVisible()
  resize(false)
  expect(actions()).not.toBeVisible()
  expect(launcher()).toHaveAttribute('aria-expanded', 'false')
})

it('relays a focused mobile launcher to a visible desktop action', () => {
  fixture()
  act(() => launcher().focus())
  resize(true)
  expect(screen.getByRole('button', { name: 'Dark Mode' })).toHaveFocus()
})

it('collapsing over nonfocusable article text does not strand keyboard focus in hidden actions', () => {
  fixture()
  openTools()
  act(() => screen.getByRole('button', { name: 'Dark Mode' }).focus())
  fireEvent.pointerDown(document.getElementById(post.toc[0].id))
  expect(actions()).not.toBeVisible()
  expect(launcher()).toHaveFocus()
})

it.each([false, true])(
  'pins a top-of-page search return target across search focus, desktop resize=%s',
  async wide => {
    fixture()
    openTools()
    const dark = screen.getByRole('button', { name: 'Dark Mode' })
    act(() => dark.focus())
    window.pageYOffset = 0
    fireEvent.scroll(window)
    flushFrame()
    shortcut(dark)
    await expectDialogBeforeFocus()
    flushFrame()
    flushFrame()
    const input = screen.getByRole('textbox', { name: '搜索关键词' })
    expect(input).toHaveFocus()
    expect(document.getElementById('hexo-reading-tools')).not.toHaveClass(
      'invisible'
    )
    if (wide) resize(true)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(
      wide ? screen.getByRole('button', { name: 'Dark Mode' }) : launcher()
    ).toHaveFocus()
    expect(document.getElementById('hexo-reading-tools')).not.toHaveClass(
      'invisible'
    )
  }
)

it('closes TOC on an outside pointer without leaving focus in the hidden drawer', () => {
  fixture()
  openToc()
  fireEvent.pointerDown(document.getElementById(post.toc[0].id))
  expectTocClosed()
  expect(actions()).not.toBeVisible()
  expect(launcher()).toHaveFocus()
})

it('does not send desktop action focus to the hidden mobile launcher on a route reset', () => {
  desktop = true
  fixture()
  const dark = screen.getByRole('button', { name: 'Dark Mode' })
  act(() => dark.focus())
  act(() =>
    [...routeListeners.get('routeChangeStart')].forEach(handler =>
      handler('/article/new')
    )
  )
  expect(dark).toHaveFocus()
  expect(actions()).toBeVisible()
})

it('relays desktop-origin search to the mobile launcher after a narrow resize', async () => {
  desktop = true
  fixture()
  const dark = screen.getByRole('button', { name: 'Dark Mode' })
  act(() => dark.focus())
  shortcut(dark)
  await expectDialogBeforeFocus()
  flushFrame()
  flushFrame()
  const input = screen.getByRole('textbox', { name: '搜索关键词' })
  expect(input).toHaveFocus()
  resize(false)
  expect(actions()).not.toBeVisible()
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(launcher()).toHaveFocus()
  expect(document.getElementById('hexo-reading-tools')).not.toHaveClass(
    'invisible'
  )
})

it('preserves the original desktop search action when the viewport stays wide', async () => {
  desktop = true
  fixture()
  const top = screen.getByRole('button', { name: 'Back to top' })
  act(() => top.focus())
  shortcut(top)
  await expectDialogBeforeFocus()
  flushFrame()
  flushFrame()
  fireEvent.keyDown(screen.getByRole('textbox', { name: '搜索关键词' }), {
    key: 'Escape'
  })
  expect(top).toHaveFocus()
  expect(actions()).toBeVisible()
})
