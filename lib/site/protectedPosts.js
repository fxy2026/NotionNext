// Temporary, owner-approved pause for these five root articles only.
// IDs, titles and slugs were verified from public metadata; no passwords belong here.
const PAUSED_POSTS = [
  ['185a18e7-c6be-80e2-ac8a-e3a9b38be389', 'Video2025', 'video2025'],
  ['1a3a18e7-c6be-80f2-a606-f7e6f55ac045', '春季视频', '春季视频'],
  ['c340487b-971a-4b17-896b-9d62d91f79aa', 'Videos', 'videos'],
  ['c925f8c2-f6ec-4537-9b57-4210997b9e8c', '论文架构', 'lunwen'],
  ['f7ed1283-7712-44bc-b6d2-f4d950802c1d', '有机化学', 'organic']
]

export function normalizePageId(value) {
  if (typeof value !== 'string') return ''
  const id = value.trim().replace(/-/g, '').toLowerCase()
  return /^[a-f0-9]{32}$/.test(id) ? id : ''
}

const pausedById = new Map(
  PAUSED_POSTS.map(([id, title, slug]) => [
    normalizePageId(id),
    { id, title, slug }
  ])
)

export function isBodyPaused(postOrId) {
  const id = typeof postOrId === 'object' ? postOrId?.id : postOrId
  return pausedById.has(normalizePageId(id))
}

const PUBLIC_FIELDS = [
  'short_id',
  'title',
  'name',
  'slug',
  'href',
  'target',
  'type',
  'status',
  'summary',
  'description',
  'pageIcon',
  'icon',
  'pageCover',
  'pageCoverThumbnail',
  'publishDate',
  'publishDay',
  'lastEditedDate',
  'lastEditedDay',
  'category',
  'tags'
]

const isScalar = value =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value)

export function pausedPostMetadata(id, publicPost = {}) {
  const known = pausedById.get(normalizePageId(id))
  if (!known) return null
  const result = { ...known, type: 'Post', status: 'Published' }
  for (const field of PUBLIC_FIELDS) {
    const value = publicPost?.[field]
    if (isScalar(value)) result[field] = value
    else if (Array.isArray(value) && value.every(isScalar))
      result[field] = [...value]
  }
  if (publicPost?.date && typeof publicPost.date === 'object') {
    result.date = {}
    for (const key of [
      'start_date',
      'end_date',
      'start_time',
      'end_time',
      'time_zone'
    ]) {
      if (isScalar(publicPost.date[key]))
        result.date[key] = publicPost.date[key]
    }
  }
  if (Array.isArray(publicPost?.tagItems)) {
    result.tagItems = publicPost.tagItems.map(tag => ({
      name: typeof tag?.name === 'string' ? tag.name : '',
      color: typeof tag?.color === 'string' ? tag.color : ''
    }))
  }
  return { ...result, id: known.id, bodyPaused: true }
}

function blockValue(entry) {
  return entry?.value?.value || entry?.value || entry
}

function recordId(id) {
  return normalizePageId(id) || String(id || '')
}

// Cached record maps can include a paused root and its descendants even when
// the requested article is public. Remove that subtree before serialization.
function blockedBlockIds(blocks) {
  const blocked = new Set([...pausedById.keys()])
  const entries = Object.entries(blocks)
  const byId = new Map(
    entries.map(([key, entry]) => [recordId(key), blockValue(entry)])
  )
  const referenceOwners = new Map()
  for (const [key, entry] of entries) {
    const value = blockValue(entry)
    const owner = recordId(value?.id || key)
    const refs = [
      value?.collection_id,
      value?.format?.collection_pointer?.id,
      value?.collection_view_id,
      value?.format?.collection_view_pointer?.id,
      ...(Array.isArray(value?.view_ids) ? value.view_ids : [])
    ].filter(Boolean)
    for (const ref of refs) {
      const id = recordId(ref)
      if (!referenceOwners.has(id)) referenceOwners.set(id, new Set())
      referenceOwners.get(id).add(owner)
    }
  }
  const isOtherPage = id => {
    const value = byId.get(recordId(id))
    return value?.type === 'page' && !isBodyPaused(value.id || id)
  }
  let changed = true
  while (changed) {
    changed = false
    for (const [key, entry] of entries) {
      const value = blockValue(entry)
      const id = recordId(value?.id || key)
      // Separate, unlisted child pages are outside the five-root pause scope.
      const blockedCollectionRow =
        value?.parent_table === 'collection' &&
        blocked.has(recordId(value?.parent_id))
      if (isOtherPage(id) && !blocked.has(id) && !blockedCollectionRow) continue
      if (blocked.has(id) || blocked.has(recordId(value?.parent_id))) {
        const content = Array.isArray(value?.content) ? value.content : []
        for (const candidate of [
          id,
          recordId(key),
          ...content.filter(child => !isOtherPage(child)).map(recordId)
        ]) {
          if (!blocked.has(candidate)) {
            blocked.add(candidate)
            changed = true
          }
        }
      }
    }
    // Remove tables exclusively attached to paused blocks, but do not remove a
    // collection/view that is also referenced by a surviving public block.
    for (const [id, owners] of referenceOwners) {
      if (!blocked.has(id) && [...owners].every(owner => blocked.has(owner))) {
        blocked.add(id)
        changed = true
      }
    }
  }
  return blocked
}

export function sanitizePublicData(value, inheritedBlockedIds) {
  if (Array.isArray(value))
    return value.map(item => sanitizePublicData(item, inheritedBlockedIds))
  if (!value || typeof value !== 'object') return value
  const ownId = recordId(blockValue(value)?.id)
  if (inheritedBlockedIds?.has(ownId)) return null
  if (isBodyPaused(value)) return pausedPostMetadata(value.id, value)
  // Older cached navigation rows have their ID replaced by getShortId(id).
  const cachedPaused =
    !value.id &&
    PAUSED_POSTS.find(
      ([id]) =>
        String(value.short_id || '').toLowerCase() === id.substring(14) ||
        (normalizePageId(value.short_id) &&
          normalizePageId(value.short_id) === normalizePageId(id))
    )
  if (cachedPaused) return pausedPostMetadata(cachedPaused[0], value)
  const hasBlocks =
    value.block &&
    typeof value.block === 'object' &&
    !Array.isArray(value.block)
  const blockedIds = hasBlocks
    ? new Set([...(inheritedBlockedIds || []), ...blockedBlockIds(value.block)])
    : inheritedBlockedIds
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !blockedIds?.has(recordId(key)))
      .map(([key, entry]) => {
        if (isBodyPaused(key))
          return [key, pausedPostMetadata(key, blockValue(entry))]
        if (key === 'block' && hasBlocks) {
          const blocks = Object.fromEntries(
            Object.entries(entry)
              .filter(
                ([id, block]) =>
                  !blockedIds.has(recordId(id)) &&
                  !blockedIds.has(recordId(blockValue(block)?.id))
              )
              .map(([id, block]) => [id, sanitizePublicData(block, blockedIds)])
          )
          return [key, blocks]
        }
        return [key, sanitizePublicData(entry, blockedIds)]
      })
  )
}
