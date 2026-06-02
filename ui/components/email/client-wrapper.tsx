"use client"

import dynamic from "next/dynamic"
import { AnimatePresence, motion } from "framer-motion"
import { AuthProvider, useAuth } from "@/lib/auth-store"
import { AuthScreen } from "@/components/auth/auth-screen"

const EmailClient = dynamic(
  () => import("@/components/email/email-client").then((mod) => mod.EmailClient),
  { ssr: false, loading: () => <div className="h-dvh w-full bg-background" /> },
)

function AppContent() {
  const { user, initialized } = useAuth()

  if (!initialized) return <div className="h-dvh w-full bg-background" />

  return (
    <AnimatePresence mode="wait">
      {user ? (
        <motion.div
          key="app"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="h-dvh w-full"
        >
          <EmailClient />
        </motion.div>
      ) : (
        <motion.div
          key="auth"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="h-dvh w-full"
        >
          <AuthScreen />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ClientWrapper() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
