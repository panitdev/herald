"use client"

import { useState, type FormEvent, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-store"

type Mode = "login" | "register"

const stageVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 28 : -28,
    opacity: 0,
    filter: "blur(6px)",
  }),
  center: {
    x: 0,
    opacity: 1,
    filter: "blur(0px)",
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -28 : 28,
    opacity: 0,
    filter: "blur(6px)",
  }),
}

const stageTransition = { duration: 0.42, ease: [0.22, 1, 0.36, 1] as const }

export function AuthScreen() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>("login")
  const [stage, setStage] = useState<0 | 1>(0)
  const [direction, setDirection] = useState(1)

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPwd, setShowPwd] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  function switchMode(next: Mode) {
    if (next === mode || submitting) return
    setMode(next)
    setStage(0)
    setDirection(-1)
    setPassword("")
    setConfirm("")
    setShowPwd(false)
  }

  async function handleNext(e?: FormEvent) {
    e?.preventDefault()
    if (submitting) return

    if (stage === 0) {
      const value = username.trim()
      if (!value) {
        toast.error("Please enter an email address")
        return
      }
      if (!value.includes("@")) {
        toast.error("Please enter a valid email address")
        return
      }
      setDirection(1)
      setStage(1)
      return
    }

    if (!password) {
      toast.error("Please enter your password")
      return
    }
    if (mode === "register") {
      if (password.length < 8) {
        toast.error("Password must be at least 8 characters")
        return
      }
      if (password !== confirm) {
        toast.error("Passwords do not match")
        return
      }
    }

    setSubmitting(true)
    try {
      if (mode === "register") {
        await register(username.trim(), password)
        toast.success(`Welcome to Herald, ${username.trim().split("@")[0]}`)
      } else {
        await login(username.trim(), password)
        toast.success("Signed in successfully")
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed")
    } finally {
      setSubmitting(false)
    }
  }

  function handleBack() {
    if (submitting) return
    setDirection(-1)
    setStage(0)
  }

  const headings = {
    login: ["Welcome back", "Enter your password"],
    register: ["Create your account", "Set a password"],
  } as const

  const subs = {
    login: [
      "Sign in to continue to Herald.",
      `Signing in as ${username || "your account"}.`,
    ],
    register: [
      "Pick an email to get started.",
      "Use at least 8 characters to keep things safe.",
    ],
  } as const

  const primaryLabel =
    stage === 0 ? "Continue" : mode === "login" ? "Sign in" : "Create account"

  return (
    <div className="relative flex h-dvh w-full items-center justify-center overflow-hidden bg-background p-4">
      {/* Subtle dotted background, faded at the edges */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(var(--border)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_15%,transparent_70%)]"
      />

      <div className="relative z-10 w-full max-w-[400px]">
        {/* Brand */}
        <div className="mb-6 flex flex-col items-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/20">
            <Mail className="size-5" />
          </div>
          <span className="text-[13px] font-medium tracking-tight text-foreground">
            Herald
          </span>
        </div>

        {/* Mode toggle */}
        <div className="mx-auto mb-5 flex w-fit items-center gap-1 rounded-full border bg-card p-1 shadow-sm">
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={cn(
                "relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                mode === m
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {mode === m && (
                <motion.span
                  layoutId="auth-tab-pill"
                  className="absolute inset-0 rounded-full bg-secondary"
                  transition={{ type: "spring", stiffness: 360, damping: 30 }}
                />
              )}
              <span className="relative z-10">
                {m === "login" ? "Sign in" : "Sign up"}
              </span>
            </button>
          ))}
        </div>

        {/* Card */}
        <div className="rounded-2xl border bg-card p-6 shadow-xl shadow-foreground/[0.04]">
          {/* Animated heading */}
          <div className="relative mb-5 h-[54px] overflow-hidden">
            <AnimatePresence custom={direction} initial={false}>
              <motion.div
                key={`${mode}-head-${stage}`}
                custom={direction}
                variants={stageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={stageTransition}
                className="absolute inset-0"
              >
                <h1 className="text-pretty text-xl font-semibold tracking-tight">
                  {headings[mode][stage]}
                </h1>
                <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                  {subs[mode][stage]}
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          <form onSubmit={handleNext} noValidate>
            {/* Animated stage */}
            <div className="relative h-[200px]">
              <AnimatePresence custom={direction} initial={false}>
                <motion.div
                  key={`${mode}-stage-${stage}`}
                  custom={direction}
                  variants={stageVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={stageTransition}
                  className="absolute inset-0 flex flex-col gap-3"
                >
                  {stage === 0 ? (
                    <Field
                      id="username"
                      label="Email"
                      icon={<User className="size-4" />}
                      autoFocus
                      autoComplete="email"
                      value={username}
                      onChange={setUsername}
                      placeholder="you@example.com"
                    />
                  ) : (
                    <>
                      <Field
                        id="password"
                        label="Password"
                        icon={<Lock className="size-4" />}
                        autoFocus
                        autoComplete={
                          mode === "login" ? "current-password" : "new-password"
                        }
                        type={showPwd ? "text" : "password"}
                        value={password}
                        onChange={setPassword}
                        placeholder="••••••••"
                        rightSlot={
                          <button
                            type="button"
                            onClick={() => setShowPwd((v) => !v)}
                            aria-label={
                              showPwd ? "Hide password" : "Show password"
                            }
                            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                          >
                            {showPwd ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </button>
                        }
                      />
                      {mode === "register" ? (
                        <Field
                          id="confirm"
                          label="Confirm password"
                          icon={<Lock className="size-4" />}
                          autoComplete="new-password"
                          type={showPwd ? "text" : "password"}
                          value={confirm}
                          onChange={setConfirm}
                          placeholder="••••••••"
                        />
                      ) : (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              toast.message(
                                "A reset link would be sent to your inbox.",
                              )
                            }
                            className="text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                          >
                            Forgot password?
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Stage indicator + actions */}
            <div className="flex items-center justify-between">
              <div
                className="flex items-center gap-1.5"
                aria-label={`Step ${stage + 1} of 2`}
              >
                {[0, 1].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300 ease-out",
                      stage >= i ? "w-6 bg-primary" : "w-3 bg-border",
                    )}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  disabled={stage === 0 || submitting}
                  className={cn(
                    "transition-opacity",
                    stage === 0 && "pointer-events-none opacity-0",
                  )}
                >
                  <ArrowLeft />
                  Back
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting}
                  className="min-w-[132px]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Just a sec
                    </>
                  ) : (
                    <>
                      {primaryLabel}
                      {stage === 0 ? <ArrowRight /> : <Check />}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          {mode === "login" ? "New to Herald? " : "Already have an account? "}
          <button
            type="button"
            onClick={() =>
              switchMode(mode === "login" ? "register" : "login")
            }
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {mode === "login" ? "Create an account" : "Sign in instead"}
          </button>
        </p>
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  icon,
  rightSlot,
  value,
  onChange,
  type = "text",
  placeholder,
  autoFocus,
  autoComplete,
}: {
  id: string
  label: string
  icon: ReactNode
  rightSlot?: ReactNode
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  autoFocus?: boolean
  autoComplete?: string
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      <div className="group flex h-11 items-center gap-2 rounded-lg border bg-background px-3 transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
        <span className="text-muted-foreground transition-colors group-focus-within:text-foreground">
          {icon}
        </span>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          spellCheck={false}
          className="flex-1 bg-transparent text-sm tracking-tight outline-none placeholder:text-muted-foreground/60"
        />
        {rightSlot}
      </div>
    </div>
  )
}
