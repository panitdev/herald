import type { Meta, StoryObj } from "@storybook/react-vite"

import { Reauth, SurgeAuthProvider } from "@/components/ui/surge-auth"
import { HeraldLogo } from "@/components/ui/logos"
import { API_URL } from "@/lib/env"

const meta = {
  title: "Auth/Reauth",
  component: Reauth,
  tags: ["autodocs"],
  args: {
    open: true,
  },
  decorators: [
    (Story) => (
      // `autoRefresh={false}` keeps the story off the whoami request; the flow
      // itself still talks to the perimeter when submitted.
      <SurgeAuthProvider
        baseUrl={API_URL}
        mode="inline"
        mark={<HeraldLogo size={28} />}
        autoRefresh={false}
      >
        <div className="h-[320px]">
          <Story />
        </div>
      </SurgeAuthProvider>
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
