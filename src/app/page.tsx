import Link from "next/link";
import { parseJson } from "@/lib/db";
import { commandCenter } from "@/lib/queries";
import { Stat, Tag, Empty } from "@/components/bits";
import { STAGE_GOALS, type ExperimentStage } from "@/lib/domain/constants";

export const dynamic = "force-dynamic";

export default async function Home() {
  const d = await commandCenter();
  const attention = d.pendingDrafts + d.pendingReplies + d.openTransactions.length + d.needsReviewSignals;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">What is the market telling us?</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {d.experiments.length === 0
            ? "No experiments running yet. Open one and start it."
            : `${d.experiments.filter((e) => e.status === "ACTIVE").length} experiments running.`}
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Needs attention
        </h2>
        {attention === 0 ? (
          <Empty title="Nothing waiting on you." hint="The system is researching, drafting and classifying underneath." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/outbox">
              <Stat label="Outbound drafts" value={d.pendingDrafts} hint="waiting for approval" tone={d.pendingDrafts ? "warn" : "muted"} />
            </Link>
            <Link href="/replies">
              <Stat
                label="Replies"
                value={d.pendingReplies}
                hint={d.escalated ? `${d.escalated} escalated` : "waiting for review"}
                tone={d.pendingReplies ? "warn" : "muted"}
              />
            </Link>
            <Stat
              label="Transaction opportunities"
              value={d.openTransactions.length}
              hint="someone asked to buy"
              tone={d.openTransactions.length ? "good" : "muted"}
            />
            <Link href="/replies">
              <Stat label="Signals to confirm" value={d.needsReviewSignals} hint="ambiguous extractions" tone={d.needsReviewSignals ? "warn" : "muted"} />
            </Link>
          </div>
        )}
      </section>

      {d.openTransactions.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Transaction opportunities
          </h2>
          <div className="space-y-2">
            {d.openTransactions.map((t) => (
              <div key={t.id} className="rounded-lg border-2 border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {t.prospect?.organizationName ?? "unknown"} — {t.kind.replace(/_/g, " ").toLowerCase()}
                    </p>
                    <p className="mt-1 text-sm">{t.summary}</p>
                    <blockquote className="mt-2 border-l-2 border-emerald-400 pl-2 text-sm italic">
                      “{t.trigger}”
                    </blockquote>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <Link href={`/experiments/${t.experiment.slug}`} className="underline">
                      {t.experiment.name}
                    </Link>
                    {t.estimatedValue ? <div className="mt-1">{t.estimatedValue}</div> : null}
                    {t.urgency ? <div className="mt-1">{t.urgency.toLowerCase()} urgency</div> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Strongest markets
        </h2>
        {d.experiments.length === 0 ? (
          <Empty title="No active experiments." hint="Every seeded experiment starts as a draft. Start one from Experiments." />
        ) : (
          <div className="space-y-2">
            {d.experiments.map((e) => {
              const memo = d.memos.get(e.id);
              return (
                <Link
                  key={e.id}
                  href={`/experiments/${e.slug}`}
                  className="block rounded-lg border p-4 transition-colors hover:bg-muted/40"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{e.name}</span>
                        <Tag>{e.stage.toLowerCase()}</Tag>
                        {e.status === "PAUSED" ? <Tag tone="HIGH">paused</Tag> : null}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{e.score.headline}</p>
                      {memo ? <p className="mt-1.5 text-sm">{memo.learning.slice(0, 240)}</p> : null}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-semibold tabular-nums">{e.score.total}</div>
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {e.score.confidence.toLowerCase()}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">New pain</h2>
          {d.recentSignals.length === 0 ? (
            <Empty title="No pain signals yet." />
          ) : (
            <ul className="space-y-2">
              {d.recentSignals.map((s) => (
                <li key={s.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{s.category}</span>
                    <Tag tone={s.urgency ?? undefined}>{s.urgency?.toLowerCase() ?? "urgency unknown"}</Tag>
                  </div>
                  <p className="mt-1 text-sm">{s.summary}</p>
                  {s.verbatim ? (
                    <blockquote className="mt-1 border-l-2 pl-2 text-sm italic text-muted-foreground">
                      “{s.verbatim}”
                    </blockquote>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.prospect?.organizationName ?? "—"} · {s.experiment.name}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-8">
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Emerging clusters
            </h2>
            {d.clusters.length === 0 ? (
              <Empty title="Not enough signals to cluster yet." hint="Clustering runs once there are four confirmed signals." />
            ) : (
              <ul className="space-y-2">
                {d.clusters.map((c) => (
                  <li key={c.id} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.label}</span>
                      {c.crossMarket ? <Tag tone="HAS_ACTIVE_PROBLEM">cross-market</Tag> : null}
                      <span className="ml-auto text-xs text-muted-foreground">{c.signalCount} signals</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Surprises</h2>
            {d.surprises.length === 0 ? (
              <Empty title="Nothing has surprised us yet." />
            ) : (
              <ul className="space-y-2 text-sm">
                {d.surprises.slice(0, 6).map((s, i) => (
                  <li key={i} className="rounded-lg border-l-4 border-violet-400 bg-violet-50/40 p-3">
                    {s.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          What the system has been doing
        </h2>
        <ul className="space-y-1 text-sm">
          {d.activity.map((a) => (
            <li key={a.id} className="flex gap-3 rounded px-2 py-1.5 hover:bg-muted/40">
              <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                {a.createdAt.toISOString().slice(5, 16).replace("T", " ")}
              </span>
              <span className="w-16 shrink-0">
                <Tag>{a.kind.toLowerCase()}</Tag>
              </span>
              <span>{a.message}</span>
            </li>
          ))}
        </ul>
        <Link href="/activity" className="mt-2 inline-block text-sm text-blue-600 underline">
          Full activity feed
        </Link>
      </section>
    </div>
  );
}
