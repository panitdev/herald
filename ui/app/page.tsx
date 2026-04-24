import { EmailClient } from "@/components/email/email-client"
import { Toaster } from "@/components/ui/sonner"

export default function Page() {
  return (
    <main className="h-dvh w-full overflow-hidden">
      <EmailClient />
      <Toaster position="bottom-right" richColors closeButton />
    </main>
  )
}
