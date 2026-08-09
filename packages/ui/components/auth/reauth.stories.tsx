import type { Meta, StoryObj } from "@storybook/react-vite"

import { Reauth } from "@/components/auth/reauth"
import { AuthProvider, type AuthUser } from "@/lib/auth-store"

const signedIn: AuthUser = {
  id: "1",
  address: "ada@panit.dev",
  addresses: ["ada@panit.dev"],
  username: "ada",
  displayName: "Ada",
  avatarUrl: null,
}

const meta = {
  title: "Auth/Reauth",
  component: Reauth,
  tags: ["autodocs"],
  args: {
    open: true,
  },
  decorators: [
    (Story) => (
      // `autoRefresh={false}` keeps the story off the network; the user only
      // matters because Reauth calls `refresh()` after a successful sign-in.
      <AuthProvider initialUser={signedIn} autoRefresh={false}>
        <div className="h-[320px]">
          <Story />
        </div>
      </AuthProvider>
    ),
  ],
} satisfies Meta<typeof Reauth>

export default meta

type Story = StoryObj<typeof meta>

/**
 * Signed out and expired-mid-session render identically — the difference is
 * only whether `AuthGate` leaves the app mounted behind the overlay.
 */
export const SignIn: Story = {}

/** Authenticated: mounted but closed, so the close animation has somewhere to run. */
export const Closed: Story = {
  args: {
    open: false,
  },
}
