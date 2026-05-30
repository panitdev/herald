export type MailAddress = {
  email: string
  name?: string
}

export type SendMailInput = {
  from: MailAddress
  to: MailAddress[]
  subject: string
  text: string
  replyTo?: MailAddress
}

export type SendMailResult = {
  provider: string
  providerMessageId: string | null
}

export interface MailSender {
  send(input: SendMailInput): Promise<SendMailResult>
}

