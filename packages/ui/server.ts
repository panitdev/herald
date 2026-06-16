import app from "./dist/server/server.js"

const port = Number(process.env.PORT ?? 3000)
const hostname = process.env.HOST ?? "0.0.0.0"

function staticResponse(pathname: string) {
  const file = Bun.file(`./dist/client${pathname}`)

  return file.exists().then((exists) => (exists ? new Response(file) : undefined))
}

Bun.serve({
  port,
  hostname,
  async fetch(request) {
    const url = new URL(request.url)

    if (url.pathname !== "/") {
      const response = await staticResponse(url.pathname)

      if (response) {
        return response
      }
    }

    return app.fetch(request)
  },
})
