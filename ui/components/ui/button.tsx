"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { AnimatePresence, motion } from "framer-motion"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border text-sm font-medium select-none outline-none transition-colors disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:ring-[3px] focus-visible:ring-ring/50",
  {
    variants: {
      variant: {
        default:
          "border-none bg-primary text-primary-foreground shadow-[0_1px_0_0_oklch(1_0_0_/_0.15)_inset,0_8px_20px_-8px_color-mix(in_oklab,var(--primary)_55%,transparent)] hover:bg-primary/90",
        destructive:
          "border-none bg-destructive text-white shadow-[0_1px_0_0_oklch(1_0_0_/_0.12)_inset,0_8px_20px_-8px_color-mix(in_oklab,var(--destructive)_45%,transparent)] hover:bg-destructive/90 focus-visible:ring-destructive/20",
        outline:
          "border-border bg-card text-foreground hover:border-foreground/30",
        secondary:
          "border-none bg-secondary text-secondary-foreground hover:bg-secondary/85",
        ghost:
          "border-none bg-transparent text-foreground hover:bg-muted",
        link:
          "h-auto rounded-none border-none bg-transparent px-0 py-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2 has-[>svg]:px-4",
        xs: "h-8 px-3 py-1.5 text-xs has-[>svg]:px-2.5",
        sm: "h-9 px-4 py-1.5 has-[>svg]:px-3.5",
        lg: "h-11 px-6 py-2.5 has-[>svg]:px-5",
        icon: "size-10",
        "icon-xs": "size-8",
        "icon-sm": "size-9",
        "icon-lg": "size-11",
      },
      fullWidth: {
        true: "w-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    loading?: boolean
    loadingText?: React.ReactNode
  }

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  loadingText,
  disabled,
  children,
  fullWidth,
  onClick,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading

  const content = (
    <AnimatePresence mode="wait" initial={false}>
      {loading ? (
        <motion.span
          key="loading"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="inline-flex items-center gap-2"
        >
          <Loader2 className="size-4 animate-spin" />
          {loadingText ?? children}
        </motion.span>
      ) : (
        <motion.span
          key="idle"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          className="inline-flex items-center gap-2"
        >
          {children}
        </motion.span>
      )}
    </AnimatePresence>
  )

  if (asChild) {
    return (
      <Slot
        data-slot="button"
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        {...props}
      >
        {children}
      </Slot>
    )
  }

  return (
    <motion.button
      data-slot="button"
      whileTap={isDisabled ? undefined : { scale: 0.97 }}
      whileHover={isDisabled ? undefined : { y: -1 }}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      className={cn(buttonVariants({ variant, size, fullWidth, className }))}
      disabled={isDisabled}
      onClick={onClick}
      {...(props as React.ComponentProps<typeof motion.button>)}
    >
      {content}
    </motion.button>
  )
}

export { Button, buttonVariants }
