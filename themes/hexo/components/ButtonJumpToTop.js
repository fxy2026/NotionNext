import { siteConfig } from '@/lib/config'
import { useGlobal } from '@/lib/global'
import CONFIG from '../config'

/**
 * 跳转到网页顶部
 * 当屏幕下滑500像素后会出现该控件
 * @param targetRef 关联高度的目标html标签
 * @param showPercent 是否显示百分比
 * @returns {JSX.Element}
 * @constructor
 */
const ButtonJumpToTop = ({ showPercent = true, percent }) => {
  const { locale } = useGlobal()

  if (!siteConfig('HEXO_WIDGET_TO_TOP', null, CONFIG)) {
    return <></>
  }
  return (
    <button
      type='button'
      aria-label={locale.POST.TOP}
      title={locale.POST.TOP}
      className='flex flex-col lg:block space-x-1 items-center justify-center transform hover:scale-105 duration-200 w-11 h-11 lg:w-7 lg:h-auto lg:pb-1 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <span className='block'>
        <i aria-hidden='true' className='fas fa-arrow-up text-xs' />
      </span>
      {showPercent && <div className='text-xs hidden lg:block'>{percent}</div>}
    </button>
  )
}

export default ButtonJumpToTop
