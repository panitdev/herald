"use client"

import * as React from "react"
import { Check, AlertCircle } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"

import { PANIT_DEFAULT_EASE } from "@/lib/motion"
import { cn } from "@/lib/utils"

type AnimatedFieldProps = {
  id: string
  label: string
  type?: React.HTMLInputTypeAttribute
  value: string
  onChange: (v: string) => void
  placeholder?: string
  autoComplete?: string
  autoFocus?: boolean
  validate?: (v: string) => string | null
  required?: boolean
  disabled?: boolean
  icon?: React.ReactNode
  rightSlot?: React.ReactNode
}

export function AnimatedField({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
  autoFocus,
  validate,
  required,
  disabled,
  icon,
  rightSlot,
}: AnimatedFieldProps) {
  const [touched, setTouched] = React.useState(false)
  const [focused, setFocused] = React.useState(false)
  const errorId = `${id}-error`

  const error = validate ? validate(value) : null
  const valid = value.length > 0 && !error
  const showError = touched && !focused && !!error

  return (
    <div className="w-full">
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-medium text-foreground/80"
      >
        {label}
        {required && <span className="ml-0.5 text-accent-foreground/70">*</span>}
      </label>
      <div
        className={cn(
          "group relative flex items-center rounded-lg border bg-card transition-all duration-200",
          disabled
            ? "border-border bg-muted/40 opacity-80"
            : focused
            ? "border-primary ring-4 ring-primary/10"
            : showError
              ? "border-destructive/70 ring-4 ring-destructive/10"
              : "border-border hover:border-foreground/20"
        )}
      >
        {icon && (
          <div className="pl-3 text-muted-foreground transition-colors group-focus-within:text-primary">
            {icon}
          </div>
        )}
        <input
          id={id}
          type={type}
          value={value}
          required={required}
          disabled={disabled}
          aria-invalid={showError}
          aria-describedby={showError ? errorId : undefined}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            setTouched(true)
          }}
          className="w-full bg-transparent px-3 py-2.5 text-[15px] text-foreground outline-none placeholder:text-muted-foreground/70 disabled:cursor-not-allowed"
        />
        <div className="flex h-full items-center pr-3 gap-1">
          {rightSlot}
          <AnimatePresence mode="wait" initial={false}>
            {showError ? (
              <motion.span
                key="error"
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 22 }}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"
              >
                <AlertCircle className="block h-4 w-4" strokeWidth={2.25} />
              </motion.span>
            ) : valid && !rightSlot ? (
              <motion.span
                key="valid"
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                exit={{ scale: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 22 }}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"
              >
                <Check className="block h-3.5 w-3.5" strokeWidth={3} />
              </motion.span>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
      <motion.div
        initial={false}
        animate={{
          height: showError ? "auto" : 0,
          opacity: showError ? 1 : 0,
          marginTop: showError ? 4 : 0,
        }}
        transition={{
          height: { duration: 0.18, ease: PANIT_DEFAULT_EASE },
          opacity: { duration: 0.12, ease: "easeOut" },
          marginTop: { duration: 0.18, ease: PANIT_DEFAULT_EASE },
        }}
        className="overflow-hidden text-xs"
      >
        <motion.p
          id={errorId}
          initial={false}
          animate={{ y: showError ? 0 : -4 }}
          transition={{ duration: 0.15, ease: PANIT_DEFAULT_EASE }}
          className="text-destructive"
        >
          {error ?? ""}
        </motion.p>
      </motion.div>
    </div>
  )
}
