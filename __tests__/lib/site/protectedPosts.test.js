/** @jest-environment node */

// Every value in these fixtures is synthetic. The five IDs are public metadata
// identifiers; these tests never acquire a real page, password, hash, or body.
import {
  isBodyPaused,
  normalizePageId,
  pausedPostMetadata,
  sanitizePublicData
} from '@/lib/site/protectedPosts'
import {
  fetchNotionPageBlocks,
  getPageWithRetry
} from '@/lib/db/notion/getPostBlocks'
import { fetchPageFromNotion } from '@/lib/db/notion/getNotionPost'
import notionAPI from '@/lib/db/notion/getNotionAPI'
import { getOrSetDataWithCache } from '@/lib/cache/cache_manager'
import { processPostData } from '@/lib/utils/post'
import { getPageContentText } from '@/lib/db/notion/getPageContentText'
import { getPageTableOfContents } from '@/lib/db/notion/getPageTableOfContents'
import { uploadDataToAlgolia } from '@/lib/plugins/algolia'

jest.mock('@/blog.config', () => ({
  __esModule: true,
  default: {
    LANG: 'zh-CN',
    ALGOLIA_APP_ID: 'synthetic-app',
    LINK: 'https://example.invalid'
  }
}))
jest.mock('@/lib/db/notion/getNotionAPI', () => ({
  __esModule: true,
  default: {
    getPage: jest.fn(),
    getSignedFileUrls: jest.fn(),
    getRecordValues: jest.fn()
  }
}))
jest.mock('@/lib/cache/cache_manager', () => ({
  getDataFromCache: jest.fn(),
  getOrSetDataWithCache: jest.fn(),
  setDataToCache: jest.fn()
}))
jest.mock('notion-utils', () => ({
  idToUuid: value => value,
  getBlockValue: entry => entry?.value?.value || entry?.value || entry
}))
jest.mock('p-limit', () => () => task => task())
jest.mock('react-notion-x', () => ({}))
jest.mock('algoliasearch', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    initIndex: jest.fn(() => ({
      getObject: jest.fn(),
      saveObject: jest.fn(),
      deleteObject: jest.fn()
    }))
  }))
}))
jest.mock('@/lib/plugins/algolia', () => ({ uploadDataToAlgolia: jest.fn() }))
jest.mock('@/lib/db/notion/getPageContentText', () => ({
  getPageContentText: jest.fn()
}))
jest.mock('@/lib/db/notion/getPageTableOfContents', () => ({
  getPageTableOfContents: jest.fn()
}))
jest.mock('@/lib/config', () => ({ siteConfig: (_key, fallback) => fallback }))

const PROTECTED_IDS = [
  '185a18e7-c6be-80e2-ac8a-e3a9b38be389',
  '1a3a18e7-c6be-80f2-a606-f7e6f55ac045',
  'c340487b-971a-4b17-896b-9d62d91f79aa',
  'c925f8c2-f6ec-4537-9b57-4210997b9e8c',
  'f7ed1283-7712-44bc-b6d2-f4d950802c1d'
]
const ORDINARY_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const BODY = 'SYNTHETIC_PRIVATE_BODY_48927'
const HEADING = 'SYNTHETIC_PRIVATE_HEADING_48927'
const PASSWORD = 'SYNTHETIC_PASSWORD_48927'
const HASH = 'SYNTHETIC_HASH_48927'
const RAW = 'SYNTHETIC_RAW_PROPERTY_48927'
const markers = [BODY, HEADING, PASSWORD, HASH, RAW]
const variants = id => [
  id,
  id.toUpperCase(),
  id.replace(/-/g, ''),
  id.replace(/-/g, '').toUpperCase()
]

function protectedFixture(id = PROTECTED_IDS[0]) {
  return {
    id,
    title: 'Public fixture title',
    slug: 'public-fixture-slug',
    summary: 'Public fixture summary',
    status: 'Published',
    type: 'Post',
    category: 'Public category',
    tags: ['Public tag'],
    pageCover: 'https://example.invalid/cover.png',
    password: PASSWORD,
    passwordHash: HASH,
    hash: HASH,
    properties: { password: RAW },
    rawProperties: { arbitrary: RAW },
    content: [BODY],
    body: BODY,
    aiSummary: BODY,
    toc: [{ text: HEADING }],
    blockMap: {
      block: {
        [id]: {
          value: {
            id,
            type: 'page',
            content: ['synthetic-child'],
            properties: { secret: RAW }
          }
        },
        'synthetic-child': {
          value: {
            id: 'synthetic-child',
            parent_id: id,
            type: 'text',
            properties: { title: [[BODY]] }
          }
        }
      }
    }
  }
}

function expectNoSensitiveValues(value) {
  const serialized = JSON.stringify(value)
  for (const marker of markers) expect(serialized).not.toContain(marker)
}

describe('the exact five-post body pause', () => {
  beforeEach(() => {
    getOrSetDataWithCache.mockImplementation((_key, load) =>
      Promise.resolve(load())
    )
    notionAPI.getPage.mockResolvedValue({ block: {} })
    jest.spyOn(console, 'log').mockImplementation(() => {})
  })

  it.each(PROTECTED_IDS)(
    'recognizes canonical, uppercase, and compact variants of %s',
    id => {
      for (const variant of variants(id)) {
        expect(normalizePageId(variant)).toBe(normalizePageId(id))
        expect(isBodyPaused(variant)).toBe(true)
        expect(isBodyPaused({ id: variant })).toBe(true)
      }
    }
  )

  it('does not quarantine an unknown UUID, ordinary post, or another post with a matching title', () => {
    expect(isBodyPaused(ORDINARY_ID)).toBe(false)
    expect(
      isBodyPaused({ id: ORDINARY_ID, title: 'Video2025', password: PASSWORD })
    ).toBe(false)
    for (const value of [null, undefined, '', 'not-a-uuid'])
      expect(isBodyPaused(value)).toBe(false)
    const ordinary = {
      id: ORDINARY_ID,
      title: 'Ordinary',
      body: 'ordinary public body',
      blockMap: { block: {} }
    }
    expect(sanitizePublicData(ordinary)).toEqual(ordinary)
  })

  it.each(PROTECTED_IDS)(
    'keeps public metadata and removes body, raw properties, password and hash for %s',
    id => {
      const source = protectedFixture(id)
      const clean = sanitizePublicData(source)
      expect(clean).toMatchObject({
        id,
        title: source.title,
        slug: source.slug,
        summary: source.summary,
        bodyPaused: true
      })
      for (const field of [
        'password',
        'passwordHash',
        'hash',
        'properties',
        'rawProperties',
        'content',
        'body',
        'aiSummary',
        'toc',
        'blockMap'
      ]) {
        expect(clean).not.toHaveProperty(field)
      }
      expectNoSensitiveValues(clean)
      expect(
        source.blockMap.block['synthetic-child'].value.properties.title[0][0]
      ).toBe(BODY)
      expect(sanitizePublicData(clean)).toEqual(clean)
    }
  )

  it('sanitizes every nested list, recommendation, navigation, and notice record', () => {
    const input = {
      allPages: PROTECTED_IDS.map(protectedFixture),
      latestPosts: PROTECTED_IDS.map(protectedFixture),
      allNavPages: [protectedFixture()],
      allLinkPages: [protectedFixture()],
      nested: [
        {
          wrapper: {
            recommendPosts: [protectedFixture()],
            prev: protectedFixture(),
            next: protectedFixture()
          }
        }
      ],
      notice: protectedFixture(),
      ordinary: { id: ORDINARY_ID, title: 'Ordinary public title' }
    }
    const output = sanitizePublicData(input)
    expectNoSensitiveValues(output)
    expect(output.allPages).toHaveLength(5)
    expect(output.latestPosts.every(post => post.bodyPaused)).toBe(true)
    expect(output.ordinary).toEqual(input.ordinary)
  })

  it('scrubs raw record-map roots and descendants, including wrapped Notion values', () => {
    const id = PROTECTED_IDS[0]
    const input = {
      recordMap: {
        block: {
          [id]: {
            role: 'reader',
            value: {
              value: {
                id,
                type: 'page',
                properties: { password: RAW },
                content: ['child']
              },
              role: 'reader'
            }
          },
          child: {
            value: {
              id: 'child',
              parent_id: id,
              type: 'heading_1',
              properties: { title: [[HEADING]] },
              content: ['grandchild']
            }
          },
          grandchild: {
            value: {
              id: 'grandchild',
              parent_id: 'child',
              type: 'text',
              properties: { title: [[BODY]] }
            }
          },
          [ORDINARY_ID]: {
            value: {
              id: ORDINARY_ID,
              type: 'page',
              properties: { title: [['ordinary public raw title']] }
            }
          }
        }
      }
    }
    const clean = sanitizePublicData(input)
    expectNoSensitiveValues(clean)
    expect(JSON.stringify(clean)).toContain('ordinary public raw title')
  })

  it('preserves separate ordinary child pages and their bodies outside the five-root scope', () => {
    const id = PROTECTED_IDS[0]
    const input = {
      block: {
        [id]: {
          value: { id, type: 'page', content: ['private-text', ORDINARY_ID] }
        },
        'private-text': {
          value: {
            id: 'private-text',
            parent_id: id,
            type: 'text',
            properties: { title: [[BODY]] }
          }
        },
        [ORDINARY_ID]: {
          value: {
            id: ORDINARY_ID,
            parent_id: id,
            type: 'page',
            content: ['ordinary-child']
          }
        },
        'ordinary-child': {
          value: {
            id: 'ordinary-child',
            parent_id: ORDINARY_ID,
            type: 'text',
            properties: { title: [['ordinary unlisted child body']] }
          }
        }
      }
    }
    const output = sanitizePublicData(input)
    expectNoSensitiveValues(output)
    expect(output.block[ORDINARY_ID]).toEqual(input.block[ORDINARY_ID])
    expect(JSON.stringify(output)).toContain('ordinary unlisted child body')
  })

  it.each(PROTECTED_IDS)(
    'sanitizes old navigation records identified only by short_id for %s',
    id => {
      const row = protectedFixture(id)
      delete row.id
      row.short_id = id.substring(14)
      row.slug = 'arbitrary-prefix/2026/10/08/renamed-page'
      row.ext = { copiedBody: BODY, nested: { password: PASSWORD } }
      const output = sanitizePublicData({ allNavPages: [row] })
      expect(output.allNavPages[0]).toMatchObject({
        id,
        short_id: id.substring(14),
        slug: row.slug,
        bodyPaused: true,
        title: row.title,
        summary: row.summary
      })
      expect(output.allNavPages[0]).not.toHaveProperty('ext')
      expectNoSensitiveValues(output)
      const ordinary = {
        ...row,
        short_id: ORDINARY_ID.substring(14),
        blockMap: { block: {} }
      }
      expect(sanitizePublicData(ordinary)).toEqual(ordinary)
    }
  )

  it('removes a paused-root synced subtree before extracting text for an ordinary article', () => {
    const actual = jest.requireActual('@/lib/db/notion/getPageContentText')
    const id = PROTECTED_IDS[0]
    const post = {
      id: ORDINARY_ID,
      content: ['public-text', 'synced-reference', 'private-child']
    }
    const map = {
      block: {
        [ORDINARY_ID]: {
          value: { id: ORDINARY_ID, type: 'page', content: post.content }
        },
        'public-text': {
          value: {
            id: 'public-text',
            parent_id: ORDINARY_ID,
            type: 'text',
            properties: { title: [['ordinary public text']] }
          }
        },
        'synced-reference': {
          value: {
            id: 'synced-reference',
            parent_id: ORDINARY_ID,
            type: 'transclusion_reference',
            format: { transclusion_reference_pointer: { id: 'private-sync' } }
          }
        },
        [id]: { value: { id, type: 'page', content: ['private-sync'] } },
        'private-sync': {
          value: {
            id: 'private-sync',
            parent_id: id,
            type: 'transclusion_container',
            content: ['private-child']
          }
        },
        'private-child': {
          value: {
            id: 'private-child',
            parent_id: 'private-sync',
            type: 'text',
            properties: { title: [[BODY]] }
          }
        }
      }
    }
    const text = actual.getPageContentText(post, map)
    expect(text).toContain('ordinary public text')
    expect(text).not.toContain(BODY)
    // This is a read-only transform, leaving the synthetic raw input intact.
    expect(JSON.stringify(map)).toContain(BODY)
  })

  it('removes body URLs for blocked descendants from raw record-map side tables', () => {
    const id = PROTECTED_IDS[0]
    const input = {
      recordMap: {
        block: {
          [id]: { value: { id, type: 'page', content: ['private-file'] } },
          'private-file': {
            value: {
              id: 'private-file',
              parent_id: id,
              type: 'file',
              properties: { source: [[BODY]] }
            }
          },
          [ORDINARY_ID]: {
            value: { id: ORDINARY_ID, type: 'page', content: ['public-file'] }
          },
          'public-file': {
            value: { id: 'public-file', parent_id: ORDINARY_ID, type: 'file' }
          }
        },
        signed_urls: {
          'private-file': BODY,
          'public-file': 'https://example.invalid/public.pdf'
        }
      }
    }
    const output = sanitizePublicData(input)
    expectNoSensitiveValues(output)
    expect(JSON.stringify(output)).toContain(
      'https://example.invalid/public.pdf'
    )
  })

  it('returns empty text before examining paused content, even after password stripping', () => {
    const actual = jest.requireActual('@/lib/db/notion/getPageContentText')
    for (const id of PROTECTED_IDS) {
      const post = sanitizePublicData(protectedFixture(id))
      expect(
        actual.getPageContentText(post, protectedFixture(id).blockMap)
      ).toBe('')
    }
  })

  it('never contacts the search index from direct or batch upload of paused posts', async () => {
    const actual = jest.requireActual('@/lib/plugins/algolia')
    const algoliasearch = require('algoliasearch').default
    const client = algoliasearch.mock.results.at(-1).value
    const index = client.initIndex.mock.results.at(-1).value
    const allPages = PROTECTED_IDS.map(id =>
      sanitizePublicData(protectedFixture(id))
    )
    for (const post of allPages) await actual.uploadDataToAlgolia(post)
    actual.generateAlgoliaSearch({ allPages })
    expect(index.getObject).not.toHaveBeenCalled()
    expect(index.saveObject).not.toHaveBeenCalled()
    expect(index.deleteObject).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it.each(PROTECTED_IDS)(
    'creates safe paused fallback metadata for a missing-index ID %s',
    id => {
      for (const variant of variants(id)) {
        const fallback = pausedPostMetadata(variant)
        expect(isBodyPaused(fallback)).toBe(true)
        expect(fallback.bodyPaused).toBe(true)
        expectNoSensitiveValues(fallback)
        expect(fallback).not.toHaveProperty('blockMap')
        const supplied = pausedPostMetadata(variant, protectedFixture(id))
        expect(supplied.summary).toBe('Public fixture summary')
        expectNoSensitiveValues(supplied)
      }
    }
  )

  it.each(PROTECTED_IDS)(
    'never reads cache or calls the Notion API in direct block fetch for %s',
    async id => {
      for (const variant of variants(id)) {
        const result = await fetchNotionPageBlocks(
          variant,
          'synthetic-quarantine-test'
        )
        expect(
          result == null || Object.keys(result?.block || {}).length === 0
        ).toBe(true)
        expectNoSensitiveValues(result)
      }
      expect(getOrSetDataWithCache).not.toHaveBeenCalled()
      expect(notionAPI.getPage).not.toHaveBeenCalled()
      expect(notionAPI.getSignedFileUrls).not.toHaveBeenCalled()
      expect(global.fetch).not.toHaveBeenCalled()
    }
  )

  it.each(PROTECTED_IDS)(
    'never acquires content in exported retry or direct page fetch for %s',
    async id => {
      for (const variant of variants(id)) {
        await getPageWithRetry(variant, 'synthetic-direct-retry')
        const page = await fetchPageFromNotion(variant)
        expect(page.bodyPaused).toBe(true)
        expect(page).not.toHaveProperty('blockMap')
        expectNoSensitiveValues(page)
      }
      expect(getOrSetDataWithCache).not.toHaveBeenCalled()
      expect(notionAPI.getPage).not.toHaveBeenCalled()
      expect(notionAPI.getSignedFileUrls).not.toHaveBeenCalled()
      expect(global.fetch).not.toHaveBeenCalled()
    }
  )

  it('retains ordinary low-level acquisition for unknown UUIDs using only a synthetic client', async () => {
    const result = await fetchNotionPageBlocks(
      ORDINARY_ID,
      'synthetic-ordinary'
    )
    expect(result).toEqual({ block: {} })
    expect(notionAPI.getPage).toHaveBeenCalledWith(ORDINARY_ID)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it.each(PROTECTED_IDS)(
    'stops body-derived processing and search uploads for %s',
    async id => {
      const props = {
        post: protectedFixture(id),
        allPages: [protectedFixture(id)],
        latestPosts: [protectedFixture(id)]
      }
      await processPostData(props, 'synthetic-protected-processing')
      expectNoSensitiveValues(props)
      expect(props.post.bodyPaused).toBe(true)
      expect(getPageContentText).not.toHaveBeenCalled()
      expect(getPageTableOfContents).not.toHaveBeenCalled()
      expect(uploadDataToAlgolia).not.toHaveBeenCalled()
      expect(notionAPI.getPage).not.toHaveBeenCalled()
      expect(global.fetch).not.toHaveBeenCalled()
    }
  )
})

describe('paused inline collection boundaries', () => {
  const pausedId = PROTECTED_IDS[0]
  function map(shared = false) {
    return {
      block: {
        [pausedId]: {
          value: { id: pausedId, type: 'page', content: ['private-table'] }
        },
        'private-table': {
          value: {
            id: 'private-table',
            type: 'collection_view',
            parent_id: pausedId,
            collection_id: 'collection-c',
            view_ids: ['private-view']
          }
        },
        'private-row': {
          value: {
            id: 'private-row',
            type: 'page',
            parent_table: 'collection',
            parent_id: 'collection-c',
            content: ['private-row-text'],
            properties: { title: [[BODY]] }
          }
        },
        'private-row-text': {
          value: {
            id: 'private-row-text',
            type: 'text',
            parent_id: 'private-row',
            properties: { title: [[BODY]] }
          }
        },
        ...(shared
          ? {
              'public-table': {
                value: {
                  id: 'public-table',
                  type: 'collection_view',
                  collection_id: 'collection-c',
                  view_ids: ['public-view']
                }
              }
            }
          : {})
      },
      collection: {
        'collection-c': {
          value: {
            id: 'collection-c',
            name: shared ? 'Public shared collection' : BODY
          }
        }
      },
      collection_view: {
        'private-view': { value: { id: 'private-view', name: HEADING } },
        'public-view': { value: { id: 'public-view', name: 'Public view' } }
      },
      collection_query: {
        'collection-c': {
          'private-view': { label: RAW },
          'public-view': { label: 'Public query' }
        }
      },
      signed_urls: { 'private-row-text': 'https://example.invalid/' + BODY }
    }
  }
  it('removes exclusively attached collection/view/query records and collection rows', () => {
    const clean = sanitizePublicData(map())
    expectNoSensitiveValues(clean)
    expect(clean.collection).not.toHaveProperty('collection-c')
    expect(clean.collection_view).not.toHaveProperty('private-view')
    expect(clean.collection_query).not.toHaveProperty('collection-c')
    expect(clean.block).not.toHaveProperty('private-row')
    expect(clean.signed_urls).not.toHaveProperty('private-row-text')
  })
  it('keeps independently public collection references but removes the paused-only view', () => {
    const input = map(true)
    const clean = sanitizePublicData(input)
    expect(clean.collection['collection-c']).toEqual(
      input.collection['collection-c']
    )
    expect(clean.collection_view).not.toHaveProperty('private-view')
    expect(clean.collection_query['collection-c']).not.toHaveProperty(
      'private-view'
    )
    expect(clean.collection_query['collection-c']['public-view']).toEqual({
      label: 'Public query'
    })
  })
})

it('preserves established automatic cleanup eligibility without sending new paused bodies', async () => {
  let actual
  let index
  jest.isolateModules(() => {
    actual = jest.requireActual('@/lib/plugins/algolia')
    const client = require('algoliasearch').default.mock.results.at(-1).value
    index = client.initIndex.mock.results.at(-1).value
  })
  index.getObject.mockResolvedValue({ objectID: 'synthetic-existing-record' })
  index.deleteObject.mockReturnValue({ wait: () => Promise.resolve() })
  const log = jest.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await actual.checkDataFromAlgolia({
      allPages: PROTECTED_IDS.map(pausedPostMetadata)
    })
    expect(index.getObject).toHaveBeenCalledTimes(5)
    expect(index.deleteObject.mock.calls.map(([id]) => id).sort()).toEqual(
      [...PROTECTED_IDS].sort()
    )
    expect(index.saveObject).not.toHaveBeenCalled()
  } finally {
    log.mockRestore()
  }
})
