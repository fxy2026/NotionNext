import { fireEvent, render, screen } from '@testing-library/react'
import { useRouter } from 'next/router'
import { siteConfig } from '@/lib/config'
import BlogPostListPage from '@/themes/hexo/components/BlogPostListPage'
import BlogPostListScroll from '@/themes/hexo/components/BlogPostListScroll'

jest.mock('next/router', () => ({ useRouter: jest.fn() }))
jest.mock('@/lib/config', () => ({ siteConfig: jest.fn() }))
jest.mock('@/lib/global', () => ({
  useGlobal: () => ({
    NOTION_CONFIG: {},
    locale: { COMMON: { MORE: 'More', NO_MORE: 'No more' } }
  })
}))
jest.mock('@/lib/utils', () => ({
  getListByPage: (posts, page, pageSize) => posts.slice(0, page * pageSize)
}))
jest.mock('@/components/SmartLink', () => {
  return function MockSmartLink({ children, href }) {
    return <a href={href}>{children}</a>
  }
})
jest.mock('@/themes/hexo/components/BlogPostCardInfo', () => ({
  BlogPostCardInfo: () => null
}))
jest.mock('@/themes/hexo/components/BlogPostListEmpty', () => () => null)
jest.mock('@/themes/hexo/components/PaginationNumber', () => () => null)

const posts = Array.from({ length: 4 }, (_, index) => ({
  id: `post-${index}`,
  title: `Post ${index}`,
  href: `/article/post-${index}`,
  pageCoverThumbnail: `/cover-${index}.jpg`
}))
const siteInfo = { pageCover: '/hero.jpg' }
let bannerEnabled

beforeEach(() => {
  bannerEnabled = true
  useRouter.mockReturnValue({ route: '/' })
  siteConfig.mockImplementation((key, fallback, config) => {
    const values = {
      HEXO_HOME_BANNER_ENABLE: bannerEnabled,
      POSTS_PER_PAGE: 3,
      IMG_LAZY_LOAD_PLACEHOLDER: '/placeholder.svg'
    }
    return values[key] ?? config?.[key] ?? fallback
  })
})

const cases = [
  ['/', true, false],
  ['/', false, true],
  ['/page/[page]', true, true],
  ['/page/[page]', false, true],
  ['/category/[category]', true, true],
  ['/category/[category]/page/[page]', true, true],
  ['/tag/[tag]', true, true],
  ['/tag/[tag]/page/[page]', true, true],
  ['/search', true, true],
  ['/search/[keyword]', true, true],
  ['/search/[keyword]/page/[page]', true, true]
]

describe.each([
  ['numbered', BlogPostListPage],
  ['scrolling', BlogPostListScroll]
])('%s list image priority', (_name, List) => {
  it.each(cases)(
    'uses the first cover only without a hero: route %s, banner %s',
    (route, showBanner, firstPriority) => {
      bannerEnabled = showBanner
      useRouter.mockReturnValue({ route })
      const { container } = render(
        <List posts={posts.slice(0, 3)} postCount={3} siteInfo={siteInfo} />
      )
      const images = screen.getAllByRole('img')
      expect(images).toHaveLength(3)
      images.forEach((image, index) => {
        const priority = index === 0 && firstPriority
        expect(image).toHaveAttribute('loading', priority ? 'eager' : 'lazy')
        expect(image.getAttribute('fetchpriority')).toBe(
          priority ? 'high' : null
        )
        expect(image).toHaveAttribute(
          'data-src',
          posts[index].pageCoverThumbnail
        )
        expect(image).toHaveAttribute(
          'src',
          priority ? posts[index].pageCoverThumbnail : '/placeholder.svg'
        )
      })
      const preloads = container.querySelectorAll(
        'link[rel="preload"][as="image"]'
      )
      expect(preloads).toHaveLength(firstPriority ? 1 : 0)
      if (firstPriority) {
        expect(preloads[0]).toHaveAttribute(
          'href',
          images[0].getAttribute('src')
        )
      }
    }
  )

  it('updates priority when navigating between homepage and category', () => {
    const view = <List posts={posts} postCount={4} siteInfo={siteInfo} />
    const { rerender } = render(view)
    expect(screen.getByAltText('Post 0')).toHaveAttribute('loading', 'lazy')
    useRouter.mockReturnValue({ route: '/category/[category]' })
    rerender(<List posts={posts} postCount={4} siteInfo={siteInfo} />)
    expect(screen.getByAltText('Post 0')).toHaveAttribute('loading', 'eager')
    expect(screen.getByAltText('Post 1')).toHaveAttribute('loading', 'lazy')
    useRouter.mockReturnValue({ route: '/' })
    rerender(<List posts={posts} postCount={4} siteInfo={siteInfo} />)
    expect(screen.getByAltText('Post 0')).toHaveAttribute('loading', 'lazy')
    expect(screen.getByAltText('Post 0')).not.toHaveAttribute('fetchpriority')
  })
})

it('does not prioritize newly appended scroll covers', () => {
  bannerEnabled = false
  const { container } = render(
    <BlogPostListScroll posts={posts} siteInfo={siteInfo} />
  )
  expect(screen.queryByAltText('Post 3')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('More'))
  expect(screen.getByAltText('Post 3')).toHaveAttribute('loading', 'lazy')
  expect(container.querySelectorAll('img[fetchpriority="high"]')).toHaveLength(
    1
  )
  expect(container.querySelectorAll('link[rel="preload"]')).toHaveLength(1)
})

it('uses index zero on subsequent numbered pages', () => {
  useRouter.mockReturnValue({ route: '/page/[page]' })
  render(
    <BlogPostListPage
      page={2}
      posts={posts.slice(2)}
      postCount={6}
      siteInfo={siteInfo}
    />
  )
  expect(screen.getByAltText('Post 2')).toHaveAttribute('loading', 'eager')
  expect(screen.getByAltText('Post 3')).toHaveAttribute('loading', 'lazy')
})

it('does not promote the second cover when the first post has no cover', () => {
  bannerEnabled = false
  const configImpl = siteConfig.getMockImplementation()
  siteConfig.mockImplementation((key, ...args) =>
    key === 'HEXO_POST_LIST_COVER_DEFAULT' ? false : configImpl(key, ...args)
  )
  const { container } = render(
    <BlogPostListPage
      posts={[{ ...posts[0], pageCoverThumbnail: null }, posts[1]]}
      postCount={2}
      siteInfo={siteInfo}
    />
  )
  expect(screen.queryByAltText('Post 0')).not.toBeInTheDocument()
  expect(screen.getByAltText('Post 1')).toHaveAttribute('loading', 'lazy')
  expect(container.querySelector('link[rel="preload"]')).toBeNull()
})

it.each(['HEXO_POST_LIST_COVER', 'HEXO_POST_LIST_PREVIEW'])(
  'respects existing %s cover visibility',
  option => {
    const configImpl = siteConfig.getMockImplementation()
    siteConfig.mockImplementation((key, ...args) =>
      key === option
        ? option === 'HEXO_POST_LIST_PREVIEW'
        : configImpl(key, ...args)
    )
    const { container } = render(
      <BlogPostListPage
        posts={posts.map(post => ({ ...post, blockMap: {} }))}
        postCount={4}
        siteInfo={siteInfo}
      />
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(container.querySelector('link[rel="preload"]')).toBeNull()
  }
)
