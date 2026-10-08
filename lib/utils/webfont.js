// FONT_URL accepts either a stylesheet URL or a list of stylesheet URLs.
export const getWebFontUrls = value => [
  ...new Set(
    (Array.isArray(value) ? value : [value])
      .filter(url => typeof url === 'string' && url.trim())
      .map(url => url.trim())
  )
]

// Keep loaded stylesheets across route changes, but never insert the same one twice.
export const loadWebFontStylesheets = urls => {
  urls.forEach(url => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = url
    if (
      Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(
        existing =>
          existing.href === link.href &&
          !existing.disabled &&
          !existing.sheet?.disabled &&
          (!existing.media || existing.media.trim().toLowerCase() === 'all')
      )
    ) {
      return
    }

    // A later mount may retry a failed stylesheet without duplicating working ones.
    link.onerror = () => link.remove()
    document.head.appendChild(link)
  })
}
