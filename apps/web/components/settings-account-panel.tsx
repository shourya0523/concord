"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@ibpe/ui/components/button"
import { MetadataPill } from "@ibpe/ui/components/editorial"

import { authClient } from "@/lib/auth/client"

type Props = {
  configured: boolean
}

export function SettingsAccountPanel({ configured }: Props) {
  const router = useRouter()
  const { data, isPending } = authClient.useSession()
  const user = data?.user

  async function signOut() {
    await authClient.signOut()
    router.refresh()
    router.push("/sign-in")
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <MetadataPill tone="lime">Neon Auth</MetadataPill>
        <MetadataPill>{configured ? "configured" : "shell / stub"}</MetadataPill>
        {!isPending && user ? (
          <MetadataPill>signed in</MetadataPill>
        ) : !isPending ? (
          <MetadataPill>anonymous</MetadataPill>
        ) : null}
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Checking session…</p>
      ) : user ? (
        <div className="space-y-2">
          <p className="text-sm text-foreground">
            {user.name ? <span className="font-medium">{user.name}</span> : null}
            {user.name && user.email ? " · " : null}
            {user.email ? (
              <span className="text-muted-foreground">{user.email}</span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void signOut()}>
              Sign out
            </Button>
            <Link
              href="/onboarding"
              className="inline-flex h-8 items-center text-sm text-foreground underline-offset-4 hover:underline"
            >
              Edit prep onboarding →
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/sign-in" className="underline-offset-4 hover:underline">
            Sign in →
          </Link>
          <Link href="/sign-up" className="underline-offset-4 hover:underline">
            Create account →
          </Link>
        </div>
      )}

      <p className="max-w-xl text-sm text-muted-foreground">
        Product login uses Neon Auth. Profile, plans, and attempts live in Neon
        Postgres — nothing is sold or shared, and local browser storage only
        mirrors your target set.
      </p>
    </div>
  )
}
