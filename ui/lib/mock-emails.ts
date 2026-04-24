export type Folder = "inbox" | "starred" | "sent" | "drafts" | "archive" | "trash"

export type Email = {
  id: string
  from: {
    name: string
    email: string
    initials: string
    color: string
  }
  to: string
  subject: string
  preview: string
  body: string
  date: string // ISO
  read: boolean
  starred: boolean
  folder: Folder
  labels?: string[]
  hasAttachment?: boolean
}

const avatarColors = [
  "oklch(0.75 0.12 30)",
  "oklch(0.72 0.14 200)",
  "oklch(0.78 0.13 90)",
  "oklch(0.74 0.15 330)",
  "oklch(0.7 0.16 258)",
  "oklch(0.76 0.12 150)",
  "oklch(0.73 0.14 60)",
]

function pickColor(seed: string) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return avatarColors[h % avatarColors.length]
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function from(name: string, email: string) {
  return { name, email, initials: initials(name), color: pickColor(email) }
}

const now = new Date()
function hoursAgo(h: number) {
  return new Date(now.getTime() - h * 60 * 60 * 1000).toISOString()
}
function daysAgo(d: number) {
  return new Date(now.getTime() - d * 24 * 60 * 60 * 1000).toISOString()
}

export const INITIAL_EMAILS: Email[] = [
  {
    id: "e1",
    from: from("Maya Chen", "maya@linear.app"),
    to: "you@inbox.co",
    subject: "Q3 roadmap review — please share feedback",
    preview:
      "Hey, I've put together a draft of the Q3 roadmap based on last week's planning session. Would love your thoughts before Friday's sync...",
    body: `Hey,

I've put together a draft of the Q3 roadmap based on last week's planning session. A few highlights worth flagging:

• Shipping the new inbox layout by mid-August
• Threaded replies will land in the next minor release
• We're deprioritizing the labels redesign — it can wait until Q4

Would love your thoughts before Friday's sync. Happy to jump on a quick call if it's easier.

Thanks,
Maya`,
    date: hoursAgo(0.5),
    read: false,
    starred: true,
    folder: "inbox",
    labels: ["work"],
    hasAttachment: true,
  },
  {
    id: "e2",
    from: from("GitHub", "noreply@github.com"),
    to: "you@inbox.co",
    subject: "[vercel/next.js] PR #84213 merged into canary",
    preview:
      "Your pull request 'fix: prevent hydration mismatch on streamed routes' was merged by leerob. The changes are now on canary...",
    body: `Your pull request 'fix: prevent hydration mismatch on streamed routes' was merged by leerob.

The changes are now on canary and will ship with the next minor release.

— GitHub`,
    date: hoursAgo(2),
    read: false,
    starred: false,
    folder: "inbox",
    labels: ["updates"],
  },
  {
    id: "e3",
    from: from("Jonas Weber", "jonas@figma.com"),
    to: "you@inbox.co",
    subject: "Re: Landing page explorations",
    preview:
      "These are looking great. I pushed two more variants to the file — one with a tighter hero and one that experiments with a split layout...",
    body: `These are looking great.

I pushed two more variants to the file — one with a tighter hero and one that experiments with a split layout. Curious which direction you lean toward.

Also, would it help to pair on the motion spec tomorrow? I have time after 2pm.

Jonas`,
    date: hoursAgo(5),
    read: true,
    starred: false,
    folder: "inbox",
    labels: ["design"],
  },
  {
    id: "e4",
    from: from("Stripe", "receipts@stripe.com"),
    to: "you@inbox.co",
    subject: "Your receipt from Acme Inc. — $42.00",
    preview:
      "Thanks for your payment. This email confirms your charge of $42.00 USD on April 23, 2026. A copy is attached for your records...",
    body: `Thanks for your payment.

This email confirms your charge of $42.00 USD on April 23, 2026.

A copy is attached for your records.

— Stripe`,
    date: hoursAgo(9),
    read: true,
    starred: false,
    folder: "inbox",
    hasAttachment: true,
  },
  {
    id: "e5",
    from: from("Priya Patel", "priya@notion.so"),
    to: "you@inbox.co",
    subject: "Dinner Friday?",
    preview:
      "Hey! A few of us are grabbing dinner at that new ramen place in the Mission on Friday. Doors at 7. Want to join?",
    body: `Hey!

A few of us are grabbing dinner at that new ramen place in the Mission on Friday. Doors at 7.

Want to join? No pressure — just let me know by Thursday so I can update the reservation.

xo Priya`,
    date: hoursAgo(22),
    read: false,
    starred: true,
    folder: "inbox",
    labels: ["personal"],
  },
  {
    id: "e6",
    from: from("Linear", "team@linear.app"),
    to: "you@inbox.co",
    subject: "Weekly digest — 12 issues closed",
    preview:
      "Here's what your team shipped this week. 12 issues closed, 4 cycles completed, and your velocity is up 8% from last week...",
    body: `Here's what your team shipped this week.

• 12 issues closed
• 4 cycles completed
• Velocity up 8% week over week

Keep up the great work.

— Linear`,
    date: daysAgo(1),
    read: true,
    starred: false,
    folder: "inbox",
  },
  {
    id: "e7",
    from: from("Alex Ruiz", "alex@vercel.com"),
    to: "you@inbox.co",
    subject: "Intro: Sarah from Modal",
    preview:
      "Making the intro I mentioned — Sarah is leading growth at Modal and would be a great person for you to chat with about distribution...",
    body: `Making the intro I mentioned.

Sarah, meet my friend. Friend, meet Sarah — she's leading growth at Modal and would be a great person for you to chat with about distribution.

I'll let you two take it from here.

Alex`,
    date: daysAgo(2),
    read: true,
    starred: false,
    folder: "inbox",
    labels: ["intro"],
  },
  {
    id: "e8",
    from: from("Spotify", "no-reply@spotify.com"),
    to: "you@inbox.co",
    subject: "Your April Wrapped is here",
    preview:
      "You listened to 148 hours of music this month. Your top artist was Phoebe Bridgers, and you discovered 32 new tracks...",
    body: `You listened to 148 hours of music this month.

Your top artist was Phoebe Bridgers, and you discovered 32 new tracks.

Open Spotify to see your full wrapped.`,
    date: daysAgo(3),
    read: true,
    starred: false,
    folder: "inbox",
  },
  {
    id: "e9",
    from: from("You", "you@inbox.co"),
    to: "team@acme.co",
    subject: "Notes from today's planning",
    preview:
      "Quick recap of what we landed on in planning today. Let me know if I missed anything or if you want to revisit any of the decisions...",
    body: `Quick recap of what we landed on in planning today.

1. Ship the new settings page next sprint
2. Defer billing redesign to Q4
3. Hire two more engineers by end of July

Let me know if I missed anything.`,
    date: daysAgo(1),
    read: true,
    starred: false,
    folder: "sent",
  },
  {
    id: "e10",
    from: from("You", "you@inbox.co"),
    to: "maya@linear.app",
    subject: "Draft — thoughts on the roadmap",
    preview: "A few initial thoughts before I send this over...",
    body: `A few initial thoughts before I send this over...`,
    date: hoursAgo(3),
    read: true,
    starred: false,
    folder: "drafts",
  },
]
