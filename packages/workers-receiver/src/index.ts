import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import type { Context } from 'hono'

type WorkerBindings = {
  R2: R2Bucket
  HERALD_API_URL: string
  HERALD_INTERNAL_SECRET: string
}

type AppEnv = { Bindings: WorkerBindings }
type AppContext = Context<AppEnv>

const app = new Hono<AppEnv>()

app.get('/health', async (c) => {
  return c.json({
    status: "ok"
  })
})

// All /internal/* endpoints require the internal bearer secret
app.use('/internal/*', async (c, next) => {
  const middleware = bearerAuth<AppEnv>({ token: c.env.HERALD_INTERNAL_SECRET })
  return middleware(c, next)
})

// List unprocessed mail (first page, up to 1000 objects).
// Response shape matches Axum's UnprocessedItem { key: string }.
app.get('/internal/unprocessed', async (c) => {
  const key = c.req.query('key')
  if (key) return getUnprocessedObject(c, key)

  const list = await c.env.R2.list({ prefix: 'inbound/' })
  const items = list.objects.map((obj) => ({
    key: obj.key,
    size: obj.size,
    uploadedAt: obj.uploaded.toISOString(),
    metadata: obj.customMetadata ?? {},
  }))
  return c.json(items)
})

app.delete('/internal/unprocessed', async (c) => {
  const key = c.req.query('key')
  if (!key) return c.notFound()
  return deleteUnprocessedObject(c, key)
})

// Backward compatibility for older API builds that pass the R2 key in the path.
app.get('/internal/unprocessed/*', async (c) => {
  return getUnprocessedObject(c, keyFromPath(c))
})

// Move message from inbound/ to processed/ (mark as processed).
// R2 has no rename — copy then delete.
app.delete('/internal/unprocessed/*', async (c) => {
  return deleteUnprocessedObject(c, keyFromPath(c))
})

function keyFromPath(c: AppContext): string {
  return c.req.path.slice('/internal/unprocessed/'.length)
}

async function getUnprocessedObject(c: AppContext, key: string): Promise<Response> {
  if (!key.startsWith('inbound/')) return c.notFound()

  const object = await c.env.R2.get(key)
  if (!object) return c.notFound()

  return new Response(object.body, {
    headers: { 'Content-Type': 'message/rfc822' },
  })
}

async function deleteUnprocessedObject(
  c: AppContext,
  key: string,
): Promise<Response> {
  if (!key.startsWith('inbound/')) return c.notFound()

  const object = await c.env.R2.get(key)
  if (!object) return c.notFound()

  const processedKey = 'processed/' + key.slice('inbound/'.length)
  await c.env.R2.put(processedKey, object.body, {
    httpMetadata: object.httpMetadata,
    customMetadata: object.customMetadata ?? undefined,
  })
  await c.env.R2.delete(key)

  return c.json({ ok: true, processedKey })
}

export default {
  async email(message: ForwardableEmailMessage, env: WorkerBindings, _ctx: ExecutionContext) {
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
