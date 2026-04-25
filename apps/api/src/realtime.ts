// apps/api/src/realtime.ts
// Durable Object for real-time WebSocket notifications per mailbox

export class MailboxRealtime {
  constructor(
    private state: DurableObjectState,
    private env: unknown
  ) {}

  async fetch(req: Request) {
    const url = new URL(req.url)

    // WebSocket upgrade for client connections
    if (url.pathname === "/ws") {
      const pair = new WebSocketPair()
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket]

      this.state.acceptWebSocket(server)

      return new Response(null, {
        status: 101,
        webSocket: client,
      })
    }

    // Internal notify endpoint called by Email Worker
    if (url.pathname === "/notify" && req.method === "POST") {
      const event = await req.json()

      for (const ws of this.state.getWebSockets()) {
        ws.send(JSON.stringify(event))
      }

      return Response.json({ ok: true })
    }

    return new Response("not found", { status: 404 })
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    // Handle messages from clients (e.g., ping/pong)
    if (typeof message === "string") {
      if (message === "ping") {
        ws.send("pong")
      }
    }
  }

  async webSocketClose(ws: WebSocket) {
    // Clean up when WebSocket closes
  }
}