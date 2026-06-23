"use client"

import { UserPlus, Users } from "lucide-react"

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandMenu({ open, onOpenChange }: Props) {
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput placeholder="Type a command..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Contacts">
            <CommandItem
              onSelect={() => {
                onOpenChange(false)
              }}
            >
              <UserPlus />
              <span>Add contact</span>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                onOpenChange(false)
              }}
            >
              <Users />
              <span>Show contacts</span>
            </CommandItem>
          </CommandGroup>
        </CommandList>

      </Command>
    </CommandDialog>
  )
}
