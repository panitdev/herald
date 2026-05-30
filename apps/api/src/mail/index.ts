import { BrevoMailSender } from "./brevo"
import { ResendMailSender } from "./resend"
import type { MailAddress, MailSender, SendMailInput } from "./types"

export type { MailAddress, MailSender, SendMailInput, SendMailResult } from "./types"

export type MailProviderEnv = {
  MAIL_PROVIDER?: string
  BREVO_API_KEY?: string
  RESEND_API_KEY?: string
}

export function createMailSender(env: MailProviderEnv): MailSender {
  const provider = env.MAIL_PROVIDER ?? "brevo"

  if (provider === "brevo") {
    if (!env.BREVO_API_KEY) {
      throw new Error("BREVO_API_KEY is not configured")
    }
    return new BrevoMailSender(env.BREVO_API_KEY)
  }

  if (provider === "resend") {
    if (!env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured")
    }
    return new ResendMailSender(env.RESEND_API_KEY)
  }

  throw new Error(`Unsupported mail provider: ${provider}`)
}

export function normalizeAddress(value: string): MailAddress | null {
  const trimmed = value.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return null
  }
  return { email: trimmed }
}

export function createRawEmail(input: SendMailInput, date: string): string {
  const headers = [
    `From: ${formatAddress(input.from)}`,
    `To: ${input.to.map(formatAddress).join(", ")}`,
    `Subject: ${input.subject}`,
    `Date: ${new Date(date).toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
  ]

  if (input.replyTo) {
    headers.splice(2, 0, `Reply-To: ${formatAddress(input.replyTo)}`)
  }

  return `${headers.join("\r\n")}\r\n\r\n${input.text}`
}

function formatAddress(address: MailAddress): string {
  if (!address.name) {
    return address.email
  }

  const escapedName = address.name.replace(/"/g, '\\"')
  return `"${escapedName}" <${address.email}>`
}
