import Link from "next/link"

import { resolveAdminAccess } from "@/lib/admin/session"
import { adminDatabaseUrl } from "@/lib/admin/review-store"

import { ReviewQueueIsland } from "./review-queue-island"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Review queue",
  description: "Approve, edit or reject enrichment proposals",
}

export default async function AdminReviewPage() {
  const access = await resolveAdminAccess()

  if (!access.allowed) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="font-display text-4xl tracking-tight">Review queue</h1>
        <p className="text-sm text-muted-foreground">
          {access.status === 401
            ? "Sign in with an admin account to review enrichment proposals."
            : access.message}
        </p>
        {access.status === 401 ? (
          <Link className="text-sm underline underline-offset-4" href="/sign-in">
            Sign in
          </Link>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
          staging.enrichment_proposals · admin.review_tasks
        </p>
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight md:text-5xl">
          Review queue
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Approving writes the proposal to its canonical row (rubrics, taxonomy, answers,
          diagrams, lessons, occurrences) in one transaction and closes the review task.
          Glassdoor text is a firm signal only — never approve it as an answer or rubric.
        </p>
        <p className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          {access.mode === "dev_open"
            ? "dev mode · Neon Auth not configured · reviewer = dev-local"
            : `signed in as ${access.email}`}
          {adminDatabaseUrl() ? "" : " · no database configured"}
        </p>
      </header>
      <ReviewQueueIsland />
    </div>
  )
}
