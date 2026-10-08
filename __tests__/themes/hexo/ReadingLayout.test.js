import { fireEvent, render, screen } from '@testing-library/react'
import { useGlobal } from '@/lib/global'
import { siteConfig } from '@/lib/config'
import Hero from '@/themes/hexo/components/Hero'
import PostHero from '@/themes/hexo/components/PostHero'
import BlogPostCard from '@/themes/hexo/components/BlogPostCard'
import { MenuItemCollapse } from '@/themes/hexo/components/MenuItemCollapse'
import TocDrawerButton from '@/themes/hexo/components/TocDrawerButton'

jest.mock('@/lib/utils', () => ({
  loadExternalResource: jest.fn(() => Promise.resolve())
}))
jest.mock('@/lib/global', () => ({ useGlobal: jest.fn() }))
jest.mock('@/lib/config', () => ({ siteConfig: jest.fn() }))
jest.mock('@/components/SmartLink', () => ({
  __esModule: true,
  default: ({ children, href, passHref, legacyBehavior, ...props }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}))
jest.mock('@/components/LazyImage', () => ({
  __esModule: true,
  // Preserve the native image attributes for this component contract test.
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ priority, ...props }) => <img alt='' {...props} />
}))
jest.mock(
  '@/components/Collapse',
  () =>
    function MockCollapse({ children }) {
      return <div>{children}</div>
    }
)
jest.mock('@/components/NotionIcon', () => () => null)
jest.mock('@/components/NotionPage', () => () => null)
jest.mock('@/components/TwikooCommentCount', () => () => null)

const post = {
  id: 'preserved-post',
  title: '从不确定，到可以结束：2026 数模国赛 B 题完整复盘',
  type: 'Post',
  href: '/article/cumcm2026-b-retrospective',
  category: '技术分享',
  summary: '已有文章摘要保持不变。',
  pageCover: 'https://example.com/original-cover.jpg',
  pageCoverThumbnail: 'https://example.com/original-thumbnail.jpg',
  publishDate: '2026-09-13',
  publishDay: '2026-9-13',
  lastEditedDay: '2026-9-13',
  tagItems: ['数学', '竞赛', '思考', '开发', '建站'].map(name => ({ name }))
}

beforeEach(() => {
  useGlobal.mockReturnValue({
    fullWidth: false,
    locale: {
      COMMON: {
        POST_TIME: '发布于',
        LAST_EDITED_TIME: '最后更新',
        TABLE_OF_CONTENTS: '目录',
        START_READING: '开始阅读'
      },
      POST: { TOP: '回到顶部' }
    }
  })
  siteConfig.mockImplementation(key => {
    if (key === 'GREETING_WORDS') return '欢迎来到我的博客'
    if (key === 'ANALYTICS_BUSUANZI_ENABLE') return 'false'
    return ['HEXO_POST_LIST_COVER', 'HEXO_WIDGET_TOC'].includes(key)
  })
})

describe('Hexo reading presentation', () => {
  it.each([true, false])(
    'respects reduced-motion=%s for the reading jump',
    reducedMotion => {
      const originalMatchMedia = window.matchMedia
      const scroll = jest.spyOn(window, 'scrollTo').mockImplementation(() => {})
      window.matchMedia = jest.fn(() => ({ matches: reducedMotion }))
      try {
        render(<Hero siteInfo={{ title: 'FXY’S BLOG' }} />)
        fireEvent.click(screen.getByRole('button', { name: '开始阅读' }))
        expect(window.matchMedia).toHaveBeenCalledWith(
          '(prefers-reduced-motion: reduce)'
        )
        expect(scroll).toHaveBeenCalledWith(
          expect.objectContaining({
            behavior: reducedMotion ? 'auto' : 'smooth'
          })
        )
      } finally {
        window.matchMedia = originalMatchMedia
      }
    }
  )

  it('makes nested navigation keyboard-operable and skips collapsed links', () => {
    render(
      <MenuItemCollapse
        link={{
          name: '往期整理',
          show: true,
          subMenus: [{ title: '归档', href: '/archive' }]
        }}
      />
    )
    const toggle = screen.getByRole('button', { name: '往期整理' })
    const link = screen.getByRole('link', { hidden: true })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(link).toHaveAttribute('tabindex', '-1')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: '归档' })).toHaveAttribute(
      'tabindex',
      '0'
    )
    fireEvent.click(toggle)
    expect(link).toHaveAttribute('tabindex', '-1')
  })

  it('uses a semantic hero heading without changing title, cover, dates or tags', () => {
    const { container } = render(<PostHero post={post} siteInfo={{}} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      post.title
    )
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      post.pageCover
    )
    expect(screen.getByText(`发布于: ${post.publishDay}`)).toBeInTheDocument()
    post.tagItems.forEach(tag =>
      expect(screen.getByRole('link', { name: tag.name })).toBeInTheDocument()
    )
    expect(container.querySelector('#header')).not.toHaveClass('h-96')
  })

  it('preserves full-width posts without introducing a hero', () => {
    useGlobal.mockReturnValue({ fullWidth: true, locale: {} })
    render(<PostHero post={post} siteInfo={{}} />)
    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  })

  it('lets cards grow while retaining every tag and the original cover link', () => {
    const { container } = render(<BlogPostCard post={post} index={0} />)
    expect(container.querySelector('#blog-post-card')).not.toHaveClass(
      'md:h-56'
    )
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      post.pageCoverThumbnail
    )
    expect(screen.getByText(post.summary)).toBeInTheDocument()
    post.tagItems.forEach(tag =>
      expect(screen.getByRole('link', { name: tag.name })).toBeInTheDocument()
    )
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      post.title
    )
  })

  it('labels the mobile table-of-contents control correctly', () => {
    const onClick = jest.fn()
    render(<TocDrawerButton onClick={onClick} />)
    const button = screen.getByRole('button', { name: '目录' })
    expect(button).toHaveAttribute('title', '目录')
    button.click()
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
