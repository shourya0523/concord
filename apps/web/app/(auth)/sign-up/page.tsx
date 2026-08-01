import { EditorialHeading } from "@ibpe/ui/components/editorial"

import { NeonAuthForm } from "@/components/neon-auth-form"
import { isNeonAuthConfigured } from "@/lib/auth/config"

export const metadata = {
  title: "Sign up",
  description: "Create a Concord account",
}

export default function SignUpPage() {
  const configured = isNeonAuthConfigured()

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
      <EditorialHeading eyebrow="Account" as="h1">
        Create account
      </EditorialHeading>
      <p className="text-[15px] text-muted-foreground">
        Save your prep path — then we&apos;ll set targets and interview date.
      </p>
      <NeonAuthForm mode="sign-up" configured={configured} />
    </div>
  )
}
