import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRouter } from 'next/router'
import Header from '@/themes/hexo/components/Header'

// Match the production webpack alias; exercise the real shared throttle helper.
jest.mock('lodash.throttle', () => jest.requireActual('@/lib/utils/throttle'), {
  virtual: true
})
jest.mock('next/router', () => ({ useRouter: jest.fn() }))
jest.mock(
  '@/components/SmartLink',
  () =>
    function MockSmartLink({ children, href }) {
      return <a href={href}>{children}</a>
    }
)
jest.mock('@/lib/config', () => ({ siteConfig: () => false }))
jest.mock('@/lib/global', () => ({
  useGlobal: () => ({ locale: { NAV: { NAVIGATOR: '导航' } } })
}))
jest.mock(
  '@/themes/hexo/components/Logo',
  () =>
    function MockLogo() {
      return <span>FXY</span>
    }
)
jest.mock(
  '@/themes/hexo/components/SideBar',
  () =>
    function MockSideBar() {
      return (
        <nav>
          <a href='/archive'>归档</a>
          <a href='/tag'>标签</a>
        </nav>
      )
    }
)
jest.mock('@/themes/hexo/components/MenuListTop', () => ({
  MenuListTop: () => null
}))
jest.mock('@/themes/hexo/components/SearchDrawer', () => () => null)
jest.mock('@/themes/hexo/components/SearchButton', () => () => null)
jest.mock('@/themes/hexo/components/ButtonRandomPost', () => () => null)
jest.mock('@/themes/hexo/components/CategoryGroup', () => () => null)
jest.mock('@/themes/hexo/components/TagGroups', () => () => null)

let events
let resizeListener
let originalMatchMedia
beforeEach(() => {
  events = { on: jest.fn(), off: jest.fn() }
  useRouter.mockReturnValue({ events })
  jest.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}])
  originalMatchMedia = window.matchMedia
  window.matchMedia = jest.fn(() => ({
    matches: false,
    addEventListener: jest.fn((event, handler) => {
      resizeListener = handler
    }),
    removeEventListener: jest.fn()
  }))
})
afterEach(() => {
  window.matchMedia = originalMatchMedia
})

async function openMenu() {
  const trigger = screen.getByRole('button', { name: '导航' })
  trigger.focus()
  fireEvent.click(trigger)
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Close navigation' })
    ).toHaveFocus()
  )
  return trigger
}

describe('Hexo mobile navigation', () => {
  it('waits for the open state to paint before moving focus', () => {
    const frames = []
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback)
      return frames.length
    })
    render(<Header />)
    const trigger = screen.getByRole('button', { name: '导航' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: '导航' })
    expect(trigger).toHaveFocus()
    act(() => frames.shift()(0))
    expect(trigger).toHaveFocus()
    act(() => frames.shift()(16))
    expect(
      screen.getByRole('button', { name: 'Close navigation' })
    ).toHaveFocus()
  })

  it('cancels delayed entry focus if the drawer closes between frames', () => {
    let nextId = 0
    const frames = new Map()
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.set(++nextId, callback)
      return nextId
    })
    jest
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(id => frames.delete(id))
    render(<Header />)
    const trigger = screen.getByRole('button', { name: '导航' })
    trigger.focus()
    fireEvent.click(trigger)
    const first = frames.entries().next().value
    frames.delete(first[0])
    act(() => first[1](0))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(frames.size).toBe(0)
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('exposes an accessible button and moves focus into the drawer', async () => {
    render(<Header />)
    expect(screen.getByRole('button', { name: '导航' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    const trigger = await openMenu()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveAttribute('aria-controls', 'sidebar-drawer')
    expect(screen.getByRole('dialog', { name: '导航' })).toHaveAttribute(
      'aria-modal',
      'true'
    )
  })

  it('closes with Escape and restores focus on repeated opens', async () => {
    render(<Header />)
    for (let attempt = 0; attempt < 2; attempt++) {
      const trigger = await openMenu()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
    }
  })

  it('keeps forward and reverse tab focus inside the open drawer', async () => {
    render(<Header />)
    await openMenu()
    const first = screen.getByRole('button', { name: 'Close navigation' })
    const last = screen.getByRole('link', { name: '标签' })
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(first).toHaveFocus()
  })

  it('offers an in-dialog close button and restores focus after dismissal', async () => {
    render(<Header />)
    const trigger = await openMenu()
    const dialog = screen.getByRole('dialog', { name: '导航' })
    const close = screen.getByRole('button', { name: 'Close navigation' })
    expect(dialog).toContainElement(close)
    fireEvent.click(close)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on backdrop click and returns focus to its trigger', async () => {
    render(<Header />)
    const trigger = await openMenu()
    fireEvent.click(document.getElementById('sidebar-drawer-background'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes after navigation and unregisters its route listener', async () => {
    const { unmount } = render(<Header />)
    await openMenu()
    const routeListeners = events.on.mock.calls.filter(
      ([name]) => name === 'routeChangeComplete'
    )
    act(() => routeListeners.forEach(([, handler]) => handler()))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    unmount()
    for (const [name, handler] of routeListeners) {
      expect(events.off).toHaveBeenCalledWith(name, handler)
    }
  })

  it('releases the mobile dialog when resized to the desktop layout', async () => {
    render(<Header />)
    await openMenu()
    act(() => resizeListener({ matches: true }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
