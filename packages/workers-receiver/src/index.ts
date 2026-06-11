import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'

type Env = {
  R2: R2Bucket
  HERALD_API_URL: string
  HERALD_INTERNAL_SECRET: string
}

const app = new Hono<{ Bindings: Env }>()

// All /internal/* endpoints require the internal bearer secret
app.use('/internal/*', async (c, next) => {
  const middleware = bearerAuth({ token: c.env.HERALD_INTERNAL_SECRET })
  return middleware(c, next)
})

// List unprocessed mail (first page, up to 1000 objects).
// Response shape matches Axum's UnprocessedItem { key: string }.
app.get('/internal/unprocessed', async (c) => {
  const list = await c.env.R2.list({ prefix: 'inbound/' })
  const items = list.objects.map((obj) => ({
    key: obj.key,
    size: obj.size,
    uploadedAt: obj.uploaded.toISOString(),
    metadata: obj.customMetadata ?? {},
  }))
  return c.json(items)
})

// Axum passes the raw R2 key (e.g. "inbound/ts-<id@domain>.eml") directly in
// the URL path, which means it contains slashes. Use a wildcard to capture it.
// reqwest percent-encodes angle brackets; Hono decodes them back on extraction.

app.get('/internal/unprocessed/*', async (c) => {
  const key = c.req.param('*')
  if (!key || !key.startsWith('inbound/')) return c.notFound()

  const object = await c.env.R2.get(key)
  if (!object) return c.notFound()

  return new Response(object.body, {
    headers: { 'Content-Type': 'message/rfc822' },
  })
})

// Move message from inbound/ to processed/ (mark as processed).
// R2 has no rename — copy then delete.
app.delete('/internal/unprocessed/*', async (c) => {
  const key = c.req.param('*')
  if (!key || !key.startsWith('inbound/')) return c.notFound()

  const object = await c.env.R2.get(key)
  if (!object) return c.notFound()

  const processedKey = 'processed/' + key.slice('inbound/'.length)
  await c.env.R2.put(processedKey, object.body, {
    httpMetadata: object.httpMetadata,
    customMetadata: object.customMetadata ?? undefined,
  })
  await c.env.R2.delete(key)

  return c.json({ ok: true, processedKey })
})

export default {
  async email(message: ForwardableEmailMessage, env: Env, _ctx: ExecutionContext) {
    // message.raw is a ReadableStream — wrap in Response to get arrayBuffer
    const raw = await new Response(message.raw).arrayBuffer()
    const key = `inbound/${Date.now()}-${message.headers.get('message-id') ?? crypto.randomUUID()}.eml`

    // R2 write is unconditional — mail is durable even if Axum is down
    await env.R2.put(key, raw, {
      httpMetadata: { contentType: 'message/rfc822' },
      customMetadata: {
        from: message.from,
        to: message.to,
        receivedAt: new Date().toISOString(),
      },
    })

    const res = await fetch(`${env.HERALD_API_URL}/internal/mail/inbound`, {
      method: 'POST',
      headers: {
        'Content-Type': 'message/rfc822',
        Authorization: `Bearer ${env.HERALD_INTERNAL_SECRET}`,
        'X-R2-Key': key,
      },
      body: raw,
    })

    // Throw on non-2xx so Workers Email bounces the message back to sender.
    // Mail is already in R2 and can be reprocessed after Axum recovers.
    if (!res.ok) {
      throw new Error(`Axum rejected inbound mail (${res.status}): ${key}`)
    }
  },

  fetch: app.fetch,
}
