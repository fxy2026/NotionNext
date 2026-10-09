import { useCallback, useEffect, useRef } from 'react'
import Catalog from './Catalog'

/** The floating contents panel is only used below Hexo's 960px lg breakpoint. */
const TocDrawer = ({ post, isOpen, onClose, onNavigate, triggerRef }) => {
  const panelRef = useRef(null)
  const readingTargetRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  const releaseReadingTarget = useCallback(() => {
    const target = readingTargetRef.current
    if (target?.getAttribute('tabindex') === '-1') {
      target.removeAttribute('tabindex')
    }
    readingTargetRef.current = null
  }, [])

  useEffect(() => {
    closeRef.current?.()
    return releaseReadingTarget
  }, [post?.id, releaseReadingTarget])

  useEffect(() => {
    if (!isOpen) return

    const desktop = window.matchMedia('(min-width: 960px)')
    if (desktop.matches) {
      closeRef.current?.()
      return
    }

    // Wait for paint, but never steal focus from a newer interaction.
    const entryFocus = document.activeElement
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (document.activeElement === entryFocus) {
          panelRef.current
            ?.querySelector('a[href]')
            ?.focus({ preventScroll: true })
        }
      })
    })
    const closeOnDesktop = event => {
      if (event.matches) closeRef.current?.()
    }
    desktop.addEventListener('change', closeOnDesktop)
    return () => {
      cancelAnimationFrame(frame)
      desktop.removeEventListener('change', closeOnDesktop)
    }
  }, [isOpen])

  const dismiss = () => {
    onClose?.()
    const trigger = triggerRef?.current
    if (trigger?.isConnected && trigger.getClientRects().length > 0) {
      trigger.focus({ preventScroll: true })
    }
  }

  const selectAnchor = event => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      window.matchMedia('(min-width: 960px)').matches
    ) {
      return
    }
    const link = event.target.closest('a[href^="#"]')
    if (!link || !event.currentTarget.contains(link)) return
    let target
    try {
      target = document.getElementById(decodeURIComponent(link.hash.slice(1)))
    } catch {
      return
    }
    if (!target) return

    // Keep native hash/history/scroll behavior, and move keyboard reading focus
    // to the destination rather than back to the floating toggle.
    if (readingTargetRef.current !== target) releaseReadingTarget()
    if (!target.hasAttribute('tabindex')) {
      target.setAttribute('tabindex', '-1')
      // Search may temporarily take focus and then return here. Keep only this
      // reading target focusable until another selection or article cleanup.
      readingTargetRef.current = target
    }
    target.focus({ preventScroll: true })
    onClose?.()
    onNavigate?.()
  }

  return (
    <>
      <div className='fixed top-0 right-0 z-40'>
        <div
          id='hexo-toc-drawer'
          ref={panelRef}
          hidden={!isOpen}
          onClick={selectAnchor}
          onKeyDown={event => {
            if (isOpen && event.key === 'Escape' && !event.defaultPrevented) {
              event.preventDefault()
              event.stopPropagation()
              dismiss()
            }
          }}
          className='shadow-card animate__animated animate__faster animate__slideInRight w-60 duration-200 fixed right-12 bottom-12 rounded py-2 bg-white dark:bg-gray-900'
        >
          {post && (
            <div className='dark:text-gray-400 text-gray-600'>
              <Catalog toc={post.toc} />
            </div>
          )}
        </div>
      </div>
      <div
        id='right-drawer-background'
        aria-hidden='true'
        hidden={!isOpen}
        className='fixed top-0 left-0 z-30 w-full h-full'
        onClick={dismiss}
      />
    </>
  )
}

export default TocDrawer
