/**
 * Product route loading state — keeps the cream document visible while a
 * dynamic page streams (avoids bare dark-chrome flashes between routes).
 */
export default function ProductLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-label="Loading page">
      <div className="h-3 w-40 rounded bg-stone/70" />
      <div className="h-10 w-2/3 rounded bg-stone/70" />
      <div className="space-y-3 pt-4">
        <div className="h-24 rounded bg-secondary" />
        <div className="h-24 rounded bg-secondary" />
        <div className="h-24 rounded bg-secondary" />
      </div>
    </div>
  )
}
