"use client"

import { AnimatePresence, motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import { Eye, EyeOff, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-store"

type Mode = "login" | "register"

export function AuthScreen() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)

  // Apply system theme while auth screen is mounted
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)")
    const apply = () => document.documentElement.classList.toggle("dark", mql.matches)
    apply()
    mql.addEventListener("change", apply)
    return () => mql.removeEventListener("change", apply)
  }, [])

  useEffect(() => {
    emailRef.current?.focus()
  }, [mode])

  function switchMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      if (mode === "login") {
        await login(email, password)
      } else {
        await register(email, password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-background">
      {/* Background ambient orbs */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-primary/8 blur-3xl dark:bg-primary/5"
        animate={{ scale: [1, 1.12, 1], x: [0, 20, 0], y: [0, -12, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-32 h-[400px] w-[400px] rounded-full bg-primary/6 blur-3xl dark:bg-primary/4"
        animate={{ scale: [1, 1.18, 1], x: [0, -16, 0], y: [0, 18, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 3 }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-[300px] w-[300px] -translate-x-1/2 rounded-full bg-accent/50 blur-3xl dark:bg-accent/20"
        animate={{ scale: [1, 1.08, 1], y: [0, 10, 0] }}
        transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 6 }}
      />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.08 }}
        className="relative z-10 w-full max-w-[360px] px-4"
      >
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/8 dark:shadow-black/30">
          {/* Branding */}
          <div className="flex flex-col items-center gap-3 px-8 pb-5 pt-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 dark:bg-primary/15">
              <Mail className="h-5 w-5 text-primary" strokeWidth={1.75} />
            </div>
            <div className="text-center">
              <h1 className="text-[15px] font-semibold tracking-tight text-foreground">
                Herald
              </h1>
              <AnimatePresence mode="wait">
                <motion.p
                  key={mode}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  className="mt-0.5 text-sm text-muted-foreground"
                >
                  {mode === "login" ? "Welcome back" : "Create your account"}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          {/* Tab switcher */}
          <div className="mx-5 mb-0.5 flex rounded-lg bg-muted p-1">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={cn(
                  "relative flex-1 rounded-md py-1.5 text-[13px] font-medium transition-colors",
                  mode === m
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground/70",
                )}
              >
                {mode === m && (
                  <motion.div
                    layoutId="auth-tab-bg"
                    className="absolute inset-0 rounded-md bg-background shadow-xs"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative z-10">
                  {m === "login" ? "Sign in" : "Sign up"}
                </span>
              </button>
            ))}
          </div>

          {/* Form with slide transition */}
          <div className="overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.form
                key={mode}
                onSubmit={handleSubmit}
                initial={{ opacity: 0, x: mode === "register" ? 28 : -28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: mode === "register" ? -28 : 28 }}
                transition={{ type: "spring", stiffness: 360, damping: 34 }}
                className="flex flex-col gap-3.5 px-5 py-5"
              >
                {/* Email */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`email-${mode}`} className="text-[13px]">
                    Email
                  </Label>
                  <Input
                    ref={emailRef}
                    id={`email-${mode}`}
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                {/* Password */}
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`password-${mode}`} className="text-[13px]">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id={`password-${mode}`}
                      type={showPassword ? "text" : "password"}
                      autoComplete={mode === "login" ? "current-password" : "new-password"}
                      placeholder={mode === "register" ? "At least 8 characters" : "••••••••"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={loading}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Error message */}
                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, height: 0, marginTop: -4 }}
                      animate={{ opacity: 1, height: "auto", marginTop: 0 }}
                      exit={{ opacity: 0, height: 0, marginTop: -4 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden rounded-lg bg-destructive/10 px-3 py-2 text-[13px] text-destructive"
                    >
                      {error}
                    </motion.p>
                  )}
                </AnimatePresence>

                {/* Submit */}
                <motion.div whileTap={{ scale: 0.985 }}>
                  <Button
                    type="submit"
                    disabled={loading || !email || !password}
                    className="mt-0.5 h-9 w-full"
                  >
                    {loading && <Spinner className="mr-1.5 text-primary-foreground/70" />}
                    {mode === "login" ? "Sign in" : "Create account"}
                  </Button>
                </motion.div>
              </motion.form>
            </AnimatePresence>
          </div>

          {/* Footer hint */}
          <p className="pb-5 text-center text-[13px] text-muted-foreground">
            {mode === "login" ? (
              <>
                No account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="font-medium text-primary transition-opacity hover:opacity-80"
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have one?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="font-medium text-primary transition-opacity hover:opacity-80"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </motion.div>
    </div>
  )
}
