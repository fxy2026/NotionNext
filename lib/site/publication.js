/** Public listings include Published entries; Invisible pages remain directly routable. */
export const isPublishedPage = page =>
  Boolean(page?.slug) && page?.status === 'Published'

export const isPublishedPost = page =>
  isPublishedPage(page) && page?.type === 'Post'
