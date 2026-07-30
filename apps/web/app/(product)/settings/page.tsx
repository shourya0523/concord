import { EditorialHeading, MetadataPill } from "@ibpe/ui/components/editorial"

import { neonAuthPublicStatus } from "@/lib/auth/config"
import { TargetSelectIsland } from "@/components/target-select-island"

export const metadata = {
  title: "Settings · IBPE",
  description: "Targets, auth provider, and product preferences",
}

export default function SettingsPage() {
  const auth = neonAuthPublicStatus()

  return (
    <div className="space-y-10">
      <EditorialHeading eyebrow="Account" as="h1">
        Settings
      </EditorialHeading>

      <section className="space-y-3">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Auth provider
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <MetadataPill tone="lime">Neon Auth</MetadataPill>
          <MetadataPill>{auth.configured ? "configured" : "shell / stub"}</MetadataPill>
        </div>
        <p className="max-w-xl text-sm text-muted-foreground">
          Product login uses Neon Auth (`@neondatabase/auth`) per ADR 0006 — not Clerk. Coordinate
          session + RLS GUC with the backend workstream.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Target companies
        </h2>
        <TargetSelectIsland />
      </section>
    </div>
  )
}
