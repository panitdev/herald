"use client"

import dynamic from "next/dynamic"

export function ClientWrapper() {
  const EmailClient = dynamic(
    () => import("@/components/email/email-client").then((mod) => mod.EmailClient),
    { ssr: false, loading: () => <div className="h-dvh w-full" /> },
  )

  return <EmailClient />
}