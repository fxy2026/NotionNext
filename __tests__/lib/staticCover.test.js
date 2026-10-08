import BLOG from '@/blog.config'
import { siteConfig } from '@/lib/config'
import { compressImage, mapImgUrl } from '@/lib/db/notion/mapImage'
import { isReusableStaticCover } from '@/lib/db/notion/staticCover'

jest.mock('@/blog.config', () => ({
  NOTION_HOST: 'https://www.notion.so',
  RANDOM_IMAGE_URL: '',
  RANDOM_IMAGE_REPLACE_TEXT: 'images.unsplash.com'
}))
jest.mock('@/lib/config', () => ({ siteConfig: jest.fn(() => 1080) }))

const cover = 'https://www.xpy.me/images/covers/fxy-geometry-2026.webp'
const block = { id: 'post-a', type: 'page' }
const families = ['geometry', 'science', 'thought', 'tools', 'writing']

describe('versioned own-domain cover cache keys', () => {
  beforeEach(() => {
    BLOG.NOTION_HOST = 'https://www.notion.so'
    BLOG.RANDOM_IMAGE_URL = ''
    BLOG.RANDOM_IMAGE_REPLACE_TEXT = 'images.unsplash.com'
    siteConfig.mockReturnValue(1080)
  })

  it.each(families)('reuses the exact %s cover across posts', family => {
    const source = `https://www.xpy.me/images/covers/fxy-${family}-2026.webp`
    expect(isReusableStaticCover(source)).toBe(true)
    expect(mapImgUrl(source, block)).toBe(source)
    expect(mapImgUrl(source, { ...block, id: 'post-b' })).toBe(source)
  })

  it.each([
    '?v=2&quality=90',
    '?t=author-supplied&v=2',
    '?label=a%20b&label=c+d',
    '#thumbnail',
    '?v=2#thumbnail',
    '#thumbnail?width=320'
  ])('preserves the complete authored suffix %s', suffix => {
    expect(mapImgUrl(cover + suffix, block)).toBe(cover + suffix)
  })

  it.each([
    null,
    undefined,
    '',
    {},
    '/images/covers/fxy-geometry-2026.webp',
    '//www.xpy.me/images/covers/fxy-geometry-2026.webp',
    'not a URL',
    'https://www.xpy.me:invalid/images/covers/fxy-geometry-2026.webp',
    'http://www.xpy.me/images/covers/fxy-geometry-2026.webp',
    'https://xpy.me/images/covers/fxy-geometry-2026.webp',
    'https://www.xpy.me.evil.test/images/covers/fxy-geometry-2026.webp',
    'https://www.xpy.me@evil.test/images/covers/fxy-geometry-2026.webp',
    'https://user:pass@www.xpy.me/images/covers/fxy-geometry-2026.webp',
    'https://www.xpy.me:444/images/covers/fxy-geometry-2026.webp',
    'https://www.xpy.me/images/covers/fxy-new-2026.webp',
    'https://www.xpy.me/images/covers/fxy-geometry-2026.webp.bak',
    'https://www.xpy.me/images/covers/fxy-geometry-2026.webp/',
    'https://www.xpy.me/images/covers/fxy-geometry-2027.webp',
    'https://www.xpy.me/images/covers/fxy-geometry-2026.WEBP',
    'https://www.xpy.me/images/covers/../covers/fxy-geometry-2026.webp',
    'https://www.xpy.me/images/covers/fxy-%67eometry-2026.webp',
    ' https://www.xpy.me/images/covers/fxy-geometry-2026.webp'
  ])('does not allow unrecognized or noncanonical input %p', source => {
    expect(isReusableStaticCover(source)).toBe(false)
  })

  it('leaves missing-image behavior unchanged', () => {
    expect(mapImgUrl(null, block)).toBeNull()
    expect(mapImgUrl('', block)).toBeNull()
  })

  it.each([
    'https://example.com/cover.webp',
    'https://www.xpy.me/images/covers/fxy-future-2026.webp',
    'https://www.xpy.me.evil.test/images/covers/fxy-geometry-2026.webp',
    'https://raw.githubusercontent.com/example/blog/main/cover.png'
  ])('preserves ordinary external cache busting for %s', source => {
    expect(mapImgUrl(source, block)).toBe(`${source}?t=post-a`)
  })

  it('preserves existing external query parameters', () => {
    const source = 'https://example.com/photo.jpg?width=800&token=example'
    expect(mapImgUrl(source, block)).toBe(`${source}&t=post-a`)
  })

  it('preserves existing external fragment handling', () => {
    const source = 'https://example.com/photo.jpg#preview'
    expect(mapImgUrl(source, block)).toBe(`${source}?t=post-a`)
  })

  it('does not rewrite built-in Notion covers', () => {
    const source = '/images/page-cover/nasa_earth_grid.jpg'
    expect(mapImgUrl(source, block)).toBe(BLOG.NOTION_HOST + source)
  })

  it('does not reinterpret relative paths as local assets', () => {
    const source = '/images/covers/fxy-geometry-2026.webp'
    expect(mapImgUrl(source, block)).toBe(BLOG.NOTION_HOST + source)
  })

  it('preserves Notion attachment mapping and block identity', () => {
    const source = 'attachment:example-id:cover.webp'
    expect(mapImgUrl(source, block)).toBe(
      `https://www.notion.so/image/${encodeURIComponent(source)}?table=block&id=post-a&t=post-a`
    )
  })

  it('preserves Notion proxy width and cache transforms', () => {
    const source = 'https://prod-files-secure.s3.amazonaws.com/cover.png'
    const result = new URL(
      mapImgUrl(source, { ...block, format: { block_width: 640 } })
    )
    expect(result.origin).toBe('https://www.notion.so')
    expect(result.pathname).toBe(`/image/${encodeURIComponent(source)}`)
    expect(Object.fromEntries(result.searchParams)).toEqual({
      table: 'block',
      id: 'post-a',
      t: 'post-a',
      width: '640',
      cache: 'v2'
    })
  })

  it('preserves Unsplash source, quality, format and width transforms', () => {
    const source = 'https://images.unsplash.com/photo-example?crop=entropy&q=90'
    const result = new URL(mapImgUrl(source, block))
    expect(result.origin).toBe('https://images.unsplash.com')
    expect(result.pathname).toBe('/photo-example')
    expect(Object.fromEntries(result.searchParams)).toEqual({
      crop: 'entropy',
      q: '50',
      t: 'post-a',
      width: '1080',
      fmt: 'webp',
      fm: 'webp'
    })
  })

  it('preserves compression opt-out', () => {
    const source = 'https://images.unsplash.com/photo-example?q=90'
    expect(mapImgUrl(source, block, 'block', false)).toBe(`${source}&t=post-a`)
  })

  it('keeps authored own-domain URLs intact during direct compression', () => {
    expect(compressImage(cover + '?v=2#preview', 320)).toBe(
      cover + '?v=2#preview'
    )
  })

  it('still replaces selected sources with a cache-busted random provider', () => {
    BLOG.RANDOM_IMAGE_URL = 'https://random.example.com/image?category=art'
    BLOG.RANDOM_IMAGE_REPLACE_TEXT = 'www.xpy.me'
    expect(mapImgUrl(cover, block)).toBe(BLOG.RANDOM_IMAGE_URL + '&t=post-a')
  })

  it('still cache-busts an explicit random-provider replacement using a known asset', () => {
    BLOG.RANDOM_IMAGE_URL = cover
    BLOG.RANDOM_IMAGE_REPLACE_TEXT = 'images.unsplash.com'
    expect(mapImgUrl('https://images.unsplash.com/photo-example', block)).toBe(
      cover + '?t=post-a'
    )
  })

  it('keeps replace-all random-provider behavior, even for an identical URL', () => {
    BLOG.RANDOM_IMAGE_URL = cover
    BLOG.RANDOM_IMAGE_REPLACE_TEXT = ''
    expect(mapImgUrl(cover, block)).toBe(cover + '?t=post-a')
    expect(mapImgUrl(cover, { ...block, id: 'post-b' })).toBe(
      cover + '?t=post-b'
    )
  })

  it('reuses static covers when an unrelated random-provider rule is configured', () => {
    BLOG.RANDOM_IMAGE_URL = 'https://random.example.com/image'
    expect(mapImgUrl(cover, block)).toBe(cover)
  })
})
