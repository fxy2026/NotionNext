import SEO from '@/components/SEO'
import { siteConfig } from '@/lib/config'
import { act, cleanup, render } from '@testing-library/react'
import { StrictMode } from 'react'

jest.mock('@/lib/config', () => ({ siteConfig: jest.fn() }))
jest.mock('@/lib/global', () => ({ useGlobal: () => ({ locale: {} }) }))
jest.mock('next/head', () => ({ __esModule: true, default: () => null }))

const fontUrls = [
  'https://fonts.googleapis.com/css?family=Bitter:300,400,700&display=swap',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@300;400;500;700&display=swap'
]
const siteInfo = { title: 'Font test', description: 'English 中文' }
let configuredUrls
const stylesheetLinks = () =>
  Array.from(document.head.querySelectorAll('link[rel="stylesheet"]'))
const advance = milliseconds => act(() => jest.advanceTimersByTime(milliseconds))
const renderSEO = () => render(<SEO siteInfo={siteInfo} />)

beforeEach(() => {
  jest.useFakeTimers()
  configuredUrls = fontUrls
  siteConfig.mockImplementation((key, fallback) => {
    if (key === 'FONT_URL') return configuredUrls
    if (key === 'LINK') return 'https://example.com'
    return fallback
  })
})

afterEach(() => {
  cleanup()
  document.head.innerHTML = ''
  jest.useRealTimers()
})

describe('SEO font stylesheet loading', () => {
  it('keeps the 1500 ms delay and exact font CSS URLs without loading a script', () => {
    renderSEO()
    advance(1499)
    expect(stylesheetLinks()).toHaveLength(0)
    advance(1)
    expect(stylesheetLinks().map(link => link.href)).toEqual(fontUrls)
    expect(document.head.querySelectorAll('script[src]')).toHaveLength(0)
  })

  it('does not restart the delay for equivalent config arrays on rerender', () => {
    const view = renderSEO()
    advance(1000)
    configuredUrls = [...fontUrls]
    view.rerender(<SEO siteInfo={{ ...siteInfo }} />)
    advance(500)
    expect(stylesheetLinks().map(link => link.href)).toEqual(fontUrls)
  })

  it('does not duplicate stylesheets on rerender or route remount', () => {
    const view = renderSEO()
    advance(1500)
    const originalLinks = stylesheetLinks()
    configuredUrls = [...fontUrls]
    view.rerender(<SEO siteInfo={{ ...siteInfo }} />)
    advance(1500)
    view.unmount()
    renderSEO()
    advance(1500)
    expect(stylesheetLinks()).toEqual(originalLinks)
    expect(stylesheetLinks()).toHaveLength(3)
  })

  it('loads each stylesheet only once under Strict Mode', () => {
    render(<StrictMode><SEO siteInfo={siteInfo} /></StrictMode>)
    advance(1500)
    expect(stylesheetLinks().map(link => link.href)).toEqual(fontUrls)
  })

  it('cancels pending loading when unmounted', () => {
    const view = renderSEO()
    advance(1000)
    view.unmount()
    advance(1500)
    expect(stylesheetLinks()).toHaveLength(0)
  })

  it('cancels stale URLs when configuration changes before the delay', () => {
    const view = renderSEO()
    advance(1000)
    configuredUrls = ['/fonts/custom.css']
    view.rerender(<SEO siteInfo={siteInfo} />)
    advance(500)
    expect(stylesheetLinks()).toHaveLength(0)
    advance(1000)
    expect(stylesheetLinks().map(link => link.getAttribute('href')))
      .toEqual(['/fonts/custom.css'])
  })

  it('adds only newly configured stylesheets without removing loaded fonts', () => {
    const view = renderSEO()
    advance(1500)
    const originalLinks = stylesheetLinks()
    configuredUrls = [fontUrls[1], '/fonts/custom.css']
    view.rerender(<SEO siteInfo={siteInfo} />)
    advance(1500)
    expect(stylesheetLinks()).toHaveLength(4)
    expect(stylesheetLinks().slice(0, 3)).toEqual(originalLinks)
  })

  it('supports a single custom URL and removes duplicate or empty entries', () => {
    configuredUrls = ' /fonts/custom.css '
    const view = renderSEO()
    advance(1500)
    const original = stylesheetLinks()[0]
    configuredUrls = ['/fonts/custom.css', '/fonts/custom.css', '', null, false, 0, '  ']
    view.rerender(<SEO siteInfo={siteInfo} />)
    advance(1500)
    expect(stylesheetLinks()).toEqual([original])
  })

  it.each([undefined, null, false, '', [], [null, '', '  ']])(
    'does not load resources for an empty or disabled configuration: %p',
    value => {
      configuredUrls = value
      renderSEO()
      advance(3000)
      expect(stylesheetLinks()).toHaveLength(0)
      expect(document.head.querySelectorAll('script[src]')).toHaveLength(0)
    }
  )

  it('reuses existing relative or absolute stylesheet links', () => {
    const existing = document.createElement('link')
    existing.rel = 'stylesheet'
    existing.href = '/fonts/custom.css'
    document.head.appendChild(existing)
    configuredUrls = existing.href
    renderSEO()
    advance(1500)
    expect(stylesheetLinks()).toEqual([existing])
  })

  it('does not mistake a preload or preconnect for an applied stylesheet', () => {
    const preload = document.createElement('link')
    preload.rel = 'preload'
    preload.as = 'style'
    preload.href = fontUrls[0]
    document.head.appendChild(preload)
    configuredUrls = [fontUrls[0]]
    renderSEO()
    advance(1500)
    expect(stylesheetLinks().map(link => link.href)).toEqual([fontUrls[0]])
    expect(preload.isConnected).toBe(true)
  })

  it.each(['disabled', 'print'])(
    'does not reuse a %s stylesheet as an enabled all-media font stylesheet',
    mode => {
      const existing = document.createElement('link')
      existing.rel = 'stylesheet'
      existing.href = fontUrls[0]
      if (mode === 'disabled') existing.disabled = true
      else existing.media = mode
      document.head.appendChild(existing)
      configuredUrls = [fontUrls[0]]
      renderSEO()
      advance(1500)
      expect(stylesheetLinks()).toHaveLength(2)
      expect(stylesheetLinks()[1].href).toBe(fontUrls[0])
      expect(stylesheetLinks()[1].disabled).not.toBe(true)
      expect(stylesheetLinks()[1].media).toBe('')
      expect(existing.isConnected).toBe(true)
    }
  )

  it('allows a failed stylesheet to retry on remount while retaining loaded ones', () => {
    const view = renderSEO()
    advance(1500)
    const [failed, ...loaded] = stylesheetLinks()
    act(() => failed.dispatchEvent(new Event('error')))
    expect(stylesheetLinks()).toEqual(loaded)
    view.unmount()
    renderSEO()
    advance(1500)
    expect(stylesheetLinks()).toHaveLength(3)
    expect(stylesheetLinks().slice(0, 2)).toEqual(loaded)
    expect(stylesheetLinks()[2].href).toBe(fontUrls[0])
    expect(stylesheetLinks()[2]).not.toBe(failed)
  })

  it('handles quotes in stylesheet URLs without constructing a CSS selector', () => {
    configuredUrls = "https://example.com/fonts.css?label=reader's-font"
    renderSEO()
    expect(() => advance(1500)).not.toThrow()
    expect(stylesheetLinks()[0].getAttribute('href')).toBe(configuredUrls)
  })
})
