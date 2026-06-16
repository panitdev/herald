"use client"

type SafeEmailBodyProps = {
  body: string
  format: "html" | "text"
  messageId: string
}

export function SafeEmailBody({ body, format, messageId }: SafeEmailBodyProps) {
  if (format !== "html") {
    return (
      <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">
        {body}
      </div>
    )
  }

  return (
    <iframe
      title="Email content"
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      srcDoc={body}
      className="h-[70vh] w-full rounded-xl border border-border bg-white"
    />
  )
}
