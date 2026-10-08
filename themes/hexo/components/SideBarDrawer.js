import { useRouter } from 'next/router'
import { useEffect, useRef } from 'react'

/** Mobile navigation: keep keyboard focus inside while the drawer is open. */
const SideBarDrawer = ({
  children,
  isOpen,
  onClose,
  triggerRef,
  ariaLabel,
  closeLabel = 'Close navigation',
  className = ''
}) => {
  const router = useRouter()
  const panelRef = useRef(null)

  useEffect(() => {
    const closeOnNavigation = () => onClose?.()
    router.events.on('routeChangeComplete', closeOnNavigation)
    return () => router.events.off('routeChangeComplete', closeOnNavigation)
  }, [router.events, onClose])

  useEffect(() => {
    if (!isOpen) return

    const panel = panelRef.current
    const returnTarget = triggerRef?.current || document.activeElement
    const focusableElements = () =>
      Array.from(
        panel?.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
        ) || []
      ).filter(
        element =>
          element.tabIndex >= 0 &&
          !element.closest('[aria-hidden="true"]') &&
          element.getClientRects().length > 0
      )

    // Allow the open visibility state to paint before moving focus. Focusing
    // during the opening frame can fail while the drawer is still hidden.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        ;(focusableElements()[0] || panel)?.focus({ preventScroll: true })
      })
    })
    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
      } else if (event.key === 'Tab') {
        const elements = focusableElements()
        const first = elements[0]
        const last = elements[elements.length - 1]
        if (!first) {
          event.preventDefault()
          panel?.focus()
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === panel ||
            !panel?.contains(document.activeElement))
        ) {
          event.preventDefault()
          last.focus()
        } else if (
          !event.shiftKey &&
          (document.activeElement === last ||
            !panel?.contains(document.activeElement))
        ) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    const desktop = window.matchMedia('(min-width: 960px)')
    const closeOnDesktop = event => {
      if (event.matches) onClose?.()
    }
    desktop.addEventListener('change', closeOnDesktop)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      desktop.removeEventListener('change', closeOnDesktop)
      if (returnTarget?.isConnected) {
        returnTarget.focus({ preventScroll: true })
      }
    }
  }, [isOpen, onClose, triggerRef])

  return (
    <div id='sidebar-wrapper' className={`block lg:hidden top-0 ${className}`}>
      <div
        id='sidebar-drawer'
        ref={panelRef}
        role={isOpen ? 'dialog' : undefined}
        aria-modal={isOpen ? true : undefined}
        aria-label={ariaLabel}
        aria-hidden={!isOpen}
        tabIndex={-1}
        className={`${isOpen ? 'mr-0 w-72 visible' : '-mr-72 max-w-side invisible'} bg-gray-50 right-0 top-0 dark:bg-hexo-black-gray shadow-black shadow-lg flex flex-col transition-[margin-right] duration-300 fixed h-full overflow-y-scroll scroll-hidden z-30`}
      >
        <div className='flex items-center justify-between px-4 pt-3 text-gray-700 dark:text-gray-200'>
          <span className='text-sm font-medium'>{ariaLabel}</span>
          <button
            type='button'
            aria-label={closeLabel}
            onClick={onClose}
            className='flex h-11 w-11 items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10'
          >
            <i aria-hidden='true' className='fas fa-times' />
          </button>
        </div>
        {children}
      </div>
      <div
        id='sidebar-drawer-background'
        aria-hidden='true'
        onClick={onClose}
        className={`${isOpen ? 'block' : 'hidden'} animate__animated animate__fadeIn fixed top-0 duration-300 left-0 z-20 w-full h-full bg-black/70`}
      />
    </div>
  )
}
export default SideBarDrawer
