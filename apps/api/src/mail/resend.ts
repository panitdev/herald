import type { MailAddress, MailSender, SendMailInput, SendMailResult } from "./types"

type ResendSendEmailResponse = {
  id?: string
}

type ResendErrorResponse = {
  message?: string
  name?: string
}

export class ResendMailSender implements MailSender {
  constructor(private readonly apiKey: string) {}

  async send(input: SendMailInput): Promise<SendMailResult> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: formatAddress(input.from),
        to: input.to.map((address) => address.email),
        reply_to: input.replyTo?.email,
        subject: input.subject,
        text: input.text,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as ResendErrorResponse
      const detail = error.message ? `: ${error.message}` : ""
      throw new Error(`Resend send failed (${response.status})${detail}`)
    }

    const data = await response.json() as ResendSendEmailResponse
    return {
      provider: "resend",
      providerMessageId: data.id ?? null,
    }
  }
}

function formatAddress(address: MailAddress): string {
  if (!address.name) {
    return address.email
  }

  const escapedName = address.name.replace(/"/g, '\\"')
  return `"${escapedName}" <${address.email}>`
}

