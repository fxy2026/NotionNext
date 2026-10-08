import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import Catalog from '@/themes/hexo/components/Catalog'
import TocDrawer from '@/themes/hexo/components/TocDrawer'
import TocDrawerButton from '@/themes/hexo/components/TocDrawerButton'

jest.mock('@/lib/global', () => ({
  useGlobal: () => ({ locale: { COMMON: { TABLE_OF_CONTENTS: '目录' } } })
}))
jest.mock('@/lib/config', () => ({ siteConfig: () => true }))
// Keep this DOM behavior suite independent of notion-utils' ESM-only bundle.
jest.mock('notion-utils', () => ({ uuidToId: id => id.replace(/-/g, '') }))
jest.mock('lodash.throttle', () => jest.requireActual('@/lib/utils/throttle'), {
  virtual: true
})
jest.mock('@/themes/hexo/components/Progress', () => () => null)

const firstId = '11111111111111111111111111111111'
const lastId = '22222222222222222222222222222222'
const post = {
  id: 'synthetic-public-post',
  toc: [
    { id: firstId, text: 'First section', indentLevel: 0 },
    { id: lastId, text: 'Last section', indentLevel: 1 }
  ]
}

function Fixture({ currentPost = post, desktopCatalog = false }) {
  const [isOpen, setOpen] = useState(false)
  const triggerRef = useRef(null)
  return (
    <>
      <TocDrawerButton
        isOpen={isOpen}
        triggerRef={triggerRef}
        onClick={() => setOpen(open => !open)}
        onClose={() => setOpen(false)}
      />
      <TocDrawer
        post={currentPost}
        isOpen={isOpen}
        triggerRef={triggerRef}
        onClose={() => setOpen(false)}
      />
      <input aria-label='Search' />
      <h2 id={firstId}>First heading</h2>
      <h2 id={lastId}>Last heading</h2>
      {desktopCatalog && (
        <aside>
          <Catalog toc={currentPost.toc} />
        </aside>
      )}
    </>
  )
}

let frames
let desktop
let mediaListeners
let originalMatchMedia
let originalScrollTo

beforeEach(() => {
  window.history.replaceState(null, '', '/')
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
  desktop = false
  mediaListeners = new Set()
  originalMatchMedia = window.matchMedia
  window.matchMedia = jest.fn(query => ({
    get matches() {
      return desktop
    },
    media: query,
    addEventListener: (_, callback) => mediaListeners.add(callback),
    removeEventListener: (_, callback) => mediaListeners.delete(callback)
  }))
})

afterEach(() => {
  window.matchMedia = originalMatchMedia
  if (originalScrollTo) {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
  } else {
    delete HTMLElement.prototype.scrollTo
  }
})

function flushFrame() {
  const pending = [...frames.values()]
  frames.clear()
  act(() => pending.forEach(callback => callback(16)))
}

function openPanel({ flush = true } = {}) {
  const trigger = screen.getByRole('button', { name: '目录' })
  trigger.focus()
  fireEvent.click(trigger)
  if (flush) {
    flushFrame()
    flushFrame()
  }
  return trigger
}

function panel() {
  return document.getElementById('hexo-toc-drawer')
}

describe('Hexo mobile table of contents', () => {
  it('exposes its state and a 44px target while keeping the compact glyph', () => {
    render(<Fixture />)
    const trigger = screen.getByRole('button', { name: '目录' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-controls', panel().id)
    expect(trigger).toHaveClass('w-11', 'h-11')
    expect(trigger.querySelector('i')).toHaveClass('text-xs')
    expect(panel()).not.toBeVisible()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    openPanel()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: 'First section' })).toHaveFocus()
  })

  it('waits for paint before entering and cancels delayed focus on quick Escape', () => {
    render(<Fixture />)
    const trigger = openPanel({ flush: false })
    expect(trigger).toHaveFocus()
    flushFrame()
    expect(trigger).toHaveFocus()
    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(frames.size).toBe(0)
    expect(panel()).not.toBeVisible()
    flushFrame()
    expect(trigger).toHaveFocus()
  })

  it('dismisses repeated opens with Escape and returns focus without scrolling', () => {
    render(<Fixture />)
    for (let attempt = 0; attempt < 2; attempt++) {
      const trigger = openPanel()
      const focus = jest.spyOn(trigger, 'focus')
      fireEvent.keyDown(screen.getByRole('link', { name: 'First section' }), {
        key: 'Escape'
      })
      expect(panel()).not.toBeVisible()
      expect(trigger).toHaveFocus()
      expect(focus).toHaveBeenLastCalledWith({ preventScroll: true })
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(mediaListeners.size).toBe(0)
    }
  })

  it('keeps an unrelated search or navigation Escape out of the TOC handler', () => {
    render(<Fixture />)
    openPanel()
    const search = screen.getByRole('textbox', { name: 'Search' })
    search.focus()
    expect(fireEvent.keyDown(search, { key: 'Escape' })).toBe(true)
    expect(panel()).toBeVisible()
    expect(search).toHaveFocus()
    expect(fireEvent.keyDown(document, { key: 'Escape' })).toBe(true)
    expect(panel()).toBeVisible()
  })

  it('does not steal entry focus from a newer search interaction', () => {
    render(<Fixture />)
    openPanel({ flush: false })
    const search = screen.getByRole('textbox', { name: 'Search' })
    search.focus()
    flushFrame()
    flushFrame()
    expect(search).toHaveFocus()
  })

  it('does not propagate a handled Escape to other document key handlers', () => {
    render(<Fixture />)
    openPanel()
    const handler = jest.fn()
    document.addEventListener('keydown', handler)
    try {
      fireEvent.keyDown(screen.getByRole('link', { name: 'First section' }), {
        key: 'Escape'
      })
      expect(handler).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', handler)
    }
  })

  it('dismisses on backdrop click and restores the visible toggle', () => {
    render(<Fixture />)
    const trigger = openPanel()
    fireEvent.click(document.getElementById('right-drawer-background'))
    expect(panel()).not.toBeVisible()
    expect(trigger).toHaveFocus()
  })

  it('does not restore focus to a hidden trigger', () => {
    render(<Fixture />)
    const trigger = openPanel()
    jest.spyOn(trigger, 'getClientRects').mockReturnValue([])
    const focus = jest.spyOn(trigger, 'focus')
    fireEvent.keyDown(screen.getByRole('link', { name: 'First section' }), {
      key: 'Escape'
    })
    expect(focus).not.toHaveBeenCalled()
  })

  it.each([375, 500, 959])(
    'dismisses a valid anchor at a synthetic %ipx viewport without cancelling native navigation',
    width => {
      Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        value: width
      })
      desktop = width >= 960
      render(<Fixture />)
      openPanel()
      const heading = document.getElementById(lastId)
      const focus = jest.spyOn(heading, 'focus')
      const link = screen.getByRole('link', { name: 'Last section' })
      expect(fireEvent.click(link.querySelector('span'))).toBe(true)
      expect(panel()).not.toBeVisible()
      expect(heading).toHaveFocus()
      expect(focus).toHaveBeenCalledWith({ preventScroll: true })
      expect(link).toHaveAttribute('href', `#${lastId}`)
      expect(heading).toHaveAttribute('tabindex', '-1')
      screen.getByRole('textbox').focus()
      expect(heading).not.toHaveAttribute('tabindex')
    }
  )

  it('retains native hash updates after keyboard Enter and does not steal destination focus', async () => {
    const user = userEvent.setup()
    render(<Fixture />)
    openPanel()
    const heading = document.getElementById(firstId)
    await user.keyboard('{Enter}')
    await waitFor(() => expect(window.location.hash).toBe(`#${firstId}`))
    expect(panel()).not.toBeVisible()
    expect(heading).toHaveFocus()
    flushFrame()
    expect(heading).toHaveFocus()
  })

  it('preserves an existing destination tabindex', () => {
    render(<Fixture />)
    openPanel()
    const heading = document.getElementById(firstId)
    heading.setAttribute('tabindex', '0')
    fireEvent.click(screen.getByRole('link', { name: 'First section' }))
    screen.getByRole('textbox').focus()
    expect(heading).toHaveAttribute('tabindex', '0')
  })

  it.each(['ctrlKey', 'metaKey', 'shiftKey', 'altKey'])(
    'leaves modified %s anchor activation alone',
    modifier => {
      render(<Fixture />)
      openPanel()
      const link = screen.getByRole('link', { name: 'Last section' })
      expect(fireEvent.click(link, { [modifier]: true })).toBe(true)
      expect(panel()).toBeVisible()
      expect(document.getElementById(lastId)).not.toHaveFocus()
    }
  )

  it('leaves missing or malformed anchors open and never cancels their default event', () => {
    render(<Fixture />)
    openPanel()
    const link = screen.getByRole('link', { name: 'Last section' })
    for (const href of ['#missing', '#%E0%A4%A']) {
      link.setAttribute('href', href)
      expect(fireEvent.click(link)).toBe(true)
      expect(panel()).toBeVisible()
    }
  })

  it('keeps the existing long-list scroll container and every TOC entry', () => {
    const longPost = {
      ...post,
      toc: Array.from({ length: 100 }, (_, index) => ({
        id: index.toString(16).padStart(32, '0'),
        text: `Section ${index}`,
        indentLevel: index % 3
      }))
    }
    render(<Fixture currentPost={longPost} />)
    openPanel()
    expect(within(panel()).getAllByRole('link')).toHaveLength(100)
    expect(panel().querySelector('.hexo-catalog-scroll')).toHaveClass(
      'overflow-y-auto',
      'overscroll-none',
      'max-h-36',
      'lg:max-h-96'
    )
  })

  it('closes on article change without restoring stale reading focus', () => {
    const { rerender } = render(<Fixture />)
    const trigger = openPanel()
    const focus = jest.spyOn(trigger, 'focus')
    rerender(<Fixture currentPost={{ ...post, id: 'next-public-post' }} />)
    expect(panel()).not.toBeVisible()
    expect(focus).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
  })

  it('closes at the 960px desktop breakpoint without changing the persistent catalog', () => {
    const { container } = render(<Fixture desktopCatalog />)
    const trigger = openPanel()
    const focus = jest.spyOn(trigger, 'focus')
    desktop = true
    act(() => mediaListeners.forEach(handler => handler({ matches: true })))
    expect(panel()).not.toBeVisible()
    expect(focus).not.toHaveBeenCalled()
    const persistent = container.querySelector('aside')
    expect(within(persistent).getAllByRole('link')).toHaveLength(2)
    expect(
      fireEvent.click(
        within(persistent).getByRole('link', { name: 'Last section' })
      )
    ).toBe(true)
    expect(persistent).toBeVisible()
    expect(document.getElementById(lastId)).not.toHaveAttribute('tabindex')
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 960px)')
  })

  it('cancels focus frames and removes viewport listeners when unmounted', () => {
    const { unmount } = render(<Fixture />)
    openPanel({ flush: false })
    expect(frames.size).toBe(1)
    expect(mediaListeners.size).toBe(1)
    unmount()
    expect(frames.size).toBe(0)
    expect(mediaListeners.size).toBe(0)
  })
})
