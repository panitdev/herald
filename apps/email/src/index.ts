// apps/email/src/index.ts
// Cloudflare Email Worker - handles incoming emails

import PostalMime from "postal-mime"

type Env = {
  DB: D1Database
  MAIL_BUCKET: R2Bucket
  INGEST_QUEUE: Queue
  MAILBOX_REALTIME: DurableObjectNamespace
}

type EmailMessage = {
  to: string
  from: string
  raw: ArrayBuffer
}

export default {
  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext) {
    const address = message.to.toLowerCase()
    const messageId = crypto.randomUUID()

    // Look up user by address
    const user = await env.DB.prepare(
      "SELECT id FROM users WHERE address = ?"
    ).bind(address).first() as { id: string } | undefined

    if (!user) {
      // Reject - user not found
      console.log(`Rejecting email for unknown address: ${address}`)
      return new Response("550 user not found", { status: 550 })
    }

    // Get user's inbox folder
    const inbox = await env.DB.prepare(
      "SELECT id FROM mailboxes WHERE user_id = ? AND name = 'inbox'"
    ).bind(user.id).first() as { id: string } | undefined

    if (!inbox) {
      console.error(`No inbox folder for user: ${user.id}`)
      return new Response("550 mailbox error", { status: 550 })
    }

    const mailboxId = inbox.id
    const rawKey = `raw/${mailboxId}/${messageId}.eml`

    // Store raw email to R2
    const raw = await new Response(message.raw).arrayBuffer()
    await env.MAIL_BUCKET.put(rawKey, raw)

    // Parse email
    const parsed = await PostalMime.parse(raw)

    // Extract fields
    const fromAddr = parsed.from?.address ?? "unknown"
    const subject = parsed.subject ?? ""
    const preview = parsed.text?.slice(0, 240) ?? ""
    const threadId = parsed.references?.[0] ?? messageId
    const providerMessageId = parsed.messageId ?? null

    // Insert metadata to D1
    await env.DB.prepare(
      `INSERT INTO messages
        (id, mailbox_id, thread_id, provider_message_id, from_addr, subject, preview, r2_raw_key, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      messageId,
      mailboxId,
      threadId,
      providerMessageId,
      fromAddr,
      subject,
      preview,
      rawKey,
      new Date().toISOString()
    ).run()

    // Queue for async processing (attachments, search indexing)
    // Use address for queue message (not UUID) - more readable
    ctx.waitUntil(
      env.INGEST_QUEUE.send({
        type: "mail.ingest",
        address,
        messageId,
        rawKey,
      })
    )

    // Notify connected WebSocket clients
    const id = env.MAILBOX_REALTIME.idFromName(`mailbox:${user.id}`)
    const stub = env.MAILBOX_REALTIME.get(id)

    ctx.waitUntil(
      stub.fetch("https://mailbox-realtime/notify", {
        method: "POST",
        body: JSON.stringify({
          type: "mail.created",
          mailboxId,
          messageId,
          from: fromAddr,
          subject,
          receivedAt: new Date().toISOString(),
        }),
      })
    )
  },
}
