import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'

type Env = {
  R2: R2Bucket
  HERALD_API_URL: string
  HERALD_INTERNAL_SECRET: string
}

const app = new Hono<{ Bindings: Env }>()

app.get('/health', async (c) => {
  return c.json({
    status: "ok"
  })
})

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
    let failure = 'Axum inbound failed'

    try {
      const res = await fetch(`${env.HERALD_API_URL}/internal/mail/inbound`, {
        method: 'POST',
        headers: {
          'Content-Type': 'message/rfc822',
          Authorization: `Bearer ${env.HERALD_INTERNAL_SECRET}`,
        },
        body: raw,
      })

      if (res.ok) {
        return
      }

      failure = `Axum rejected inbound mail (${res.status})`
    } catch (error) {
      failure = error instanceof Error
        ? `Axum inbound request failed: ${error.message}`
        : 'Axum inbound request failed'
    }

    const key = `inbound/${Date.now()}-${message.headers.get('message-id') ?? crypto.randomUUID()}.eml`

    // Fallback to R2 only when the Axum ingest request fails.
    await env.R2.put(key, raw, {
      httpMetadata: { contentType: 'message/rfc822' },
      customMetadata: {
        from: message.from,
        to: message.to,
        receivedAt: new Date().toISOString(),
      },
    })

    // Throw so Workers Email can retry/bounce, while Axum recovery can replay from R2.
    throw new Error(`${failure}; staged in R2 as ${key}`)
  },

  fetch: app.fetch,
}
