import * as React from 'react'
import userEvent from '@testing-library/user-event'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import algoliasearch from 'algoliasearch'
import { useRouter } from 'next/router'

// Isolate each module-scope Next loadable subscription, but share React with
// ReactDOM. The real dynamic loader waits on/rejects the controlled promise.
jest.doMock('react', () => React)
const mockImportGate = jest.fn()
const mockLoads = jest.fn()
let mockAppId = 'synthetic-app'

jest.mock('next/dynamic', () => {
  const dynamic = jest.requireActual('next/dynamic').default
  return (loader, options) =>
    dynamic(() => {
      mockLoads()
      return mockImportGate().then(loader)
    }, options)
})
jest.mock('@/lib/config', () => ({
  siteConfig: key =>
    key === 'ALGOLIA_APP_ID' ? mockAppId : 'synthetic-public-value'
}))
jest.mock('@/lib/global', () => ({
  useGlobal: () => ({ locale: { NAV: { SEARCH: 'Search' } }, tagOptions: [] })
}))
jest.mock('next/router', () => ({ useRouter: jest.fn() }))
jest.mock('algoliasearch', () => jest.fn())
jest.mock('@/components/Mark', () => () => null)
jest.mock('@/components/SmartLink', () => () => null)

let LazyModal
let modalRef
let events
let handlers

function deferred() {
  let resolve
  let reject
  const promise = new Promise((success, failure) => {
    resolve = success
    reject = failure
  })
  return { promise, resolve, reject }
}

function Fixture({ enabled = true }) {
  return (
    <>
      <input aria-label='Outside input' />
      <button
        onClick={event => modalRef.current?.openSearch(event.currentTarget)}
      >
        Open search
      </button>
      <button
        onClick={event => modalRef.current?.openSearch(event.currentTarget)}
      >
        Second opener
      </button>
      {enabled && <LazyModal cRef={modalRef} />}
    </>
  )
}

beforeEach(() => {
  jest.isolateModules(() => {
    LazyModal =
      require('@/themes/hexo/components/LazyAlgoliaSearchModal').default
  })
  modalRef = React.createRef()
  mockAppId = 'synthetic-app'
  mockImportGate.mockReset().mockResolvedValue()
  mockLoads.mockClear()
  handlers = new Map()
  events = {
    on: jest.fn((event, callback) => {
      if (!handlers.has(event)) handlers.set(event, new Set())
      handlers.get(event).add(callback)
    }),
    off: jest.fn((event, callback) => handlers.get(event)?.delete(callback))
  }
  useRouter.mockReturnValue({ asPath: '/', events })
  algoliasearch.mockReturnValue({ initIndex: () => ({ search: jest.fn() }) })
})

function clickOpen() {
  const button = screen.getByRole('button', { name: 'Open search' })
  button.focus()
  fireEvent.click(button)
  return button
}

function pressShortcut(target = document) {
  fireEvent.keyDown(target, {
    key: 'Control',
    code: 'ControlLeft',
    ctrlKey: true
  })
  fireEvent.keyDown(target, { key: 'k', code: 'KeyK', ctrlKey: true })
  fireEvent.keyUp(target, { key: 'k', code: 'KeyK', ctrlKey: true })
  fireEvent.keyUp(target, { key: 'Control', code: 'ControlLeft' })
}

async function expectOpen() {
  await waitFor(() =>
    expect(screen.getByRole('dialog', { name: '搜索' })).toBeInTheDocument()
  )
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: '搜索关键词' })).toHaveFocus()
  )
}

async function resolveLoad(gate) {
  await act(async () => {
    gate.resolve()
    await gate.promise
  })
}

it('does not import or initialize configured Algolia before explicit intent', async () => {
  render(<Fixture />)
  await act(async () => {})
  expect(mockLoads).not.toHaveBeenCalled()
  expect(algoliasearch).not.toHaveBeenCalled()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('loads once for repeated intent and returns focus to the original opener', async () => {
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  render(<Fixture />)
  const original = clickOpen()
  expect(screen.getByRole('status')).toHaveTextContent('正在加载搜索')
  fireEvent.click(screen.getByRole('button', { name: 'Second opener' }))
  pressShortcut()
  expect(mockLoads).toHaveBeenCalledTimes(1)
  expect(algoliasearch).not.toHaveBeenCalled()
  await resolveLoad(gate)
  await expectOpen()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(original).toHaveFocus()
})

it('accepts Ctrl+K from an input before the module loads and retains one owner', async () => {
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  render(<Fixture />)
  const input = screen.getByRole('textbox', { name: 'Outside input' })
  input.focus()
  pressShortcut(input)
  expect(mockLoads).toHaveBeenCalledTimes(1)
  await resolveLoad(gate)
  await expectOpen()
  pressShortcut(screen.getByRole('textbox', { name: '搜索关键词' }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(input).toHaveFocus()
  pressShortcut(input)
  await expectOpen()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(input).toHaveFocus()
  expect(mockLoads).toHaveBeenCalledTimes(1)
})

it('shows a load error and retries the actual failed dynamic subscription', async () => {
  const gate = deferred()
  mockImportGate.mockReturnValueOnce(gate.promise).mockResolvedValue()
  render(<Fixture />)
  const opener = clickOpen()
  await act(async () => {
    gate.reject(new Error('synthetic chunk failure'))
    await gate.promise.catch(() => {})
  })
  expect(screen.getByRole('alert')).toHaveTextContent('搜索加载失败')
  expect(algoliasearch).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await expectOpen()
  expect(mockLoads).toHaveBeenCalledTimes(2)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(opener).toHaveFocus()
})

it.each(['cancel', 'Escape', 'routeChangeStart', 'hashChangeStart'])(
  'cancels pending intent on %s without opening after the import settles',
  async action => {
    const gate = deferred()
    mockImportGate.mockReturnValue(gate.promise)
    render(<Fixture />)
    const opener = clickOpen()
    if (action === 'cancel') {
      fireEvent.click(screen.getByRole('button', { name: '取消' }))
    } else if (action === 'Escape') {
      fireEvent.keyDown(document, { key: 'Escape' })
    } else {
      act(() => handlers.get(action).forEach(callback => callback('/next')))
    }
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
    await resolveLoad(gate)
    expect(algoliasearch).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // A canceled download may finish and enter Next's module cache. Reopening
    // can use it, but must require a new explicit intent.
    clickOpen()
    await expectOpen()
    expect(mockLoads).toHaveBeenCalledTimes(1)
  }
)

it('does not open or initialize after unmount and unregisters pending listeners', async () => {
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  const { unmount } = render(<Fixture />)
  clickOpen()
  unmount()
  await resolveLoad(gate)
  expect(modalRef.current).toBeNull()
  expect(algoliasearch).not.toHaveBeenCalled()
  expect(handlers.get('routeChangeStart').size).toBe(0)
  expect(handlers.get('hashChangeStart').size).toBe(0)
  pressShortcut()
  expect(mockLoads).toHaveBeenCalledTimes(1)
})

it('cancels on config disable and requires fresh intent after re-enabling', async () => {
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  const { rerender } = render(<Fixture />)
  clickOpen()
  mockAppId = false
  rerender(<Fixture enabled={false} />)
  await resolveLoad(gate)
  expect(algoliasearch).not.toHaveBeenCalled()
  mockAppId = 're-enabled-app'
  rerender(<Fixture />)
  expect(algoliasearch).not.toHaveBeenCalled()
  clickOpen()
  await expectOpen()
  expect(algoliasearch).toHaveBeenCalledWith(
    're-enabled-app',
    'synthetic-public-value'
  )
})

it('keeps the loaded modal mounted across dismissal and repeated openings', async () => {
  render(<Fixture />)
  const opener = clickOpen()
  await expectOpen()
  for (let count = 0; count < 3; count++) {
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(opener).toHaveFocus()
    expect(document.getElementById('search-wrapper')).toBeInTheDocument()
    fireEvent.click(opener)
    await expectOpen()
  }
  expect(mockLoads).toHaveBeenCalledTimes(1)
})

it('replays the first intent safely under React StrictMode', async () => {
  render(
    <React.StrictMode>
      <Fixture />
    </React.StrictMode>
  )
  clickOpen()
  await expectOpen()
  expect(mockLoads).toHaveBeenCalledTimes(1)
})

it('can dismiss a failed load and retry it after a later open', async () => {
  mockImportGate.mockRejectedValueOnce(new Error('synthetic failure'))
  render(<Fixture />)
  clickOpen()
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  clickOpen()
  expect(screen.getByRole('alert')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await expectOpen()
  expect(mockLoads).toHaveBeenCalledTimes(2)
})

it('a held Enter on the loading Cancel control does not reopen search after focus returns', async () => {
  const user = userEvent.setup()
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  render(<Fixture />)
  const opener = clickOpen()
  const cancel = screen.getByRole('button', { name: '取消' })
  cancel.focus()
  // One call repeats keydown without user-event inserting an intervening keyup.
  await user.keyboard('{Enter>4}')
  expect(opener).toHaveFocus()
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  await user.keyboard('{/Enter}')
  await resolveLoad(gate)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('IME Escape does not cancel first-load search intent', async () => {
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  render(<Fixture />)
  clickOpen()
  fireEvent.keyDown(document, { key: 'Escape', isComposing: true })
  expect(screen.getByRole('status')).toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'Escape', keyCode: 229 })
  expect(screen.getByRole('status')).toBeInTheDocument()
  await resolveLoad(gate)
  await expectOpen()
})

it('a removed original opener is safe during first-load cancellation', async () => {
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  render(<Fixture />)
  const opener = document.createElement('button')
  document.body.appendChild(opener)
  act(() => modalRef.current.openSearch(opener))
  opener.remove()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  await resolveLoad(gate)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('releases the pending-load held-key guard when the window loses focus', async () => {
  const user = userEvent.setup()
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  render(<Fixture />)
  clickOpen()
  screen.getByRole('button', { name: '取消' }).focus()
  await user.keyboard('{Enter>}')
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  fireEvent(window, new Event('blur'))
  clickOpen()
  expect(screen.getByRole('status')).toBeInTheDocument()
  await resolveLoad(gate)
  await expectOpen()
})

it('retains pending intent when the router events object is replaced', async () => {
  const gate = deferred()
  mockImportGate.mockReturnValue(gate.promise)
  const { rerender } = render(<Fixture />)
  clickOpen()
  useRouter.mockReturnValue({
    asPath: '/',
    events: { on: jest.fn(), off: jest.fn() }
  })
  rerender(<Fixture />)
  expect(handlers.get('routeChangeStart').size).toBe(0)
  await resolveLoad(gate)
  await expectOpen()
})
