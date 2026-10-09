import { siteConfig } from '@/lib/config'
import CONFIG from '../config'

/**
 * 跳转到评论区
 * @returns {JSX.Element}
 * @constructor
 */
const ButtonJumpToComment = () => {
  if (!siteConfig('HEXO_WIDGET_TO_COMMENT', null, CONFIG)) {
    return <></>
  }

  function navToComment() {
    if (document.getElementById('comment')) {
      window.scrollTo({
        top: document.getElementById('comment').offsetTop,
        behavior: 'smooth'
      })
    }
    // 兼容性不好
    // const commentElement = document.getElementById('comment')
    // if (commentElement) {
    // commentElement?.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' })
  }

  return (
    <button
      type='button'
      aria-label='Jump to Comment'
      className='flex space-x-1 items-center justify-center transform hover:scale-105 duration-200 w-11 h-11 lg:w-7 lg:h-7 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'
      onClick={navToComment}
      title='Jump to Comment'
    >
      <i aria-hidden='true' className='fas fa-comment text-xs' />
    </button>
  )
}

export default ButtonJumpToComment
