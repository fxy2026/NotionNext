import type { NextApiRequest, NextApiResponse } from 'next'

// No request body needs to be parsed for this retired endpoint.
export const config = { api: { bodyParser: false } }

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.statusCode = 410
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.end('Notion OAuth is disabled.')
}
