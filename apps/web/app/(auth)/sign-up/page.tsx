import Link from "next/link"

import { EditorialHeading } from "@ibpe/ui/components/editorial"

import { NeonAuthForm } from "@/components/neon-auth-form"
import { isNeonAuthConfigured } from "@/lib/auth/config"
import { safeNextPath } from "@/lib/auth/gate"
import { DEFAULT_PLAN_ID, getPlan } from "@/lib/billing/plans"

export const metadata = {
  title: "Sign up",
  description: "Create a Concord account",
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const configured = isNeonAuthConfigured()
  const raw = (await searchParams).next
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw)
  // Paid plans are requested from Settings or by email, so every account starts on Standby.
  const plan = getPlan(DEFAULT_PLAN_ID)

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <EditorialHeading eyebrow="Account" as="h1">
        Create account
      </EditorialHeading>
      <p className="text-[15px] text-muted-foreground">
        Save your prep path — then we&apos;ll set targets and interview date.
      </p>
      <p data-testid="signup-plan" className="border-border border px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {plan.name} · {plan.price}
        </span>{" "}
        — {plan.name}, {plan.cadence.toLowerCase()}.{" "}
        <Link href="/pricing" className="text-foreground underline-offset-4 hover:underline">
          See plans
        </Link>
      </p>
      <NeonAuthForm mode="sign-up" configured={configured} next={next} />
    </div>
  )
}
