import { siteConfig } from '@/lib/config'
import { useGlobal } from '@/lib/global'
import { saveDarkModeToLocalStorage } from '@/themes/theme'
import CONFIG from '../config'

/**
 * 深色模式按钮
 */
export default function ButtonDarkModeFloat() {
  const { isDarkMode, updateDarkMode } = useGlobal()

  if (!siteConfig('HEXO_WIDGET_DARK_MODE', null, CONFIG)) {
    return <></>
  }

  // 用户手动设置主题
  const handleChangeDarkMode = () => {
    const newStatus = !isDarkMode
    saveDarkModeToLocalStorage(newStatus)
    updateDarkMode(newStatus)
    const htmlElement = document.getElementsByTagName('html')[0]
    htmlElement.classList?.remove(newStatus ? 'light' : 'dark')
    htmlElement.classList?.add(newStatus ? 'dark' : 'light')
  }

  return (
    <button
      type='button'
      aria-label={`${isDarkMode ? 'Light Mode' : 'Dark Mode'}`}
      onClick={handleChangeDarkMode}
      title={`${isDarkMode ? 'Light Mode' : 'Dark Mode'}`}
      className={
        'flex justify-center items-center w-11 h-11 lg:w-7 lg:h-7 text-center transform hover:scale-105 duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'
      }
    >
      <i
        aria-hidden='true'
        id='darkModeButton'
        className={`${isDarkMode ? 'fa-sun' : 'fa-moon'} fas text-xs`}
      />
    </button>
  )
}
