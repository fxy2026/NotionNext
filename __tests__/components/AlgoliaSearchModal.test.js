import { createRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AlgoliaSearchModal from '@/components/AlgoliaSearchModal'
import SearchButton from '@/themes/hexo/components/SearchButton'
import { siteConfig } from '@/lib/config'
import { useRouter } from 'next/router'
import { useHexoGlobal } from '@/themes/hexo'
import algoliasearch from 'algoliasearch'
import NextSearchInput from '@/themes/next/components/SearchInput'
import { useNextGlobal } from '@/themes/next'

jest.mock('@/lib/config', () => ({ siteConfig: jest.fn() }))
jest.mock('@/lib/global', () => ({
  useGlobal: () => ({
    locale: {
      NAV: { SEARCH: '搜索' },
      SEARCH: { ARTICLES: 'Next theme search', TAGS: 'Tags' }
    },
    tagOptions: [{ name: '生活' }, { name: '随笔' }]
  })
}))
jest.mock('next/router', () => ({ useRouter: jest.fn() }))
jest.mock('@/themes/hexo', () => ({ useHexoGlobal: jest.fn() }))
jest.mock('@/themes/next', () => ({ useNextGlobal: jest.fn() }))
jest.mock('algoliasearch', () => jest.fn())
jest.mock('@/components/Mark', () => jest.fn())
jest.mock(
  '@/components/SmartLink',
  () =>
    function MockSmartLink({ href, children }) {
      return <a href={href}>{children}</a>
    }
)

let modalRef
let router
let search
let user

beforeEach(() => {
  jest.useFakeTimers()
  modalRef = createRef()
  router = {
    asPath: '/',
    push: jest.fn(),
    events: { on: jest.fn(), off: jest.fn() }
  }
  useRouter.mockReturnValue(router)
  useHexoGlobal.mockReturnValue({ searchModal: modalRef })
  useNextGlobal.mockReturnValue({ searchModal: modalRef })
  siteConfig.mockImplementation(key => {
    if (key === 'ALGOLIA_APP_ID') return 'test-app'
    if (key === 'SUB_PATH') return '/blog'
    return 'test'
  })
  search = jest.fn().mockResolvedValue({
    hits: [
      { objectID: 'first', slug: 'first-post', title: 'First result' },
      { objectID: 'second', title: 'Second result' }
    ],
    nbHits: 2,
    nbPages: 2,
    processingTimeMS: 1
  })
  algoliasearch.mockReturnValue({ initIndex: () => ({ search }) })
  jest.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}])
  user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime })
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

function Fixture({ showModal = true }) {
  return (
    <>
      <a href='#outside'>Outside</a>
      <SearchButton />
      {showModal && <AlgoliaSearchModal cRef={modalRef} />}
    </>
  )
}

async function openSearch() {
  const trigger = screen.getByRole('button', { name: '搜索' })
  trigger.focus()
  await user.keyboard('{Enter}')
  act(() => jest.advanceTimersByTime(100))
  expect(screen.getByRole('textbox', { name: '搜索关键词' })).toHaveFocus()
  return trigger
}

async function populateResults() {
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'result' } })
  await act(async () => {
    jest.advanceTimersByTime(801)
    await Promise.resolve()
  })
}

function controlAnimationFrames() {
  let nextId = 0
  let time = 0
  const frames = new Map()
  jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++nextId, callback)
    return nextId
  })
  jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => {
    frames.delete(id)
  })
  return {
    frames,
    advance() {
      const scheduled = [...frames.values()]
      frames.clear()
      time += 16
      act(() => scheduled.forEach(callback => callback(time)))
    }
  }
}

describe('Algolia search keyboard accessibility', () => {
  it('waits for a painted frame before focus enters, without transitioning visibility', () => {
    const animation = controlAnimationFrames()
    render(<Fixture />)
    const trigger = screen.getByRole('button', { name: '搜索' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: '搜索' })
    expect(dialog).toHaveClass(
      'visible',
      'transition-[opacity,transform,border-color]'
    )
    expect(dialog).not.toHaveClass('transition-all', 'invisible')
    expect(trigger).toHaveFocus()
    animation.advance()
    expect(trigger).toHaveFocus()
    expect(animation.frames.size).toBe(1)
    animation.advance()
    expect(screen.getByRole('textbox')).toHaveFocus()
    expect(animation.frames.size).toBe(0)
  })

  it('cancels the first entry frame when immediately dismissed', () => {
    const animation = controlAnimationFrames()
    render(<Fixture />)
    const trigger = screen.getByRole('button', { name: '搜索' })
    trigger.focus()
    fireEvent.click(trigger)
    expect(animation.frames.size).toBe(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(animation.frames.size).toBe(0)
    animation.advance()
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each(['Escape', 'backdrop', 'navigation', 'unmount'])(
    'cancels delayed focus when %s closes the dialog between frames',
    dismissal => {
      const animation = controlAnimationFrames()
      const { rerender } = render(<Fixture />)
      const trigger = screen.getByRole('button', { name: '搜索' })
      trigger.focus()
      fireEvent.click(trigger)
      animation.advance()
      expect(animation.frames.size).toBe(1)
      if (dismissal === 'Escape') {
        fireEvent.keyDown(document, { key: 'Escape' })
      } else if (dismissal === 'backdrop') {
        fireEvent.click(document.getElementById('algolia-search-backdrop'))
      } else if (dismissal === 'navigation') {
        const [, closeOnNavigation] = router.events.on.mock.calls.find(
          ([name]) => name === 'routeChangeComplete'
        )
        act(() => closeOnNavigation('/tag/生活'))
      } else {
        rerender(<Fixture showModal={false} />)
      }
      expect(animation.frames.size).toBe(0)
      animation.advance()
      expect(trigger).toHaveFocus()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    }
  )

  it('gives a rapid close/reopen its own two frames without stale focus work', () => {
    const animation = controlAnimationFrames()
    render(<Fixture />)
    const trigger = screen.getByRole('button', { name: '搜索' })
    trigger.focus()
    fireEvent.click(trigger)
    animation.advance()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(animation.frames.size).toBe(0)
    fireEvent.click(trigger)
    expect(animation.frames.size).toBe(1)
    animation.advance()
    expect(trigger).toHaveFocus()
    animation.advance()
    expect(screen.getByRole('textbox')).toHaveFocus()
    expect(animation.frames.size).toBe(0)
  })

  it.each([0, 1])(
    'keeps Next-theme search closed when dismissed after %i entry frames',
    frameCount => {
      const animation = controlAnimationFrames()
      render(
        <>
          <NextSearchInput />
          <AlgoliaSearchModal cRef={modalRef} />
        </>
      )
      const trigger = screen.getByPlaceholderText('Next theme search')
      act(() => trigger.focus())
      for (let i = 0; i < frameCount; i++) animation.advance()
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(animation.frames.size).toBe(0)
      animation.advance()
      expect(trigger).toHaveFocus()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      // A later intentional focus can open a fresh dialog normally.
      act(() => trigger.blur())
      act(() => trigger.focus())
      animation.advance()
      expect(trigger).toHaveFocus()
      animation.advance()
      expect(screen.getByRole('textbox', { name: '搜索关键词' })).toHaveFocus()
    }
  )

  it('uses a keyboard-operable Hexo opener and labelled modal and input', async () => {
    render(<Fixture />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const trigger = await openSearch()
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
    expect(trigger).toHaveAttribute('aria-controls', 'algolia-search-dialog')
    expect(screen.getByRole('dialog', { name: '搜索' })).toHaveAttribute(
      'aria-modal',
      'true'
    )
  })

  it('opens from Space as well as Enter', async () => {
    render(<Fixture />)
    screen.getByRole('button', { name: '搜索' }).focus()
    await user.keyboard(' ')
    act(() => jest.advanceTimersByTime(100))
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('restores the opener after Escape over repeated opens', async () => {
    render(<Fixture />)
    for (let i = 0; i < 2; i++) {
      const trigger = await openSearch()
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
    }
  })

  it('allows Escape after focus leaves the search input', async () => {
    render(<Fixture />)
    const trigger = await openSearch()
    await user.tab()
    expect(screen.getByRole('link', { name: '生活' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('cycles forward and reverse Tab within the dialog', async () => {
    render(<Fixture />)
    await openSearch()
    const close = screen.getByRole('button', { name: '关闭搜索' })
    const last = screen.getByRole('link', { name: '随笔' })
    close.focus()
    await user.tab({ shift: true })
    expect(last).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
  })

  it('recaptures keyboard focus if another control was focused outside', async () => {
    render(<Fixture />)
    await openSearch()
    screen.getByRole('link', { name: 'Outside' }).focus()
    await user.tab()
    expect(screen.getByRole('button', { name: '关闭搜索' })).toHaveFocus()
  })

  it('restores the opener after using the keyboard-accessible close button', async () => {
    render(<Fixture />)
    const trigger = await openSearch()
    screen.getByRole('button', { name: '关闭搜索' }).focus()
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('restores the opener after a backdrop click without later stealing focus', async () => {
    render(<Fixture />)
    const trigger = await openSearch()
    fireEvent.click(document.getElementById('algolia-search-backdrop'))
    act(() => jest.advanceTimersByTime(200))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('cancels initial focus when dismissed before the next animation frame', () => {
    render(<Fixture />)
    const trigger = screen.getByRole('button', { name: '搜索' })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    act(() => jest.advanceTimersByTime(200))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('preserves the original Ctrl+K return target when pressed again in the dialog', async () => {
    render(<Fixture />)
    const outside = screen.getByRole('link', { name: 'Outside' })
    outside.focus()
    await user.keyboard('{Control>}k{/Control}')
    act(() => jest.advanceTimersByTime(100))
    expect(screen.getByRole('textbox')).toHaveFocus()
    await user.keyboard('{Control>}k{/Control}{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(outside).toHaveFocus()
  })

  it('does not close or move selection while an IME composition owns the key', async () => {
    render(<Fixture />)
    await openSearch()
    const input = screen.getByRole('textbox')
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(input).toHaveFocus()
  })

  it('closes when the route changes with the same router object', async () => {
    const { rerender } = render(<Fixture />)
    const trigger = await openSearch()
    router.asPath = '/tag/生活'
    rerender(<Fixture />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes after same-URL navigation and unregisters the route listener', async () => {
    const { unmount } = render(<Fixture />)
    const trigger = await openSearch()
    const [, onNavigation] = router.events.on.mock.calls.find(
      ([event]) => event === 'routeChangeComplete'
    )
    act(() => onNavigation(router.asPath))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    unmount()
    expect(router.events.off).toHaveBeenCalledWith(
      'routeChangeComplete',
      onNavigation
    )
  })

  it('dismisses safely if the original opener has been removed', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    render(<Fixture />)
    trigger.focus()
    await user.keyboard('{Control>}k{/Control}')
    act(() => jest.advanceTimersByTime(100))
    trigger.remove()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each(['Escape', 'Enter', 'Space'])(
    'does not reopen focus/keyup-triggered themes after %s dismissal',
    async activation => {
      render(
        <>
          <input
            aria-label='Theme search opener'
            onFocus={() => modalRef.current.openSearch()}
            onKeyUp={event => {
              if (event.key === 'Enter') modalRef.current.openSearch()
            }}
          />
          <AlgoliaSearchModal cRef={modalRef} />
        </>
      )
      const trigger = screen.getByRole('textbox', {
        name: 'Theme search opener'
      })
      act(() => trigger.focus())
      act(() => jest.advanceTimersByTime(100))
      expect(screen.getByRole('textbox', { name: '搜索关键词' })).toHaveFocus()
      if (activation === 'Escape') {
        await user.keyboard('{Escape}')
      } else {
        screen.getByRole('button', { name: '关闭搜索' }).focus()
        await user.keyboard(activation === 'Enter' ? '{Enter}' : ' ')
      }
      act(() => jest.advanceTimersByTime(200))
      expect(trigger).toHaveFocus()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    }
  )

  it('stays closed when Enter tag navigation finishes before release in the Next theme', async () => {
    render(
      <>
        <NextSearchInput />
        <AlgoliaSearchModal cRef={modalRef} />
      </>
    )
    const trigger = screen.getByPlaceholderText('Next theme search')
    act(() => trigger.focus())
    act(() => jest.advanceTimersByTime(100))
    const tag = screen.getByRole('link', { name: '生活' })
    tag.addEventListener('click', event => {
      event.preventDefault()
      const [, onNavigation] = router.events.on.mock.calls.find(
        ([name]) => name === 'routeChangeComplete'
      )
      onNavigation('/tag/生活')
    })
    act(() => tag.focus())
    await user.keyboard('{Enter>}')
    expect(trigger).toHaveFocus()
    fireEvent.keyUp(document.activeElement, { key: 'Enter', keyCode: 13 })
    act(() => jest.advanceTimersByTime(100))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // The guard is released after keyup so the next intentional open still works.
    act(() => modalRef.current.openSearch())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('releases the held-key guard when the window loses focus', async () => {
    render(
      <>
        <NextSearchInput />
        <AlgoliaSearchModal cRef={modalRef} />
      </>
    )
    act(() => screen.getByPlaceholderText('Next theme search').focus())
    act(() => jest.advanceTimersByTime(100))
    screen.getByRole('button', { name: '关闭搜索' }).focus()
    await user.keyboard('{Enter>}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent(window, new Event('blur'))
    act(() => modalRef.current.openSearch())
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('releases the keyboard listener and restores focus when unmounted', async () => {
    const { rerender } = render(<Fixture />)
    const trigger = await openSearch()
    rerender(<Fixture showModal={false} />)
    expect(trigger).toHaveFocus()
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('exposes result links and keyboard-operable pagination inside the focus trap', async () => {
    render(<Fixture />)
    await openSearch()
    await populateResults()
    expect(search).toHaveBeenCalledWith('result', { page: 0, hitsPerPage: 10 })
    expect(screen.getByRole('link', { name: 'First result' })).toHaveAttribute(
      'href',
      '/blog/first-post'
    )
    expect(screen.getByRole('link', { name: 'Second result' })).toHaveAttribute(
      'href',
      '/blog/second'
    )
    expect(screen.getByRole('button', { name: '第 1 页' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    const last = screen.getByRole('button', { name: '第 2 页' })
    last.focus()
    await user.tab()
    expect(screen.getByRole('button', { name: '关闭搜索' })).toHaveFocus()
    last.focus()
    await user.keyboard('{Enter}')
    await act(async () => {
      jest.advanceTimersByTime(1001)
      await Promise.resolve()
    })
    expect(search).toHaveBeenLastCalledWith('result', {
      page: 1,
      hitsPerPage: 10
    })
  })

  it('keeps focus in the dialog while pagination waits for search results', async () => {
    render(<Fixture />)
    await openSearch()
    await populateResults()
    search.mockImplementation(() => new Promise(() => {}))
    screen.getByRole('button', { name: '第 2 页' }).focus()
    await user.keyboard('{Enter}')
    act(() => jest.advanceTimersByTime(1001))
    expect(
      screen.queryByRole('button', { name: '第 2 页' })
    ).not.toBeInTheDocument()
    expect(screen.getByRole('textbox')).toHaveFocus()
  })

  it('keeps Arrow key selection bounded and moves it on keyboard link focus', async () => {
    render(<Fixture />)
    await openSearch()
    await populateResults()
    const first = screen.getByRole('link', { name: 'First result' })
    const second = screen.getByRole('link', { name: 'Second result' })
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(second.parentElement).toHaveClass('bg-blue-600')
    await user.keyboard('{ArrowUp}{ArrowUp}')
    expect(first.parentElement).toHaveClass('bg-blue-600')
    act(() => second.focus())
    expect(second.parentElement).toHaveClass('bg-blue-600')
  })

  it('does not steal focus on initial mount', () => {
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    render(<Fixture />)
    act(() => jest.advanceTimersByTime(200))
    expect(outside).toHaveFocus()
  })

  it('leaves Tab available when Ctrl+K is pressed with Algolia disabled', async () => {
    siteConfig.mockReturnValue(false)
    render(<Fixture />)
    await user.keyboard('{Control>}k{/Control}')
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })
    document.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('keeps the non-Algolia search route available from the same button', async () => {
    siteConfig.mockReturnValue(false)
    render(<Fixture />)
    const trigger = screen.getByRole('button', { name: '搜索' })
    expect(trigger).not.toHaveAttribute('aria-haspopup')
    trigger.focus()
    await user.keyboard('{Enter}')
    expect(router.push).toHaveBeenCalledWith('/search')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

it('preserves light styling and gives empty search results readable dark text', async () => {
  search.mockResolvedValue({
    hits: [],
    nbHits: 0,
    nbPages: 0,
    processingTimeMS: 1
  })
  render(<Fixture />)
  await openSearch()
  await populateResults()
  expect(screen.getByText(/无法找到相关结果/)).toHaveClass(
    'text-slate-600',
    'dark:text-slate-300'
  )
})
