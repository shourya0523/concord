import { redirect } from "next/navigation"

import { TodayIsland } from "@/components/today-island"
import { homePathFor } from "@/lib/auth/post-auth"
import { isFlagOn } from "@/lib/flags"

export const metadata = {
  title: "Today · Concord",
  description: "Today's set, streak and readiness toward your target firms",
}

export const dynamic = "force-dynamic"

/** Post-login home (plan 2026-09-23-001 P4.4); /dashboard when daily_set is off. */
export default function TodayPage() {
  if (!isFlagOn("daily_set")) redirect(homePathFor(false))
  return <TodayIsland gamification={isFlagOn("gamification")} />
}
