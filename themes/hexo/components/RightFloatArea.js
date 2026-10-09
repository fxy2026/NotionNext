import { useRouter } from 'next/router'
import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import ButtonDarkModeFloat from './ButtonFloatDarkMode'
import ButtonJumpToTop from './ButtonJumpToTop'

/** Keep reading actions compact on mobile without changing the article width. */
export default function RightFloatArea({ floatSlot, cRef, onCloseToc }) {
  const router = useRouter()
  const [showFloatButton, setShowFloatButton] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [hasFocus, setHasFocus] = useState(false)
  const [returnFocusPending, setReturnFocusPending] = useState(false)
  const focusAfterResizeRef = useRef(false)
  const returnActionRef = useRef(null)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const actionsRef = useRef(null)
  const closeTocRef = useRef(onCloseToc)
  closeTocRef.current = onCloseToc

  useImperativeHandle(
    cRef,
    () => ({
      closeMobileTools() {
        setIsOpen(false)
        setReturnFocusPending(false)
      },
      closeForSearch(opener) {
        returnActionRef.current = null
        setIsOpen(false)
        setReturnFocusPending(false)
        // A search opened from either panel must return to a visible control.
        if (
          rootRef.current?.contains(opener) ||
          opener?.closest?.('#hexo-toc-drawer')
        ) {
          const action = opener?.closest?.('button, a[href]')
          if (
            action !== triggerRef.current &&
            action?.getAttribute('aria-controls') !== 'hexo-toc-drawer'
          ) {
            returnActionRef.current = action
          }
          setReturnFocusPending(true)
          // Relay focus after dismissal, so a viewport change cannot hide the return target.
          return rootRef.current
        }
        return null
      }
    }),
    []
  )

  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 960px)')
    const updateViewport = () => {
      focusAfterResizeRef.current =
        desktop.matches &&
        (document.activeElement === triggerRef.current ||
          document.activeElement?.closest?.('#hexo-toc-drawer'))
      setIsMobile(!desktop.matches)
      setIsOpen(false)
      if (
        !desktop.matches &&
        actionsRef.current?.contains(document.activeElement)
      ) {
        triggerRef.current?.focus({ preventScroll: true })
      }
    }
    updateViewport()
    desktop.addEventListener('change', updateViewport)
    return () => desktop.removeEventListener('change', updateViewport)
  }, [])

  const focusDesktopAction = preferred => {
    if (
      preferred?.isConnected &&
      actionsRef.current?.contains(preferred) &&
      preferred.getClientRects().length > 0
    ) {
      preferred.focus({ preventScroll: true })
      return
    }
    actionsRef.current
      ?.querySelector('button:not([aria-controls="hexo-toc-drawer"]), a[href]')
      ?.focus({ preventScroll: true })
  }

  useEffect(() => {
    if (!isMobile && focusAfterResizeRef.current) {
      focusAfterResizeRef.current = false
      focusDesktopAction()
    }
  }, [isMobile])

  useEffect(() => {
    let frame
    const updateVisibility = () => {
      frame = undefined
      const target =
        document.getElementById('wrapper') || document.documentElement
      const scrollY =
        window.pageYOffset || document.documentElement.scrollTop || 0
      const viewportHeight =
        window.innerHeight || document.documentElement.clientHeight || 0
      const fullHeight = Math.max(
        1,
        (target?.clientHeight || 0) - viewportHeight
      )
      const percent = Math.min(
        100,
        Math.max(0, Math.round((scrollY / fullHeight) * 100))
      )
      setShowFloatButton(scrollY > 100 && percent > 0)
    }
    const onScroll = () => {
      if (frame === undefined) frame = requestAnimationFrame(updateVisibility)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    updateVisibility()
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame !== undefined) cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    const closeOnRoute = () => {
      setIsOpen(false)
      setReturnFocusPending(false)
      closeTocRef.current?.()
      if (
        !window.matchMedia('(min-width: 960px)').matches &&
        (actionsRef.current?.contains(document.activeElement) ||
          document.activeElement?.closest?.('#hexo-toc-drawer'))
      ) {
        triggerRef.current?.focus({ preventScroll: true })
      }
    }
    router.events.on('routeChangeStart', closeOnRoute)
    return () => router.events.off('routeChangeStart', closeOnRoute)
  }, [router.events])

  useEffect(() => {
    if (!isMobile || !isOpen) return
    const closeOutside = event => {
      if (rootRef.current?.contains(event.target)) return
      // The TOC owns its backdrop dismissal and restores focus to its toggle.
      if (event.target.closest?.('#hexo-toc-drawer, #right-drawer-background'))
        return
      setIsOpen(false)
      closeTocRef.current?.()
      if (
        actionsRef.current?.contains(document.activeElement) ||
        document.activeElement?.closest?.('#hexo-toc-drawer')
      ) {
        // Do not cancel pointer focus: a focusable outside target still wins.
        triggerRef.current?.focus({ preventScroll: true })
      }
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [isMobile, isOpen])

  const close = (restoreFocus = false) => {
    setIsOpen(false)
    closeTocRef.current?.()
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true })
  }
  const show =
    showFloatButton || returnFocusPending || hasFocus || (isMobile && isOpen)

  return (
    <div
      ref={rootRef}
      id='hexo-reading-tools'
      tabIndex={-1}
      onFocusCapture={event => {
        setHasFocus(true)
        setReturnFocusPending(false)
        if (event.target === event.currentTarget) {
          const preferred = returnActionRef.current
          returnActionRef.current = null
          if (isMobile) triggerRef.current?.focus({ preventScroll: true })
          else focusDesktopAction(preferred)
        }
      }}
      onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setHasFocus(false)
      }}
      onKeyDown={event => {
        if (
          isMobile &&
          isOpen &&
          event.key === 'Escape' &&
          !event.defaultPrevented
        ) {
          event.preventDefault()
          event.stopPropagation()
          close(true)
        }
      }}
      className={
        (show ? 'opacity-100 ' : 'invisible opacity-0 ') +
        'duration-300 transition-opacity bottom-[max(0.25rem,env(safe-area-inset-bottom))] lg:bottom-12 right-1 fixed justify-end z-20 text-white bg-indigo-500 dark:bg-hexo-black-gray rounded-sm'
      }
    >
      <div
        ref={actionsRef}
        id='hexo-reading-tools-actions'
        hidden={isMobile && !isOpen}
        onClick={event => {
          const action = event.target.closest('button, a[href]')
          if (
            !isMobile ||
            !action ||
            action.getAttribute('aria-controls') === 'hexo-toc-drawer'
          )
            return
          close(actionsRef.current?.contains(document.activeElement))
        }}
        className={
          (isOpen ? 'flex ' : 'hidden lg:flex ') +
          'justify-center flex-col items-center cursor-pointer'
        }
      >
        <ButtonDarkModeFloat />
        {floatSlot}
        <ButtonJumpToTop />
      </div>
      <button
        ref={triggerRef}
        type='button'
        aria-label='阅读工具'
        title='阅读工具'
        aria-controls='hexo-reading-tools-actions'
        aria-expanded={isOpen}
        onClick={() => {
          if (isOpen) close()
          else setIsOpen(true)
        }}
        className='flex lg:hidden w-11 h-11 items-center justify-center cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2'
      >
        <i
          aria-hidden='true'
          className={
            isOpen ? 'fas fa-times text-xs' : 'fas fa-ellipsis-h text-xs'
          }
        />
      </button>
    </div>
  )
}
