import type { MailSender, SendMailInput, SendMailResult } from "./types"

type BrevoSendEmailResponse = {
  messageId?: string
}

type BrevoErrorResponse = {
  code?: string
  message?: string
}

export class BrevoMailSender implements MailSender {
  constructor(private readonly apiKey: string) {}

  async send(input: SendMailInput): Promise<SendMailResult> {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": this.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: input.from,
        to: input.to,
        replyTo: input.replyTo,
        subject: input.subject,
        textContent: input.text,
      }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as BrevoErrorResponse
      const detail = error.message ? `: ${error.message}` : ""
      throw new Error(`Brevo send failed (${response.status})${detail}`)
    }

    const data = await response.json() as BrevoSendEmailResponse
    return {
      provider: "brevo",
      providerMessageId: data.messageId ?? null,
    }
  }
}
