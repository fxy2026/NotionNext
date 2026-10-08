import { siteConfig } from '@/lib/config'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react'
import { useHotkeys } from 'react-hotkeys-hook'

const LoadingContext = createContext(null)

function SearchLoading({ error, retry }) {
  const cancel = useContext(LoadingContext)
  return (
    <div className='fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border bg-white p-4 text-black shadow-lg dark:bg-gray-800 dark:text-white'>
      <p role={error ? 'alert' : 'status'}>
        {error ? '搜索加载失败，请重试。' : '正在加载搜索…'}
      </p>
      {error && (
        <button
          type='button'
          className='mr-4 underline'
          onClick={() => retry()}
        >
          重试
        </button>
      )}
      <button type='button' className='underline' onClick={cancel}>
        取消
      </button>
    </div>
  )
}

const AlgoliaSearchModal = dynamic(
  () => import('@/components/AlgoliaSearchModal'),
  { ssr: false, loading: SearchLoading }
)

/** Keep the heavy search module idle until the first explicit search intent. */
export default function LazyAlgoliaSearchModal({
  cRef,
  onBeforeOpen,
  ...props
}) {
  const router = useRouter()
  const modalRef = useRef(null)
  const pendingRef = useRef(null)
  const requestedRef = useRef(false)
  const readyRef = useRef(false)
  const enterDownRef = useRef(false)
  const restoringFocusRef = useRef(false)
  const [requested, setRequested] = useState(false)

  const openSearch = useCallback(
    trigger => {
      if (restoringFocusRef.current || !siteConfig('ALGOLIA_APP_ID')) return
      // Repeated pending intent keeps the original opener and in-flight load.
      if (!readyRef.current && requestedRef.current) return
      const opener = trigger || document.activeElement
      // Let the layout release another panel and supply a visible return target.
      const returnTarget = onBeforeOpen?.(opener) || opener
      if (readyRef.current) {
        modalRef.current?.openSearch(returnTarget)
        return
      }
      pendingRef.current = { trigger: returnTarget }
      requestedRef.current = true
      setRequested(true)
    },
    [onBeforeOpen]
  )

  useHotkeys(
    'ctrl+k',
    event => {
      if (!siteConfig('ALGOLIA_APP_ID')) return
      event.preventDefault()
      openSearch()
    },
    { enableOnFormTags: true },
    [openSearch]
  )

  const cancelPending = useCallback(({ restoreFocus = true } = {}) => {
    if (readyRef.current) return
    const trigger = pendingRef.current?.trigger
    pendingRef.current = null
    requestedRef.current = false
    setRequested(false)
    if (restoreFocus && trigger?.isConnected) {
      restoringFocusRef.current = true
      try {
        trigger.focus({ preventScroll: true })
      } finally {
        restoringFocusRef.current = enterDownRef.current
      }
    }
  }, [])

  useImperativeHandle(
    cRef,
    () => ({
      openSearch,
      // A newer panel can dismiss search without restoring its stale opener.
      closeSearch: options => {
        if (readyRef.current) modalRef.current?.closeSearch(options)
        else cancelPending(options)
      }
    }),
    [openSearch, cancelPending]
  )

  const onReady = useCallback(() => {
    // Run after initial passive effects (including StrictMode's replay), so
    // the modal's initial route-close effect cannot discard the first intent.
    queueMicrotask(() => {
      if (!requestedRef.current || !modalRef.current) return
      readyRef.current = true
      const pending = pendingRef.current
      pendingRef.current = null
      if (pending) modalRef.current.openSearch(pending.trigger)
    })
  }, [])

  useEffect(() => {
    const onKeyDown = event => {
      if (event.isComposing || event.keyCode === 229) return
      if (requestedRef.current && !readyRef.current && event.key === 'Enter') {
        enterDownRef.current = true
      }
      if (requestedRef.current && !readyRef.current && event.key === 'Escape') {
        event.preventDefault()
        cancelPending()
      }
    }
    const releaseEnter = event => {
      if (event.type === 'blur' || event.key === 'Enter') {
        enterDownRef.current = false
        restoringFocusRef.current = false
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', releaseEnter)
    window.addEventListener('blur', releaseEnter)
    router.events.on('routeChangeStart', cancelPending)
    router.events.on('hashChangeStart', cancelPending)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('keyup', releaseEnter)
      window.removeEventListener('blur', releaseEnter)
      router.events.off('routeChangeStart', cancelPending)
      router.events.off('hashChangeStart', cancelPending)
    }
  }, [router.events, cancelPending])

  useEffect(
    () => () => {
      pendingRef.current = null
      requestedRef.current = false
    },
    []
  )

  return (
    <LoadingContext.Provider value={cancelPending}>
      {requested && (
        <AlgoliaSearchModal
          {...props}
          cRef={modalRef}
          enableShortcut={false}
          onReady={onReady}
        />
      )}
    </LoadingContext.Provider>
  )
}
