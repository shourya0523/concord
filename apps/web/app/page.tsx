import Link from "next/link"

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-4 px-6 py-16">
      <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
        IBPE · apps/web
      </p>
      <h1 className="font-display text-5xl tracking-tight">Editorial Finance Terminal</h1>
      <p className="max-w-md text-[15px] text-muted-foreground">
        Feature routes are owned by <code className="font-mono text-xs">ibpe-frontend</code>. Design
        system catalogue lives at{" "}
        <Link href="/ds" className="text-foreground underline-offset-4 hover:underline">
          /ds
        </Link>
        .
      </p>
    </main>
  )
}
