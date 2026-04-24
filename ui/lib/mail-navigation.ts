"use client"

export const navigateToMail = (id: string) => {
  window.history.pushState({}, "", `/mail/${id}`)
}

export const navigateToMailbox = (mailbox: string) => {
  window.history.pushState({}, "", `/${mailbox}`)
}

export const navigateToRoot = () => {
  window.history.pushState({}, "", "/")
}

export const getMailIdFromUrl = (): string | null => {
  const path = window.location.pathname
  const match = path.match(/^\/mail\/(.+)$/)
  return match ? match[1] : null
}

export const getMailboxFromUrl = (): string | null => {
  const path = window.location.pathname
  const match = path.match(/^\/(inbox|sent|drafts|starred|archive|trash)$/)
  return match ? match[1] : null
}