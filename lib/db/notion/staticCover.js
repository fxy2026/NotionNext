// These versioned, same-origin assets are reused across multiple article covers.
// Keep the author's full URL (including query and fragment) as the cache key.
const STATIC_COVER_URLS = new Set(
  ['geometry', 'science', 'thought', 'tools', 'writing'].map(
    family => `https://www.xpy.me/images/covers/fxy-${family}-2026.webp`
  )
)

export const isReusableStaticCover = image => {
  if (typeof image !== 'string') return false

  try {
    const url = new URL(image)
    const assetUrl = `${url.origin}${url.pathname}`
    return (
      !url.username &&
      !url.password &&
      STATIC_COVER_URLS.has(assetUrl) &&
      image.split(/[?#]/, 1)[0] === assetUrl
    )
  } catch {
    return false
  }
}
