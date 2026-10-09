/** @jest-environment node */
import {
  requestLogMiddleware,
  securityMiddleware
} from '@/lib/middleware/security'

jest.mock('@/lib/config', () => ({ siteConfig: jest.fn() }))
// The unrelated global rate limiter starts a server-side cleanup interval.
jest.mock('@/lib/utils/validation', () => ({}))

const fixture = {
  body: 'synthetic-body-password',
  nested: 'synthetic-nested-token',
  content: 'synthetic-private-content',
  query: 'synthetic-query-token',
  fragment: 'synthetic-fragment-secret',
  authorization: 'Bearer synthetic-header-token',
  cookie: 'synthetic-session-cookie',
  agent: 'synthetic-user-agent-secret',
  ip: '192.0.2.123'
}

function createRequest(overrides = {}) {
  return {
    method: 'POST',
    url: `/api/example?token=${fixture.query}#${fixture.fragment}`,
    headers: {
      authorization: fixture.authorization,
      cookie: fixture.cookie,
      'user-agent': fixture.agent,
      'x-forwarded-for': fixture.ip,
      'x-real-ip': fixture.ip
    },
    body: {
      password: fixture.body,
      nested: { token: fixture.nested },
      content: fixture.content
    },
    query: { token: fixture.query },
    connection: { remoteAddress: fixture.ip },
    socket: { remoteAddress: fixture.ip },
    ...overrides
  }
}

function createResponse(statusCode) {
  return {
    statusCode,
    end: jest.fn(function () {
      return this
    })
  }
}

describe('requestLogMiddleware data minimization', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it.each([200, 204, 302, 400, 401, 403, 422, 429, 500, 503])(
    'logs only metadata for HTTP %s and preserves the response',
    statusCode => {
      const req = createRequest()
      const body = req.body
      const headers = req.headers
      const query = req.query
      const res = createResponse(statusCode)
      const originalEnd = res.end
      const next = jest.fn()
      const callback = jest.fn()

      requestLogMiddleware()(req, res, next)
      expect(next).toHaveBeenCalledTimes(1)
      expect(console.log).not.toHaveBeenCalled()
      jest.advanceTimersByTime(25)
      const result = res.end('synthetic-response-content', 'utf8', callback)

      const expected = {
        timestamp: '2026-01-01T00:00:00.025Z',
        method: 'POST',
        path: '/api/example',
        statusCode,
        durationMs: 25
      }
      expect(console.log).toHaveBeenCalledTimes(1)
      expect(JSON.parse(console.log.mock.calls[0][0])).toEqual(expected)
      if (statusCode >= 400) {
        expect(console.error).toHaveBeenCalledTimes(1)
        expect(JSON.parse(console.error.mock.calls[0][0])).toEqual({
          ...expected,
          errorCategory: statusCode >= 500 ? 'server_error' : 'client_error'
        })
      } else {
        expect(console.error).not.toHaveBeenCalled()
      }
      const logged = JSON.stringify([
        ...console.log.mock.calls,
        ...console.error.mock.calls
      ])
      for (const value of Object.values(fixture)) {
        expect(logged).not.toContain(value)
      }
      expect(logged).not.toContain('synthetic-response-content')
      expect(req.body).toBe(body)
      expect(req.headers).toBe(headers)
      expect(req.query).toBe(query)
      expect(res.statusCode).toBe(statusCode)
      expect(result).toBe(res)
      expect(originalEnd).toHaveBeenCalledTimes(1)
      expect(originalEnd).toHaveBeenCalledWith(
        'synthetic-response-content',
        'utf8',
        callback
      )
      expect(originalEnd.mock.contexts[0]).toBe(res)
      expect(callback).not.toHaveBeenCalled()
    }
  )

  it.each(['body', 'headers', 'query', 'connection', 'socket'])(
    'does not access the request %s field',
    key => {
      const req = createRequest()
      const getter = jest.fn(() => {
        throw new Error('Sensitive request field must not be read')
      })
      Object.defineProperty(req, key, { get: getter })
      const res = createResponse(500)

      expect(() => {
        requestLogMiddleware()(req, res, jest.fn())
        res.end()
      }).not.toThrow()
      expect(getter).not.toHaveBeenCalled()
    }
  )

  it('does not serialize circular, BigInt or custom-serialized request bodies', () => {
    const body = { secret: 1n, toJSON: jest.fn() }
    body.self = body
    const res = createResponse(400)

    requestLogMiddleware()(createRequest({ body }), res, jest.fn())
    expect(() => res.end()).not.toThrow()
    expect(body.toJSON).not.toHaveBeenCalled()
  })

  it.each([
    ['/api/example?password=synthetic-secret', '/api/example'],
    ['/api/example#synthetic-secret', '/api/example'],
    [
      'https://synthetic-user:synthetic-password@example.test/api/example?token=synthetic-secret#synthetic-secret',
      '/api/example'
    ],
    ['/api/example?token=synthetic-secret\nFORGED-LOG', '/api/example'],
    ['http://[', 'unknown'],
    ['javascript:synthetic-secret', 'unknown'],
    [undefined, 'unknown'],
    [null, 'unknown'],
    [{ toString: () => 'synthetic-secret' }, 'unknown']
  ])('logs a pathname or safe fallback for %p', (url, path) => {
    const res = createResponse(400)
    requestLogMiddleware()(createRequest({ url }), res, jest.fn())
    expect(() => res.end()).not.toThrow()
    expect(JSON.parse(console.log.mock.calls[0][0]).path).toBe(path)
    expect(JSON.stringify(console.log.mock.calls)).not.toContain(
      'synthetic-secret'
    )
    expect(JSON.stringify(console.error.mock.calls)).not.toContain(
      'synthetic-secret'
    )
  })

  it.each([
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS',
    'CONNECT',
    'TRACE'
  ])('preserves the standard %s method in metadata', method => {
    const res = createResponse(200)
    requestLogMiddleware()(createRequest({ method }), res, jest.fn())
    res.end()
    expect(JSON.parse(console.log.mock.calls[0][0]).method).toBe(method)
  })

  it.each(['POST\nsynthetic-secret', undefined, { token: fixture.nested }])(
    'does not log an unrecognized method %p',
    method => {
      const res = createResponse(400)
      requestLogMiddleware()(createRequest({ method }), res, jest.fn())
      res.end()
      expect(JSON.parse(console.log.mock.calls[0][0]).method).toBe('unknown')
    }
  )

  it.each([true, false])('preserves the requestLog option: %s', requestLog => {
    const res = createResponse(400)
    const originalEnd = res.end
    const next = jest.fn()
    securityMiddleware({
      rateLimit: false,
      cors: false,
      securityHeaders: false,
      requestLog
    })(createRequest(), res, next)
    res.end()

    expect(next).toHaveBeenCalledTimes(1)
    expect(originalEnd).toHaveBeenCalledTimes(1)
    expect(console.log).toHaveBeenCalledTimes(requestLog ? 1 : 0)
    expect(console.error).toHaveBeenCalledTimes(requestLog ? 1 : 0)
  })

  it('keeps request logging enabled by default in the combined middleware', () => {
    const res = createResponse(400)
    securityMiddleware({
      rateLimit: false,
      cors: false,
      securityHeaders: false
    })(createRequest(), res, jest.fn())
    res.end()

    expect(console.log).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(console.error.mock.calls)).not.toContain(fixture.body)
  })
})
