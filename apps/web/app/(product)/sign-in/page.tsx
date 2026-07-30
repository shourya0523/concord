import { EditorialHeading } from "@ibpe/ui/components/editorial"

import { NeonAuthForm } from "@/components/neon-auth-form"
import { isNeonAuthConfigured } from "@/lib/auth/config"

export const metadata = {
  title: "Sign in · IBPE",
  description: "Neon Auth sign-in",
}

export default function SignInPage() {
  const configured = isNeonAuthConfigured()

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center gap-8">
      <EditorialHeading eyebrow="Neon Auth" as="h1">
        Sign in
      </EditorialHeading>
      <p className="text-[15px] text-muted-foreground">
        Managed Better Auth on Neon — session cookies signed with{" "}
        <code className="font-mono text-xs">NEON_AUTH_COOKIE_SECRET</code>.
      </p>
      <NeonAuthForm mode="sign-in" configured={configured} />
    </div>
  )
}
