/** @jest-environment node */

import axios from 'axios'
import { readFileSync } from 'fs'
import { createServer, request } from 'http'
import { apiResolver } from 'next/dist/server/api-utils/node/api-resolver'
import { generateETag } from 'next/dist/server/lib/etag'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderToHTML } from 'next/dist/server/render'
import { sendRenderResult } from 'next/dist/server/send-payload'
import { fetchGlobalAllData } from '@/lib/db/SiteDataApi'
import AuthPage, { getServerSideProps as authProps } from '@/pages/auth'
import * as ResultPage from '@/pages/auth/result'
import notionCallback, {
  config as callbackConfig
} from '@/pages/api/auth/callback/notion'

jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
  request: jest.fn()
}))
jest.mock('@/lib/db/SiteDataApi', () => ({ fetchGlobalAllData: jest.fn() }))
jest.mock('@/pages/[prefix]', () => () => null)

const message = 'Notion OAuth is disabled.'
const fakeQuery = {
  code: 'synthetic-code-do-not-exchange',
  state: 'https://example.invalid/redirect?synthetic-state',
  error: '<script>synthetic-error</script>',
  msg: 'synthetic-token-and-workspace',
  access_token: 'synthetic-access-token'
}
const response = () => ({
  statusCode: 200,
  setHeader: jest.fn(),
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis(),
  end: jest.fn().mockReturnThis(),
  redirect: jest.fn()
})
const requests = ['GET', 'POST'].flatMap(method =>
  [
    ['empty', {}],
    ['crafted', fakeQuery],
    [
      'repeated',
      Object.fromEntries(
        Object.entries(fakeQuery).map(([key, value]) => [key, [value, value]])
      )
    ]
  ].map(([name, query]) => [method, name, { method, query, body: fakeQuery }])
)
let originalFetch
let logSpies

beforeEach(() => {
  originalFetch = global.fetch
  global.fetch = jest.fn()
  axios.post.mockResolvedValue({ status: 200, data: fakeQuery })
  fetchGlobalAllData.mockResolvedValue({ allPages: [] })
  logSpies = ['log', 'error', 'warn', 'info', 'debug'].map(method =>
    jest.spyOn(console, method).mockImplementation(() => {})
  )
})

afterEach(() => {
  global.fetch = originalFetch
})

const expectNoSideEffects = res => {
  for (const method of ['post', 'get', 'request']) {
    expect(axios[method]).not.toHaveBeenCalled()
  }
  expect(global.fetch).not.toHaveBeenCalled()
  expect(fetchGlobalAllData).not.toHaveBeenCalled()
  for (const spy of logSpies) expect(spy).not.toHaveBeenCalled()
  expect(res.redirect).not.toHaveBeenCalled()
  expect(res.setHeader).toHaveBeenCalledWith(
    'Cache-Control',
    'no-store, max-age=0'
  )
  expect(res.setHeader).toHaveBeenCalledWith('Referrer-Policy', 'no-referrer')
  expect(
    res.setHeader.mock.calls.some(([name]) =>
      /^(location|authorization|set-cookie)$/i.test(name)
    )
  ).toBe(false)
  const serialized = JSON.stringify({
    headers: res.setHeader.mock.calls,
    end: res.end.mock.calls,
    send: res.send.mock.calls,
    json: res.json.mock.calls
  })
  for (const value of Object.values(fakeQuery))
    expect(serialized).not.toContain(value)
}

describe.each([
  ['/auth', authProps, AuthPage],
  [
    '/auth/result',
    context => ResultPage.getServerSideProps(context),
    ResultPage.default
  ]
])('%s is retired on the server', (_path, getProps, Page) => {
  it.each(requests)(
    'ends %s %s requests before HTML or page data can reflect input',
    async (_method, _name, req) => {
      const res = response()
      const result = await getProps({ req, res, query: req.query })
      expect(res.statusCode).toBe(410)
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/plain; charset=utf-8'
      )
      expect(res.end).toHaveBeenCalledTimes(1)
      expect(res.end).toHaveBeenCalledWith(message)
      expect(result).toEqual({ props: {} })
      expectNoSideEffects(res)
    }
  )

  it('does not even read request parameters or serialize incoming page props', async () => {
    const res = response()
    const context = { res }
    for (const key of ['query', 'req', 'params', 'resolvedUrl']) {
      Object.defineProperty(context, key, {
        get: () => {
          throw new Error(`Unexpected ${key} read`)
        }
      })
    }
    expect(await getProps(context)).toEqual({ props: {} })
    expect(renderToStaticMarkup(<Page {...fakeQuery} />)).toBe('')
    expectNoSideEffects(res)
  })
})

describe.each([
  ['/auth', authProps, AuthPage],
  [
    '/auth/result',
    context => ResultPage.getServerSideProps(context),
    ResultPage.default
  ]
])('%s Next.js SSR transport', (path, getServerSideProps, Component) => {
  it.each([
    ['GET', false],
    ['POST', false],
    ['GET', true],
    ['POST', true]
  ])(
    'sends only the fixed response for %s (page-data=%s)',
    async (method, isNextDataRequest) => {
      const res = response()
      res.end.mockImplementation(() => {
        res.finished = true
        return res
      })
      const App = jest.fn(() => null)
      const Document = jest.fn(() => null)
      const req = {
        method,
        headers: {},
        url: `${path}?${new URLSearchParams(fakeQuery).toString()}`
      }
      const result = await renderToHTML(
        req,
        res,
        path,
        fakeQuery,
        {
          App,
          Document,
          Component,
          getServerSideProps,
          isNextDataRequest,
          basePath: '',
          images: {},
          experimental: {},
          buildManifest: { pages: {}, lowPriorityFiles: [] },
          reactLoadableManifest: {}
        },
        { buildId: 'synthetic-build' },
        { isFallback: false }
      )
      await sendRenderResult({
        req,
        res,
        result,
        generateEtags: true,
        poweredByHeader: true,
        cacheControl: result.metadata.cacheControl
      })
      expect(res.statusCode).toBe(410)
      expect(res.end).toHaveBeenCalledTimes(1)
      expect(res.end).toHaveBeenCalledWith(message)
      expect(App).not.toHaveBeenCalled()
      expect(Document).not.toHaveBeenCalled()
      const payload = result.toUnchunkedString()
      for (const value of Object.values(fakeQuery))
        expect(payload).not.toContain(value)
      expectNoSideEffects(res)
    }
  )
})

describe('legacy Notion API callback', () => {
  it.each(requests)(
    'rejects %s %s requests without a token exchange',
    async (_method, _name, req) => {
      const res = response()
      await Promise.resolve(notionCallback(req, res))
      expect(res.statusCode).toBe(410)
      expect(res.end).toHaveBeenCalledWith(message)
      expectNoSideEffects(res)
    }
  )

  it.each(['HEAD', 'PUT', 'DELETE', 'OPTIONS'])(
    'also fails closed for %s',
    async method => {
      const res = response()
      await Promise.resolve(
        notionCallback({ method, query: fakeQuery, body: fakeQuery }, res)
      )
      expect(res.statusCode).toBe(410)
      expectNoSideEffects(res)
    }
  )

  it('never inspects any request property', async () => {
    const req = new Proxy(
      {},
      {
        get: () => {
          throw new Error('Unexpected request read')
        }
      }
    )
    const res = response()
    await Promise.resolve(notionCallback(req, res))
    expect(res.statusCode).toBe(410)
    expectNoSideEffects(res)
  })
})

describe('Next.js API HTTP transport', () => {
  let server
  let port
  beforeAll(async () => {
    server = createServer((req, res) => {
      apiResolver(
        req,
        res,
        fakeQuery,
        { default: notionCallback, config: callbackConfig },
        {},
        true
      ).catch(() => {
        res.statusCode = 500
        res.end('Test harness failure')
      })
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    port = server.address().port
  })
  afterAll(async () => {
    await new Promise((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve()))
    )
  })
  it.each(['GET', 'POST', 'HEAD'])(
    'keeps %s at 410 even with matching conditional headers',
    async method => {
      const result = await new Promise((resolve, reject) => {
        const req = request(
          {
            host: '127.0.0.1',
            port,
            method,
            path: `/api/auth/callback/notion?${new URLSearchParams(fakeQuery).toString()}`,
            headers: {
              'if-none-match': generateETag(message),
              'content-type': 'application/json'
            }
          },
          res => {
            let body = ''
            res.on('data', chunk => {
              body += chunk
            })
            res.on('end', () =>
              resolve({ status: res.statusCode, headers: res.headers, body })
            )
          }
        )
        req.on('error', reject)
        req.end(method === 'POST' ? '{synthetic-invalid-json' : undefined)
      })
      expect(result.status).toBe(410)
      expect(result.body).toBe(method === 'HEAD' ? '' : message)
      expect(result.headers['cache-control']).toBe('no-store, max-age=0')
      expect(result.headers['content-type']).toBe('text/plain; charset=utf-8')
      expect(result.headers['referrer-policy']).toBe('no-referrer')
      expect(result.headers.location).toBeUndefined()
      expect(result.headers.etag).toBeUndefined()
      expect(result.headers['set-cookie']).toBeUndefined()
      for (const spy of logSpies) expect(spy).not.toHaveBeenCalled()
      for (const method of ['post', 'get', 'request'])
        expect(axios[method]).not.toHaveBeenCalled()
      expect(global.fetch).not.toHaveBeenCalled()
      expect(fetchGlobalAllData).not.toHaveBeenCalled()
    }
  )
})

it.each([
  'pages/auth/index.js',
  'pages/auth/result.js',
  'pages/api/auth/callback/notion.ts'
])('%s contains no credential, network, logging, or redirect path', path => {
  const source = readFileSync(path, 'utf8')
  expect(source).not.toMatch(
    /process\.env|OAUTH_CLIENT_|OAUTH_REDIRECT_URI|axios|fetchToken|fetchGlobalAllData|console\.|\.query|\.body|\.redirect|redirect_query|useRouter/
  )
})
