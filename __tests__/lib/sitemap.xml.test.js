/** @jest-environment node */
import fs from 'fs'
import { generateSitemapXml } from '@/lib/utils/sitemap.xml'
import { siteConfig } from '@/lib/config'

jest.mock('@/lib/config', () => ({
  siteConfig: jest.fn((key, defaultVal, extendConfig = {}) => {
    if (key === 'LINK' && extendConfig?.LINK) {
      return extendConfig.LINK
    }
    return defaultVal
  })
}))

describe('generateSitemapXml', () => {
  beforeEach(() => {
    siteConfig.mockClear()
  })

  it('does not generate invalid duplicated-domain URLs for external links', () => {
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {})

    generateSitemapXml({
      NOTION_CONFIG: {
        LINK: 'https://example.com/'
      },
      allPages: [
        {
          slug: '/hello-world',
          status: 'Published',
          publishDay: '2026-02-20'
        },
        {
          slug: 'https://external.com/landing',
          status: 'Published',
          publishDay: '2026-02-20'
        },
        {
          slug: 'https://example.com/internal/page',
          status: 'Published',
          publishDay: 'invalid-date'
        }
      ]
    })

    expect(writeSpy).toHaveBeenCalledTimes(2)

    const xml = writeSpy.mock.calls[0][1]
    expect(xml).toContain('<loc>https://example.com/hello-world</loc>')
    expect(xml).toContain('<loc>https://example.com/internal/page</loc>')
    expect(xml).not.toContain('<loc>https://external.com/landing</loc>')
    expect(xml).not.toContain('https://example.com/https://external.com/landing')
    expect(xml).not.toContain('Invalid Date')

    writeSpy.mockRestore()
  })
})


describe('sitemap publication and escaping', () => {
  it('excludes unlisted/draft entries and escapes XML URL values', () => {
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {})
    generateSitemapXml({
      NOTION_CONFIG: { LINK: 'https://example.com' },
      allPages: [
        { slug: 'live?x=1&y=2', status: 'Published' },
        { slug: 'unlisted', status: 'Invisible' },
        { slug: 'draft', status: 'Draft' }
      ]
    })
    const xml = writeSpy.mock.calls[0][1]
    expect(xml).toContain('live?x=1&amp;y=2')
    expect(xml).not.toContain('/unlisted')
    expect(xml).not.toContain('/draft')
    writeSpy.mockRestore()
  })
})
