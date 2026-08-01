import { EditorialHeading } from "@ibpe/ui/components/editorial"

import { NeonAuthForm } from "@/components/neon-auth-form"
import { isNeonAuthConfigured } from "@/lib/auth/config"

export const metadata = {
  title: "Sign in",
  description: "Sign in to Concord",
}

export default function SignInPage() {
  const configured = isNeonAuthConfigured()

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <EditorialHeading eyebrow="Account" as="h1">
        Sign in
      </EditorialHeading>
      <p className="text-[15px] text-muted-foreground">
        Pick up targets, progress, and saved notes across devices.
      </p>
      <NeonAuthForm mode="sign-in" configured={configured} />
    </div>
  )
}
