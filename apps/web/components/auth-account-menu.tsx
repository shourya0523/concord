"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { cn } from "@ibpe/ui/lib/utils"

import { authClient } from "@/lib/auth/client"

type Props = {
  className?: string
  compact?: boolean
}

/**
 * Session-aware account control for chrome (sidebar / settings).
 * Uses /api/auth get-session — shows Sign in when anonymous or auth stubbed.
 */
export function AuthAccountMenu({ className, compact = false }: Props) {
  const router = useRouter()
  const { data, isPending } = authClient.useSession()

  async function signOut() {
    await authClient.signOut()
    router.refresh()
    router.push("/sign-in")
  }

  if (isPending) {
    return (
      <p className={cn("text-xs text-chrome-muted", className)} aria-live="polite">
        …
      </p>
    )
  }

  const user = data?.user
  if (!user) {
    return (
      <div className={cn("space-y-1", className)}>
        <Link
          href="/sign-in"
          className="block text-xs text-chrome-muted hover:text-chrome-text"
        >
          Sign in
        </Link>
        {!compact ? (
          <Link
            href="/sign-up"
            className="block text-[10px] text-chrome-muted hover:text-chrome-text"
          >
            Create account
          </Link>
        ) : null}
      </div>
    )
  }

  const label = user.name?.trim() || user.email || "Account"

  return (
    <div className={cn("space-y-1", className)}>
      <Link
        href="/settings"
        className="block truncate text-xs font-medium text-chrome-text hover:underline"
        title={user.email ?? label}
      >
        {compact ? label.split("@")[0] : label}
      </Link>
      <button
        type="button"
        onClick={() => void signOut()}
        className="block text-[10px] text-chrome-muted hover:text-chrome-text"
      >
        Sign out
      </button>
    </div>
  )
}
