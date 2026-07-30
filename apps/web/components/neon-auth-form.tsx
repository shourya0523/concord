"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

import { Button } from "@ibpe/ui/components/button"
import { Input } from "@ibpe/ui/components/input"
import { Label } from "@ibpe/ui/components/label"

import { authClient } from "@/lib/auth/client"

type Mode = "sign-in" | "sign-up"

type Props = {
  mode: Mode
  configured: boolean
}

export function NeonAuthForm({ mode, configured }: Props) {
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [name, setName] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!configured) {
      // Shell / demo path when Neon Auth env is not wired yet.
      router.push("/onboarding")
      return
    }

    setPending(true)
    try {
      if (mode === "sign-up") {
        const result = await authClient.signUp.email({
          email,
          password,
          name: name || email.split("@")[0] || "Candidate",
        })
        if (result.error) {
          setError(result.error.message ?? "Sign-up failed")
          return
        }
      } else {
        const result = await authClient.signIn.email({ email, password })
        if (result.error) {
          setError(result.error.message ?? "Sign-in failed")
          return
        }
      }
      router.push("/dashboard")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication error")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto w-full max-w-sm space-y-4">
      {!configured ? (
        <p
          role="status"
          className="border-border bg-muted/50 rounded-[12px] border px-3 py-2 text-xs text-muted-foreground"
        >
          Neon Auth env not configured in this environment. Form is a UI shell —
          continue opens onboarding with mock session.
        </p>
      ) : null}

      {mode === "sign-up" ? (
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@firm.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          required={configured}
          minLength={configured ? 8 : undefined}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Working…" : mode === "sign-up" ? "Create account" : "Sign in"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        {mode === "sign-in" ? (
          <>
            New here?{" "}
            <Link href="/sign-up" className="text-foreground underline-offset-4 hover:underline">
              Create an account
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  )
}
