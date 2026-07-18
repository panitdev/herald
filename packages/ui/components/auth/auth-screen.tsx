"use client"

import { useEffect } from "react"
import { motion } from "framer-motion"
import { Mail } from "lucide-react"
import { initiateLogin } from "@/lib/surge"
import { AmbientBackground } from "@/components/ui/ambient-background"

type Props = {
  login?: () => void
}

export function AuthScreen({ login = initiateLogin }: Props) {
  useEffect(() => {
    login()
  }, [login])

  return (
    <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-background">
      <AmbientBackground />
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center gap-2.5"
      >
        <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_8px_20px_-8px_color-mix(in_oklab,var(--primary)_55%,transparent)]">
          <Mail className="size-5" />
        </div>
        <span className="font-serif text-[13px] font-medium tracking-tight text-foreground">
          Herald
        </span>
        <p className="mt-1 text-xs text-muted-foreground">Redirecting to sign in…</p>
      </motion.div>
    </div>
  )
}
