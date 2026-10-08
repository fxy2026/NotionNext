import { cleanCache } from '@/lib/cache/local_file_cache'

/**
 * 清理缓存
 * @param {*} req
 * @param {*} res
 */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res
      .status(405)
      .json({ status: 'error', message: 'Method not allowed' })
  }

  const token = process.env.CACHE_REVALIDATION_TOKEN
  if (!token) {
    return res.status(503).json({
      status: 'error',
      message: 'Cache clearing is unavailable'
    })
  }

  if (req.headers.authorization !== `Bearer ${token}`) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' })
  }

  try {
    cleanCache()
    res
      .status(200)
      .json({ status: 'success', message: 'Clean cache successful!' })
  } catch (error) {
    console.error('Cache clean error:', error)
    res.status(400).json({ status: 'error', message: 'Clean cache failed!' })
  }
}
