// This unused legacy Notion OAuth flow is intentionally unavailable.
export function getServerSideProps({ res }) {
  res.statusCode = 410
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  res.setHeader('Referrer-Policy', 'no-referrer')
  // End before Next.js serializes request parameters into HTML or page data.
  res.end('Notion OAuth is disabled.')
  return Promise.resolve({ props: {} })
}

export default function DisabledNotionOAuth() {
  return null
}
