/* Shared route-level skeletons used by the `loading.tsx` files.
 *
 * The point of these is *perceived speed*: with a `loading.tsx` boundary present, the App Router
 * commits a navigation immediately (URL changes + this skeleton paints) instead of blocking on the
 * page's server `serverApi` fetch. They mirror the real page shells (hero strip + content shell)
 * so the swap to live content is visually quiet. Server components — no client JS shipped. */

/** One grey block. `bg-line` matches the inline skeletons already used inside the client lists. */
function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-line ${className}`} />;
}

/** A single list-card placeholder, mirroring JobsClient/FreelancersClient card chrome. */
function CardSkeleton() {
  return (
    <div className="card-modern animate-pulse p-5">
      <div className="flex items-start gap-4">
        <div className="hidden h-12 w-12 shrink-0 rounded-m bg-line sm:block" />
        <div className="flex-1">
          <Bar className="h-5 w-2/3" />
          <Bar className="mt-2 h-3 w-1/3" />
          <Bar className="mt-3 h-4 w-full" />
          <Bar className="mt-2 h-4 w-1/2" />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-4 rounded-m bg-bg px-4 py-3">
        {Array.from({ length: 3 }).map((_, j) => (
          <div key={j} className="space-y-1.5">
            <Bar className="h-3 w-16" />
            <Bar className="h-4 w-12" />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
        <Bar className="h-6 w-24" />
        <Bar className="h-8 w-28 rounded-full" />
      </div>
    </div>
  );
}

/** Loading shell for the list/board pages (jobs, services, freelancers, gallery). */
export function ListPageSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <main className="min-h-screen bg-bg">
      {/* hero strip placeholder */}
      <section className="bg-hero relative overflow-hidden text-white">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-end justify-between gap-4 px-6 pb-10 pt-10">
          <div className="w-full max-w-md">
            <div className="mb-3 h-6 w-28 rounded-full bg-white/20" />
            <div className="h-9 w-2/3 rounded bg-white/25" />
            <div className="mt-3 h-4 w-1/2 rounded bg-white/15" />
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-6 pb-14 pt-6 lg:flex-row">
        {/* filters rail placeholder */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="card animate-pulse space-y-4">
            <Bar className="h-5 w-1/2" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Bar key={i} className="h-4 w-full" />
            ))}
          </div>
        </aside>

        {/* results column */}
        <div className="flex-1 space-y-4">
          <div className="card flex animate-pulse items-center gap-2 px-4 py-3">
            <Bar className="h-4 w-40" />
          </div>
          {Array.from({ length: cards }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      </div>
    </main>
  );
}

/** Loading shell for the narrow content pages (faq, CMS pages): centered title + text blocks. */
export function ArticlePageSkeleton({ blocks = 5 }: { blocks?: number }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Bar className="h-9 w-1/2" />
      <div className="mt-6 space-y-2">
        {Array.from({ length: blocks }).map((_, i) => (
          <div key={i} className="card animate-pulse">
            <Bar className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </main>
  );
}

/** Loading shell for the detail pages (job, service, freelancer): hero band + main/aside split. */
export function DetailPageSkeleton() {
  return (
    <main>
      {/* hero band */}
      <section className="bg-hero text-white">
        <div className="mx-auto max-w-screen-2xl px-6 pb-12 pt-8">
          <div className="h-4 w-40 rounded bg-white/15" />
          <div className="mt-4 h-9 w-2/3 rounded bg-white/25" />
          <div className="mt-3 h-4 w-1/3 rounded bg-white/15" />
        </div>
      </section>

      <div className="mx-auto -mt-6 flex max-w-screen-2xl flex-col gap-6 px-6 pb-12 lg:flex-row lg:items-start">
        {/* main column */}
        <div className="flex-1 space-y-4">
          <div className="card-modern animate-pulse space-y-3 p-6">
            <Bar className="h-5 w-1/3" />
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-5/6" />
            <Bar className="h-4 w-2/3" />
          </div>
          <div className="card-modern grid animate-pulse grid-cols-1 gap-3 p-6 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Bar key={i} className="h-16 w-full rounded-m" />
            ))}
          </div>
        </div>

        {/* sticky side rail */}
        <aside className="w-full shrink-0 lg:w-80">
          <div className="card-modern animate-pulse space-y-4 p-6">
            <Bar className="h-8 w-1/2" />
            <Bar className="h-4 w-full" />
            <Bar className="h-4 w-3/4" />
            <Bar className="h-11 w-full rounded-full" />
          </div>
        </aside>
      </div>
    </main>
  );
}
