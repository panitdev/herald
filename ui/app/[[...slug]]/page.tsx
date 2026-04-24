import { ClientWrapper } from "@/components/email/client-wrapper"
import { Toaster } from "@/components/ui/sonner"

export default function Page() {
  return (
    <main className="h-dvh w-full overflow-hidden">
      <ClientWrapper />
      <Toaster position="bottom-right" richColors closeButton />
    </main>
  )
}
