import Link from "next/link";
import { parseJson } from "@/lib/db";
import { insights } from "@/lib/queries";
import { SEARCH_MONTHLY_CAP } from "@/lib/llm/search-budget";
import { Tag, Empty, Stat } from "@/components/bits";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const d = await insights();

  const totalCost = d.runStats.reduce((s, r) => s + (r._sum.costUsd ?? 0), 0);
  const totalRuns = d.runStats.reduce((s, r) => s + r._count._all, 0);
  const bad = d.runStats.filter((r) => r.status !== "SUCCEEDED");
  const failed = bad.reduce((s, r) => s + r._count._all, 0);
  // The money the failures spent. A failed grounded call is not a free one —
  // Google bills the search the moment it runs — and this number reading zero
  // is how $46 of a $131.80 bill stayed invisible for three days.
  const wasted = bad.reduce((s, r) => s + (r._sum.costUsd ?? 0), 0);
  const searches = d.runStats.reduce((s, r) => s + (r._sum.webSearches ?? 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Insights</h1>
        <p className="text-sm text-muted-foreground">
          The winning opportunity is more often a problem shape than a buyer list.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Cross-market patterns
        </h2>
        {d.cross.length === 0 && d.clusters.filter((c) => c.crossMarket).length === 0 ? (
          <Empty
            title="Nothing spans two markets yet."
            hint="This is the section worth watching — the same problem in four industries is a different business than any one of them."
          />
        ) : (
          <div className="space-y-2">
            {d.clusters
              .filter((c) => c.crossMarket)
              .map((c) => (
                <div key={c.id} className="rounded-lg border-2 border-violet-200 bg-violet-50/40 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.label}</span>
                    <Tag tone="HAS_ACTIVE_PROBLEM">cross-market</Tag>
                    <span className="text-xs text-muted-foreground">
                      {c.signalCount} signals · value {c.estimatedValue?.toLowerCase()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{c.description}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{c.rationale}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Industries: {parseJson<string[]>(c.industries, []).join(", ")}
                  </p>
                </div>
              ))}
            {d.cross.map((c) => (
              <div key={c.problem} className="rounded-lg border p-3 text-sm">
                <strong>{c.problem}</strong> appears for {c.buyerTypes.length} buyer types:{" "}
                {c.buyerTypes.join(", ")}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">All clusters</h2>
        {d.clusters.length === 0 ? (
          <Empty title="Clustering runs once four signals are confirmed." />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {d.clusters.map((c) => (
              <div key={c.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{c.label}</span>
                  <span className="text-xs text-muted-foreground">{c.signalCount}</span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {c.members.slice(0, 4).map((m) => (
                    <li key={m.id} className="border-l-2 pl-2">
                      <span className="text-muted-foreground">{m.painSignal.experiment.name}: </span>
                      {m.painSignal.summary.slice(0, 100)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          What each market is teaching us
        </h2>
        {d.memos.length === 0 ? (
          <Empty title="No memos yet." />
        ) : (
          <div className="space-y-3">
            {d.memos.map((m) => (
              <div key={m.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/experiments/${m.experiment.slug}`} className="font-medium underline">
                    {m.experiment.name}
                  </Link>
                  <Tag>{m.experiment.stage.toLowerCase()}</Tag>
                  {m.stageRecommendation && m.stageRecommendation !== "HOLD" ? (
                    <Tag tone={m.stageRecommendation === "PROMOTE" ? "LOW" : "HIGH"}>
                      recommends {m.stageRecommendation.toLowerCase()}
                    </Tag>
                  ) : null}
                </div>
                <p className="mt-2 text-sm">{m.learning}</p>
                {parseJson<string[]>(m.weakestAssumptions, []).length > 0 ? (
                  <div className="mt-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                      Not supported
                    </span>
                    <ul className="mt-1 space-y-0.5">
                      {parseJson<string[]>(m.weakestAssumptions, []).map((a, i) => (
                        <li key={i} className="border-l-2 border-amber-400 pl-2 text-sm">
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Where you disagreed with the machine
        </h2>
        {d.corrections.length === 0 ? (
          <Empty title="No corrections recorded." hint="Every time you edit a draft or change a classification, the delta is stored here." />
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">What</th>
                  <th className="px-3 py-2">AI said</th>
                  <th className="px-3 py-2">You said</th>
                </tr>
              </thead>
              <tbody>
                {d.corrections.map((c) => (
                  <tr key={c.id} className="border-t align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {c.createdAt.toISOString().slice(5, 16).replace("T", " ")}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {c.entityType.toLowerCase().replace(/_/g, " ")} · {c.field}
                    </td>
                    <td className="max-w-[280px] px-3 py-2 text-xs text-muted-foreground">
                      {(c.aiValue ?? "—").slice(0, 200)}
                    </td>
                    <td className="max-w-[280px] px-3 py-2 text-xs">
                      {(c.humanValue ?? "—").slice(0, 200)}
                      {c.reason ? <div className="mt-1 italic text-muted-foreground">{c.reason}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          What the machine cost
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="AI operations" value={totalRuns} />
          <Stat label="Failed or invalid" value={failed} tone={failed ? "warn" : "muted"} />
          <Stat label="Spend" value={`$${totalCost.toFixed(2)}`} />
          <Stat
            label="Spent on failures"
            value={`$${wasted.toFixed(2)}`}
            tone={wasted > 0.5 ? "warn" : "muted"}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {searches.toLocaleString()} billed search queries, cap {SEARCH_MONTHLY_CAP.toLocaleString()} a month.
        </p>
        {/* Five columns do not fit a phone: scroll the table, not the page. */}
        <div className="mt-3 overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Task</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Runs</th>
                <th className="px-3 py-2 text-right">Searches</th>
                <th className="px-3 py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {d.runStats
                .sort((a, b) => b._count._all - a._count._all)
                .map((r) => (
                  <tr key={`${r.taskType}-${r.status}`} className="border-t">
                    <td className="px-3 py-1.5 font-mono text-xs">{r.taskType}</td>
                    <td className="px-3 py-1.5">
                      <Tag tone={r.status === "SUCCEEDED" ? "LOW" : "HIGH"}>{r.status.toLowerCase()}</Tag>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r._count._all}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r._sum.webSearches ? r._sum.webSearches.toLocaleString() : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r._sum.costUsd ? `$${r._sum.costUsd.toFixed(3)}` : "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
