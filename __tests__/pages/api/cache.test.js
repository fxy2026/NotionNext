/** @jest-environment node */
import { cleanCache } from '@/lib/cache/local_file_cache'
import handler from '@/pages/api/cache'

jest.mock('@/lib/cache/local_file_cache', () => ({ cleanCache: jest.fn() }))

const fixtureToken = 'fixture-cache-token'
const originalEnv = process.env

function createResponse() {
  return {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  }
}

describe('POST /api/cache', () => {
  beforeEach(() => {
    process.env = { ...originalEnv, CACHE_REVALIDATION_TOKEN: fixtureToken }
    delete process.env.REVALIDATION_TOKEN
    cleanCache.mockReset()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it.each([undefined, ''])(
    'disables cache clearing when the configured token is %p',
    token => {
      if (token === undefined) {
        delete process.env.CACHE_REVALIDATION_TOKEN
      } else {
        process.env.CACHE_REVALIDATION_TOKEN = token
      }

      for (const authorization of [
        undefined,
        'Bearer ',
        `Bearer ${fixtureToken}`
      ]) {
        const res = createResponse()
        handler({ method: 'POST', headers: { authorization } }, res)

        expect(res.status).toHaveBeenCalledWith(503)
        expect(res.json).toHaveBeenCalledWith({
          status: 'error',
          message: 'Cache clearing is unavailable'
        })
        expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
        expect(cleanCache).not.toHaveBeenCalled()
      }
    }
  )

  it('does not fall back to the independent page revalidation token', () => {
    delete process.env.CACHE_REVALIDATION_TOKEN
    process.env.REVALIDATION_TOKEN = 'fixture-page-token'
    const res = createResponse()

    handler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer fixture-page-token' }
      },
      res
    )

    expect(res.status).toHaveBeenCalledWith(503)
    expect(cleanCache).not.toHaveBeenCalled()
  })

  it.each([
    undefined,
    '',
    'Bearer wrong-token',
    'Basic fixture-cache-token',
    'bearer fixture-cache-token',
    ['Bearer fixture-cache-token']
  ])('rejects unauthorized headers: %p', authorization => {
    const res = createResponse()

    handler({ method: 'POST', headers: { authorization } }, res)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Unauthorized'
    })
    expect(cleanCache).not.toHaveBeenCalled()
  })

  it('does not accept tokens from the request body or query', () => {
    const res = createResponse()
    handler(
      {
        method: 'POST',
        headers: {},
        body: { token: fixtureToken },
        query: { token: fixtureToken }
      },
      res
    )

    expect(res.status).toHaveBeenCalledWith(401)
    expect(cleanCache).not.toHaveBeenCalled()
  })

  it.each(['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])(
    'rejects %s without clearing cache, whether configured or not',
    method => {
      for (const configured of [true, false]) {
        if (!configured) delete process.env.CACHE_REVALIDATION_TOKEN
        const res = createResponse()

        handler(
          { method, headers: { authorization: `Bearer ${fixtureToken}` } },
          res
        )

        expect(res.status).toHaveBeenCalledWith(405)
        expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST')
        expect(res.json).toHaveBeenCalledWith({
          status: 'error',
          message: 'Method not allowed'
        })
        expect(cleanCache).not.toHaveBeenCalled()
      }
    }
  )

  it('clears cache exactly once with the configured bearer token', () => {
    const res = createResponse()

    handler(
      { method: 'POST', headers: { authorization: `Bearer ${fixtureToken}` } },
      res
    )

    expect(cleanCache).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({
      status: 'success',
      message: 'Clean cache successful!'
    })
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })

  it('preserves the generic failure response if authorized clearing fails', () => {
    cleanCache.mockImplementation(() => {
      throw new Error('Synthetic filesystem error')
    })
    jest.spyOn(console, 'error').mockImplementation(() => {})
    const res = createResponse()

    handler(
      { method: 'POST', headers: { authorization: `Bearer ${fixtureToken}` } },
      res
    )

    expect(cleanCache).toHaveBeenCalledTimes(1)
    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      status: 'error',
      message: 'Clean cache failed!'
    })
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store')
  })
})
