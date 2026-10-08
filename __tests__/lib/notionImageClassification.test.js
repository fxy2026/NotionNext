import BLOG from '@/blog.config'
import { mapImgUrl } from '@/lib/db/notion/mapImage'

jest.mock('@/blog.config', () => ({
  NOTION_HOST: 'https://www.notion.so',
  RANDOM_IMAGE_URL: '',
  RANDOM_IMAGE_REPLACE_TEXT: ''
}))
jest.mock('@/lib/config', () => ({ siteConfig: jest.fn(() => 1080) }))

const block = { id: 'post-a', type: 'page' }
const mapWithoutCompression = source => mapImgUrl(source, block, 'block', false)
const cacheBusted = source =>
  `${source}${source.includes('?') ? '&' : '?'}t=post-a`

describe('Notion static-image URL identity', () => {
  beforeEach(() => {
    BLOG.NOTION_HOST = 'https://www.notion.so'
    BLOG.RANDOM_IMAGE_URL = ''
    BLOG.RANDOM_IMAGE_REPLACE_TEXT = ''
  })

  it.each([
    'https://www.notion.so/images/logo.png',
    'https://www.notion.so/images/page-cover/nasa.jpg',
    'https://www.notion.so/images/page-cover/nasa.jpg?v=2#preview',
    'https://notion.so/images/page-cover/nasa.jpg',
    'http://www.notion.so/images/page-cover/nasa.jpg',
    'http://notion.so/images/page-cover/nasa.jpg',
    'https://www.notion.so:443/images/logo.png',
    'http://notion.so:80/images/page-cover/nasa.jpg'
  ])('preserves a legitimate built-in image: %s', source => {
    expect(mapWithoutCompression(source)).toBe(source)
  })

  it('preserves relative built-in image mapping', () => {
    expect(mapWithoutCompression('/images/page-cover/nasa.jpg')).toBe(
      'https://www.notion.so/images/page-cover/nasa.jpg'
    )
  })

  it.each([
    'https://evil.test/https://www.notion.so/images/logo.png',
    'https://evil.test/?next=https://www.notion.so/images/logo.png',
    'https://evil.test/#https://www.notion.so/images/logo.png',
    'https://evil.test/notion.so/images/page-cover/nasa.jpg',
    'https://evil.test/?next=https://notion.so/images/page-cover/nasa.jpg',
    'https://evil.test/#https://notion.so/images/page-cover/nasa.jpg',
    'https://evilnotion.so/images/page-cover/nasa.jpg',
    'https://www.notion.so.evil.test/images/page-cover/nasa.jpg',
    'https://notion.so.evil.test/images/page-cover/nasa.jpg',
    'https://www.notion.so@evil.test/images/page-cover/nasa.jpg',
    'https://user:pass@www.notion.so/images/page-cover/nasa.jpg',
    'https://user@www.notion.so/images/logo.png',
    'https://www.notion.so:444/images/page-cover/nasa.jpg',
    'https://www.notion.so:444/images/logo.png',
    'ftp://notion.so/images/page-cover/nasa.jpg',
    'ftp://www.notion.so/images/logo.png',
    'https://notion.so/images/page-cover-extra/nasa.jpg',
    'https://www.notion.so/images-extra/logo.png',
    'https://www.notion.so/not-images/logo.png',
    'https://www.notion.so/images%2Flogo.png',
    'https://notion.so/images/page-cover%2Fnasa.jpg',
    'https://evil.test/?next=https%3A%2F%2Fwww.notion.so%2Fimages%2Flogo.png',
    'https://[invalid]/?next=https://www.notion.so/images/logo.png',
    'not-a-url?next=https://notion.so/images/page-cover/nasa.jpg'
  ])('does not grant a Notion exemption to %s', source => {
    expect(mapWithoutCompression(source)).toBe(cacheBusted(source))
  })

  it.each([
    'http://www.notion.so/images/logo.png',
    'https://notion.so/images/logo.png',
    'https://www.notion.so/image/attachment%3Aid%3Acover.png?table=block&id=post-a'
  ])('does not broaden existing non-cover exemptions: %s', source => {
    expect(mapWithoutCompression(source)).toBe(cacheBusted(source))
  })

  it.each([
    'https://www.notion.so/images/page-cover/nasa.jpg',
    'https://notion.so/images/page-cover/nasa.jpg',
    'http://www.notion.so/images/page-cover/nasa.jpg',
    'http://notion.so/images/page-cover/nasa.jpg'
  ])('keeps real page covers out of replace-all random rules: %s', source => {
    BLOG.RANDOM_IMAGE_URL = 'https://random.example.com/image'
    expect(mapWithoutCompression(source)).toBe(source)
  })

  it.each([
    'https://www.notion.so/images/page-cover-extra/nasa.jpg',
    'https://www.notion.so/images/page-cover',
    'https://evil.test/?next=https://www.notion.so/images/page-cover/nasa.jpg',
    'https://evilnotion.so/images/page-cover/nasa.jpg'
  ])('does not bypass random rules using misleading cover text: %s', source => {
    BLOG.RANDOM_IMAGE_URL = 'https://random.example.com/image?topic=art'
    expect(mapWithoutCompression(source)).toBe(
      'https://random.example.com/image?topic=art&t=post-a'
    )
  })

  it('checks the actual replacement URL before applying the static-image exemption', () => {
    BLOG.RANDOM_IMAGE_URL = 'https://www.notion.so/images/logo.png'
    expect(mapWithoutCompression('https://example.com/photo.jpg')).toBe(
      BLOG.RANDOM_IMAGE_URL
    )
  })

  it('does not let a replacement embed a trusted URL to avoid cache busting', () => {
    BLOG.RANDOM_IMAGE_URL =
      'https://random.example.com/image?next=https://www.notion.so/images/logo.png'
    expect(mapWithoutCompression('https://example.com/photo.jpg')).toBe(
      cacheBusted(BLOG.RANDOM_IMAGE_URL)
    )
  })

  it('continues to leave ordinary external query and fragment bytes intact', () => {
    const source = 'https://example.com/photo.jpg?v=a%20b&v=c+d#preview'
    expect(mapWithoutCompression(source)).toBe(cacheBusted(source))
  })
})
