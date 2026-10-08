import { siteConfig } from '@/lib/config'
import { useGlobal } from '@/lib/global'
import { useRouter } from 'next/router'
import { useHexoGlobal } from '..'

/**
 * 搜索按钮
 * @returns
 */
export default function SearchButton(props) {
  const { locale } = useGlobal()
  const router = useRouter()
  const { searchModal } = useHexoGlobal()

  function handleSearch(event) {
    if (siteConfig('ALGOLIA_APP_ID')) {
      searchModal.current?.openSearch(event.currentTarget)
    } else {
      router.push('/search')
    }
  }

  const hasSearchModal = Boolean(siteConfig('ALGOLIA_APP_ID'))

  return (
    <button
      type='button'
      onClick={handleSearch}
      title={locale.NAV.SEARCH}
      aria-label={locale.NAV.SEARCH}
      aria-haspopup={hasSearchModal ? 'dialog' : undefined}
      aria-controls={hasSearchModal ? 'algolia-search-dialog' : undefined}
      className='cursor-pointer dark:text-white hover:bg-black hover:bg-opacity-10 rounded-full w-10 h-10 flex justify-center items-center duration-200 transition-all'
    >
      <i aria-hidden='true' className='fa-solid fa-magnifying-glass' />
    </button>
  )
}
