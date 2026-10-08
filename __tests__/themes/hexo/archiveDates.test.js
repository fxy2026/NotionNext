import { render, screen } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server.node'
import { fetchGlobalAllData } from '@/lib/db/SiteDataApi'
import { getStaticProps } from '@/pages/archive'
import { BlogPostCardInfo } from '@/themes/hexo/components/BlogPostCardInfo'
import PostHero from '@/themes/hexo/components/PostHero'
import BlogPostArchive from '@/themes/hexo/components/BlogPostArchive'

jest.mock('@/blog.config', () => ({ LANG: 'zh-CN', THEME: 'hexo' }))
jest.mock('@/lib/config', () => ({
  siteConfig: (key, fallback) => {
    if (key === 'ANALYTICS_BUSUANZI_ENABLE') return 'false'
    if (key === 'POST_TITLE_ICON') return false
    return fallback
  }
}))
jest.mock('@/lib/db/SiteDataApi', () => ({ fetchGlobalAllData: jest.fn() }))
jest.mock('@/lib/utils', () => ({ isBrowser: false }))
jest.mock('@/themes/theme', () => ({ DynamicLayout: () => null }))
jest.mock('@/lib/global', () => ({
  useGlobal: () => ({
    fullWidth: false,
    locale: {
      COMMON: { POST_TIME: 'Published', LAST_EDITED_TIME: 'Updated' }
    }
  })
}))
jest.mock('@/components/SmartLink', () => {
  return function MockSmartLink({ href, children, className }) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    )
  }
})
jest.mock('@/components/NotionIcon', () => () => null)
jest.mock('@/components/NotionPage', () => () => null)
jest.mock('@/components/TwikooCommentCount', () => () => null)
jest.mock('@/components/LazyImage', () => () => null)
jest.mock('@/themes/hexo/components/TagItemMini', () => () => null)

// Run this file in separate processes with TZ=UTC, America/Los_Angeles,
// America/New_York, Asia/Shanghai and Pacific/Kiritimati. This covers both sides
// of UTC and real host-local Date behavior instead of mocking date getters.
const cases = [
  ['month boundary', '2025-09-01', '2025-09-01T00:00:00.000Z', '2025-09'],
  ['year boundary', '2025-01-01', '2025-01-01T00:00:00.000Z', '2025-01'],
  ['leap day', '2024-02-29', '2024-02-29T00:00:00.000Z', '2024-02'],
  ['DST starts', '2025-03-09', '2025-03-09T00:00:00.000Z', '2025-03'],
  ['DST ends', '2025-11-02', '2025-11-02T00:00:00.000Z', '2025-11'],
  ['timestamp-only year end', null, '2024-12-31T23:30:00.000Z', '2024-12'],
  ['timestamp-only month start', null, '2025-09-01T00:00:00.000Z', '2025-09']
]

function makePost(startDate, instant) {
  return {
    id: 'public-date-fixture',
    type: 'Post',
    status: 'Published',
    title: 'Public date fixture',
    href: '/article/date-fixture',
    ...(startDate ? { date: { start_date: startDate } } : {}),
    publishDate: Date.parse(instant),
    publishDay: startDate || instant.slice(0, 10),
    lastEditedDay: '2026-10-08'
  }
}

describe('Hexo archive links and server groups share a calendar month', () => {
  test.each(cases)('groups %s', async (_label, startDate, instant, month) => {
    const post = makePost(startDate, instant)
    const original = JSON.stringify(post)
    fetchGlobalAllData.mockResolvedValueOnce({ allPages: [post] })

    const { props } = await getStaticProps({ locale: 'zh-CN' })
    expect(Object.keys(props.archivePosts)).toEqual([month])
    expect(props.archivePosts[month]).toEqual([post])

    expect(JSON.stringify(post)).toBe(original)
  })

  test.each(cases)('links %s', (_label, startDate, instant, month) => {
    const post = makePost(startDate, instant)
    const original = JSON.stringify(post)
    const href = `/archive#${month}`
    // SSR output and client render must agree with the server's archive ID.
    expect(renderToStaticMarkup(<BlogPostCardInfo post={post} />)).toContain(
      `href="${href}"`
    )
    expect(renderToStaticMarkup(<PostHero post={post} />)).toContain(
      `href="${href}"`
    )

    const { container } = render(
      <>
        <BlogPostCardInfo post={post} />
        <PostHero post={post} />
        <BlogPostArchive archiveTitle={month} posts={[post]} />
      </>
    )
    expect(container.querySelectorAll(`a[href="${href}"]`)).toHaveLength(2)
    expect(document.getElementById(month)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: post.publishDay })).toHaveAttribute(
      'href',
      href
    )
    expect(
      screen.getByText(`Published: ${post.publishDay}`)
    ).toBeInTheDocument()
    expect(screen.getByText('Updated: 2026-10-08')).toBeInTheDocument()
    expect(JSON.stringify(post)).toBe(original)
  })

  test('keeps publication filtering and sorting behavior', async () => {
    const older = makePost('2025-08-31', '2025-08-31T00:00:00.000Z')
    const newer = {
      ...makePost('2025-09-01', '2025-09-01T00:00:00.000Z'),
      id: 'newer'
    }
    fetchGlobalAllData.mockResolvedValueOnce({
      allPages: [
        older,
        { ...newer, id: 'page', type: 'Page' },
        { ...newer, id: 'draft', status: 'Draft' },
        newer
      ]
    })
    const { props } = await getStaticProps({ locale: 'zh-CN' })

    expect(Object.keys(props.archivePosts)).toEqual(['2025-09', '2025-08'])
    expect(Object.values(props.archivePosts).flat()).toEqual([newer, older])
    expect(props.allPages).toBeUndefined()
  })
})
