import * as React from 'react'
import userEvent from '@testing-library/user-event'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import algoliasearch from 'algoliasearch'
import { useRouter } from 'next/router'

jest.doMock('react', () => React)
const mockImportGate = jest.fn()
const mockLoads = jest.fn()
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
    if (key === 'HEXO_WIDGET_TOC') return true
    return false
  }
}))
jest.mock('@/lib/global', () => ({
  useGlobal: () => ({
    onLoading: false,
    fullWidth: false,
    tagOptions: [],
    locale: { NAV: { SEARCH: 'Search' }, COMMON: { TABLE_OF_CONTENTS: '目录' } }
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
jest.mock('@/themes/hexo/components/ButtonJumpToComment', () => () => null)
jest.mock('@/themes/hexo/components/ButtonRandomPostMini', () => () => null)
jest.mock('@/themes/hexo/components/Card', () => () => null)
jest.mock('@/themes/hexo/components/Footer', () => () => null)
jest.mock('@/themes/hexo/components/Hero', () => () => null)
jest.mock('@/themes/hexo/components/PostHero', () => () => null)
jest.mock('@/themes/hexo/components/SideRight', () => () => null)
jest.mock('@/themes/hexo/components/RightFloatArea', () => ({ floatSlot }) => (
  <div>{floatSlot}</div>
))
jest.mock('@/themes/hexo/components/SearchNav', () => () => null)
jest.mock('@/themes/hexo/components/SlotBar', () => () => null)
jest.mock('@/themes/hexo/components/TagItemMini', () => () => null)

let LayoutBase
let frames
let originalMatchMedia
let originalScrollTo
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
  useRouter.mockReturnValue({
    pathname: '/[prefix]/[slug]',
    route: '/[prefix]/[slug]',
    asPath: '/article/synthetic',
    events: { on: jest.fn(), off: jest.fn() }
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
  originalMatchMedia = window.matchMedia
  window.matchMedia = jest.fn(() => ({
    matches: false,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn()
  }))
})
afterEach(() => {
  window.matchMedia = originalMatchMedia
  if (originalScrollTo)
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
  else delete HTMLElement.prototype.scrollTo
})
function fixture() {
  return render(
    <LayoutBase post={post}>
      <input aria-label='Outside input' />
      <h2 id={post.toc[0].id}>First heading</h2>
    </LayoutBase>
  )
}
function flushFrame() {
  const pending = [...frames.values()]
  frames.clear()
  act(() => pending.forEach(callback => callback(16)))
}
function openToc(flush = true) {
  const trigger = screen.getByRole('button', { name: '目录' })
  trigger.focus()
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
function expectTocClosed() {
  expect(document.getElementById('hexo-toc-drawer')).not.toBeVisible()
  expect(screen.getByRole('button', { name: '目录' })).toHaveAttribute(
    'aria-expanded',
    'false'
  )
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

it('closes TOC on pending keyboard search intent, lets Escape cancel import, and restores its visible toggle', async () => {
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  fixture()
  const trigger = openToc()
  const link = screen.getByRole('link', { name: 'First section' })
  shortcut(link)
  expectTocClosed()
  expect(screen.getByRole('status')).toBeInTheDocument()
  expect(mockLoads).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(link, { key: 'Escape' })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  await resolveLoad(gate)
  flushFrame()
  flushFrame()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('lets the real search modal own Escape before its delayed entry focus and returns to a visible opener', async () => {
  fixture()
  const trigger = openToc()
  const link = screen.getByRole('link', { name: 'First section' })
  shortcut(link)
  await expectDialogBeforeFocus()
  expectTocClosed()
  fireEvent.keyDown(link, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  flushFrame()
  flushFrame()
  expect(trigger).toHaveFocus()
})

it('preserves an explicit search-button return target while closing TOC', async () => {
  fixture()
  openToc()
  const opener = screen.getByRole('button', { name: 'Search' })
  opener.focus()
  fireEvent.click(opener)
  await expectDialogBeforeFocus()
  expectTocClosed()
  fireEvent.keyDown(opener, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(opener).toHaveFocus()
})

it('cancels pending TOC entry focus when search starts from its toggle', async () => {
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  fixture()
  const trigger = openToc(false)
  shortcut(trigger)
  expectTocClosed()
  flushFrame()
  flushFrame()
  expect(trigger).toHaveFocus()
  await resolveLoad(gate)
  await expectDialogBeforeFocus()
  fireEvent.keyDown(trigger, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  flushFrame()
  flushFrame()
  expect(trigger).toHaveFocus()
})

it('keeps the original visible return target through repeated pending search intents', async () => {
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  fixture()
  const trigger = openToc()
  shortcut(screen.getByRole('link', { name: 'First section' }))
  const opener = screen.getByRole('button', { name: 'Search' })
  opener.focus()
  fireEvent.click(opener)
  expect(mockLoads).toHaveBeenCalledTimes(1)
  await resolveLoad(gate)
  await expectDialogBeforeFocus()
  fireEvent.keyDown(opener, { key: 'Escape' })
  expect(trigger).toHaveFocus()
  expectTocClosed()
})

it('keeps subsequent ready search opens mutually exclusive with the TOC', async () => {
  fixture()
  for (let attempt = 0; attempt < 2; attempt++) {
    const trigger = openToc()
    const link = screen.getByRole('link', { name: 'First section' })
    shortcut(link)
    await expectDialogBeforeFocus()
    expectTocClosed()
    fireEvent.keyDown(link, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  }
  expect(mockLoads).toHaveBeenCalledTimes(1)
})

it('does not replay cancelled search or TOC focus into a newer interaction', async () => {
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  fixture()
  const trigger = openToc(false)
  shortcut(trigger)
  fireEvent.keyDown(trigger, { key: 'Escape' })
  const input = screen.getByRole('textbox', { name: 'Outside input' })
  input.focus()
  await resolveLoad(gate)
  flushFrame()
  flushFrame()
  expect(input).toHaveFocus()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expectTocClosed()
})

it('cancels pending search when a newer TOC interaction opens, without restoring the stale search opener', async () => {
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  fixture()
  const searchOpener = screen.getByRole('button', { name: 'Search' })
  searchOpener.focus()
  fireEvent.click(searchOpener)
  expect(screen.getByRole('status')).toBeInTheDocument()
  const restore = jest.spyOn(searchOpener, 'focus')
  openToc()
  const link = screen.getByRole('link', { name: 'First section' })
  expect(link).toHaveFocus()
  expect(restore).not.toHaveBeenCalled()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  await resolveLoad(gate)
  flushFrame()
  flushFrame()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.getElementById('hexo-toc-drawer')).toBeVisible()
  expect(link).toHaveFocus()
  // A subsequent explicit search intent can still open the cached module.
  shortcut(link)
  await expectDialogBeforeFocus()
  expectTocClosed()
})

it('ignores a rejected old import after newer TOC intent without showing an error or stealing focus', async () => {
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  fixture()
  const opener = screen.getByRole('button', { name: 'Search' })
  opener.focus()
  fireEvent.click(opener)
  openToc()
  const link = screen.getByRole('link', { name: 'First section' })
  await act(async () => {
    gate.reject(new Error('Synthetic cancelled import failure'))
    await gate.promise.catch(() => {})
  })
  flushFrame()
  flushFrame()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(link).toHaveFocus()
  expect(document.getElementById('hexo-toc-drawer')).toBeVisible()
})

it.each(['{Enter}', ' '])(
  'lets newer TOC activation with %s dismiss ready search before search entry focus',
  async key => {
    const user = userEvent.setup()
    fixture()
    const trigger = openToc(false)
    shortcut(trigger)
    await expectDialogBeforeFocus()
    expect(trigger).toHaveFocus()
    await user.keyboard(key)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.getElementById('hexo-toc-drawer')).toBeVisible()
    flushFrame()
    flushFrame()
    const link = screen.getByRole('link', { name: 'First section' })
    expect(link).toHaveFocus()
    // Dismissal retains the loaded search component for a later explicit intent.
    shortcut(link)
    await expectDialogBeforeFocus()
    expectTocClosed()
    expect(mockLoads).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(link, { key: 'Escape' })
    expect(trigger).toHaveFocus()
  }
)
