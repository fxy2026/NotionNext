/** @jest-environment node */
import { renderToStaticMarkup } from 'react-dom/server'
import { HeadManagerContext } from 'next/dist/shared/lib/head-manager-context.shared-runtime'
import { useRouter } from 'next/router'
import { siteConfig } from '@/lib/config'
import BlogPostListPage from '@/themes/hexo/components/BlogPostListPage'
import BlogPostListScroll from '@/themes/hexo/components/BlogPostListScroll'
import Hero from '@/themes/hexo/components/Hero'

jest.unmock('next/head')
jest.mock('next/router', () => ({ useRouter: jest.fn() }))
jest.mock('@/lib/config', () => ({ siteConfig: jest.fn() }))
jest.mock('@/lib/global', () => ({
  useGlobal: () => ({
    NOTION_CONFIG: {},
    locale: { COMMON: { START_READING: 'Start reading', NO_MORE: 'No more' } }
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
jest.mock('@/themes/hexo/components/NavButtonGroup', () => () => null)

const posts = [0, 1, 2].map(index => ({
  id: `post-${index}`,
  title: `Post ${index}`,
  href: `/article/post-${index}`,
  pageCoverThumbnail: `/cover-${index}.jpg?width=1800`
}))
const siteInfo = { title: 'Site title', pageCover: '/hero.jpg?width=1920' }

beforeEach(() => {
  siteConfig.mockImplementation((key, fallback, config) => {
    const values = {
      POSTS_PER_PAGE: 3,
      IMAGE_COMPRESS_WIDTH: 1200,
      IMG_LAZY_LOAD_PLACEHOLDER: '/placeholder.svg',
      GREETING_WORDS: 'Welcome'
    }
    return values[key] ?? config?.[key] ?? fallback
  })
})

describe.each([
  ['numbered', BlogPostListPage],
  ['scrolling', BlogPostListScroll]
])('%s SSR image loading', (_name, List) => {
  it.each([
    ['/', true],
    ['/', false],
    ['/category/[category]', true],
    ['/tag/[tag]', true],
    ['/search/[keyword]', true],
    ['/page/[page]', true]
  ])(
    'keeps preload and image attributes consistent: %s, banner %s',
    (route, banner) => {
      useRouter.mockReturnValue({ route })
      const configImpl = siteConfig.getMockImplementation()
      siteConfig.mockImplementation((key, ...args) =>
        key === 'HEXO_HOME_BANNER_ENABLE' ? banner : configImpl(key, ...args)
      )
      const showHero = route === '/' && banner
      let head = []
      const manager = {
        mountedInstances: new Set(),
        updateHead: elements => {
          head = elements
        }
      }
      const markup = renderToStaticMarkup(
        <HeadManagerContext.Provider value={manager}>
          {showHero && <Hero siteInfo={siteInfo} />}
          <List posts={posts} postCount={3} siteInfo={siteInfo} />
        </HeadManagerContext.Provider>
      )
      const images = markup.match(/<img\b[^>]*>/g)
      const eagerImages = images.filter(image =>
        image.includes('loading="eager"')
      )
      const preloads = head.filter(
        element => element.type === 'link' && element.props.rel === 'preload'
      )
      const expectedSrc = showHero
        ? '/hero.jpg?width=1200'
        : '/cover-0.jpg?width=1200'
      expect(eagerImages).toHaveLength(1)
      expect(eagerImages[0]).toContain(`src="${expectedSrc}"`)
      expect(eagerImages[0]).toContain('fetchpriority="high"')
      expect(preloads).toHaveLength(1)
      expect(preloads[0].props).toMatchObject({
        as: 'image',
        href: expectedSrc,
        fetchpriority: 'high'
      })
      images
        .filter(image => image !== eagerImages[0])
        .forEach(image => {
          expect(image).toContain('loading="lazy"')
          expect(image).toContain('src="/placeholder.svg"')
          expect(image).not.toContain('fetchpriority=')
        })
      posts.forEach(post => {
        expect(markup).toContain(`data-src="${post.pageCoverThumbnail}"`)
      })
      if (showHero) {
        expect(eagerImages[0]).toContain('id="header-cover"')
        expect(eagerImages[0]).toContain('width="1920"')
        expect(eagerImages[0]).toContain('height="1080"')
      }
    }
  )
})
