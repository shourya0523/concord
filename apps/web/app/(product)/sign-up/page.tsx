import { EditorialHeading } from "@ibpe/ui/components/editorial"

import { NeonAuthForm } from "@/components/neon-auth-form"
import { isNeonAuthConfigured } from "@/lib/auth/config"

export const metadata = {
  title: "Sign up · IBPE",
  description: "Neon Auth sign-up",
}

export default function SignUpPage() {
  const configured = isNeonAuthConfigured()

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center gap-8">
      <EditorialHeading eyebrow="Neon Auth" as="h1">
        Create account
      </EditorialHeading>
      <p className="text-[15px] text-muted-foreground">
        Product identity keys to <code className="font-mono text-xs">neon_auth_user_id</code> for
        RLS — Glassdoor credentials stay off this surface.
      </p>
      <NeonAuthForm mode="sign-up" configured={configured} />
    </div>
  )
}
