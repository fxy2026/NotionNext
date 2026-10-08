import LazyImage from '@/components/LazyImage'
import { siteConfig } from '@/lib/config'
import SmartLink from '@/components/SmartLink'
import { useRouter } from 'next/router'
import CONFIG from '../config'
import { BlogPostCardInfo } from './BlogPostCardInfo'

const BlogPostCard = ({ index, post, showSummary, siteInfo }) => {
  const router = useRouter()
  const showHomeBanner =
    router.route === '/' && siteConfig('HEXO_HOME_BANNER_ENABLE', null, CONFIG)
  const showPreview =
    siteConfig('HEXO_POST_LIST_PREVIEW', null, CONFIG) && post.blockMap
  if (
    post &&
    !post.pageCoverThumbnail &&
    siteConfig('HEXO_POST_LIST_COVER_DEFAULT', null, CONFIG)
  ) {
    post.pageCoverThumbnail = siteInfo?.pageCover
  }
  const showPageCover =
    siteConfig('HEXO_POST_LIST_COVER', null, CONFIG) &&
    post?.pageCoverThumbnail &&
    !showPreview
  //   const delay = (index % 2) * 200

  return (
    <div
      className={`${siteConfig('HEXO_POST_LIST_COVER_HOVER_ENLARGE', null, CONFIG) ? ' hover:scale-110 transition-all duration-150' : ''}`}
    >
      <div
        key={post.id}
        id='blog-post-card'
        className={`hexo-post-card group w-full flex justify-between md:flex-row flex-col-reverse shadow-sm ${siteConfig('HEXO_POST_LIST_IMG_CROSSOVER', null, CONFIG) && index % 2 === 1 ? 'md:flex-row-reverse' : ''}
                    overflow-hidden border dark:border-black rounded-xl bg-white dark:bg-hexo-black-gray`}
      >
        {/* 文字内容 */}
        <BlogPostCardInfo
          index={index}
          post={post}
          showPageCover={showPageCover}
          showPreview={showPreview}
          showSummary={showSummary}
        />

        {/* 图片封面 */}
        {showPageCover && (
          <div className='hexo-post-cover md:w-5/12 shrink-0 overflow-hidden'>
            <SmartLink href={post?.href}>
              <>
                <LazyImage
                  priority={index === 0 && !showHomeBanner}
                  alt={post?.title}
                  src={post?.pageCoverThumbnail}
                  className='w-full object-cover object-center group-hover:scale-110 duration-500'
                />
              </>
            </SmartLink>
          </div>
        )}
      </div>
    </div>
  )
}

export default BlogPostCard
