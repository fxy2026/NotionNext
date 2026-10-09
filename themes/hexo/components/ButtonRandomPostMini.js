import { siteConfig } from '@/lib/config'
import { useGlobal } from '@/lib/global'
import { useRouter } from 'next/router'

/**
 * 随机跳转到一个文章
 */
export default function ButtonRandomPostMini(props) {
  const { latestPosts } = props
  const router = useRouter()
  const { locale } = useGlobal()
  /**
   * 随机跳转文章
   */
  function handleClick() {
    const randomIndex = Math.floor(Math.random() * latestPosts.length)
    const randomPost = latestPosts[randomIndex]
    router.push(`${siteConfig('SUB_PATH', '')}/${randomPost?.slug}`)
  }

  return (
    <button
      type='button'
      aria-label={locale.MENU.WALK_AROUND}
      title={locale.MENU.WALK_AROUND}
      className='flex space-x-1 items-center justify-center transform hover:scale-105 duration-200 w-11 h-11 lg:w-7 lg:h-7 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'
      onClick={handleClick}
    >
      <i aria-hidden='true' className='fa-solid fa-podcast'></i>
    </button>
  )
}
