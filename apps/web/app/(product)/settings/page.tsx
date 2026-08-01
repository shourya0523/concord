import { neonAuthPublicStatus } from "@/lib/auth/config"
import { SettingsAccountPanel } from "@/components/settings-account-panel"
import { SettingsProfileIsland } from "@/components/settings-island"
import { TargetSelectIsland } from "@/components/target-select-island"
import { ThemePreference } from "@/components/theme-preference"

export const metadata = {
  title: "Settings · Concord",
  description: "Targets, prep profile, and account",
}

export default function SettingsPage() {
  const auth = neonAuthPublicStatus()

  return (
    <div className="space-y-10">
      <header>
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Account
        </p>
        <h1 className="mt-2 font-display text-4xl tracking-tight md:text-5xl">Settings</h1>
      </header>

      <section className="space-y-3 border border-border px-4 py-4">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Target firms
        </h2>
        <p className="max-w-xl text-sm text-muted-foreground">
          Heat, session packs, and readiness key off this set. It saves to your account when
          signed in, and to this browser otherwise.
        </p>
        <TargetSelectIsland />
      </section>

      <section className="space-y-3 border border-border px-4 py-4">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Prep profile
        </h2>
        <SettingsProfileIsland />
      </section>

      <section className="space-y-3 border border-border px-4 py-4">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Theme
        </h2>
        <ThemePreference />
      </section>

      <section className="space-y-3 border border-border px-4 py-4">
        <h2 className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          Account
        </h2>
        <SettingsAccountPanel configured={auth.configured} />
      </section>
    </div>
  )
}
