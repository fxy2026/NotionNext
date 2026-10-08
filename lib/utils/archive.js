/**
 * Use the author's Notion calendar month for archive groups and links.
 * Posts without a date use the UTC month of publishDate, so server and browser
 * time zones cannot produce different archive anchors. Display dates and the
 * underlying timestamps are intentionally unchanged.
 */
export function getArchiveMonth(post) {
  const startDate = post?.date?.start_date
  if (typeof startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    const date = new Date(`${startDate}T00:00:00.000Z`)
    if (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === startDate
    ) {
      return startDate.slice(0, 7)
    }
  }

  const timestamp = post?.publishDate
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return ''

  const date = new Date(timestamp)
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 7) : ''
}
