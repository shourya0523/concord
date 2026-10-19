import { EditorialHeading } from "@ibpe/ui/components/editorial"

import { NeonAuthForm } from "@/components/neon-auth-form"
import { isNeonAuthConfigured } from "@/lib/auth/config"
import { safeNextPath } from "@/lib/auth/gate"

export const metadata = {
  title: "Sign in",
  description: "Sign in to Concord",
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const configured = isNeonAuthConfigured()
  const raw = (await searchParams).next
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw)

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <EditorialHeading eyebrow="Account" as="h1">
        Sign in
      </EditorialHeading>
      <p className="text-[15px] text-muted-foreground">
        Pick up targets, progress, and saved notes across devices.
      </p>
      <NeonAuthForm mode="sign-in" configured={configured} next={next} />
    </div>
  )
}
