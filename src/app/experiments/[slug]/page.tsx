import { notFound } from "next/navigation";
import { parseJson } from "@/lib/db";
import { experimentDetail } from "@/lib/queries";
import { ScorePill, Stat, Tag, Empty } from "@/components/bits";
import { STAGE_GOALS, type ExperimentStage } from "@/lib/domain/constants";
import { Controls } from "./Controls";

export const dynamic = "force-dynamic";

export default async function ExperimentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await experimentDetail(slug);
  if (!d) notFound();

  const e = d.experiment;
  const list = (raw: string) => parseJson<string[]>(raw, []);
  const byStatus = (s: string) => d.candidates.filter((c) => c.status === s).length;

  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{e.name}</h1>
          <Tag>{e.stage.toLowerCase()}</Tag>
          <Tag tone={e.status === "ACTIVE" ? "LOW" : e.status === "TERMINATED" ? "REJECTED" : "HIGH"}>
            {e.status.toLowerCase()}
          </Tag>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{STAGE_GOALS[e.stage as ExperimentStage]}</p>
        <p className="mt-2 max-w-3xl">{e.hypothesis}</p>
      </header>

      <Controls
        id={e.id}
        status={e.status}
        stage={e.stage}
        trustLevel={e.trustLevel}
        recommendation={d.memo?.stageRecommendation ?? null}
      />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Score" value={d.score.total} hint={d.score.confidence.toLowerCase()} />
        <Stat label="Candidates" value={d.candidates.length} hint={`${byStatus("REJECTED")} rejected`} />
        <Stat label="Prospects" value={d.prospects.length} />
        <Stat label="Contacted" value={d.prospects.filter((p) => p.firstContactedAt).length} hint={`target ${e.contactedTarget}`} />
        <Stat label="Replied" value={d.prospects.filter((p) => p.repliedAt).length} />
        <Stat
          label="Pain signals"
          value={d.signals.filter((s) => s.status !== "REJECTED").length}
          tone={d.signals.length ? "good" : "muted"}
        />
      </div>

      <section className="rounded-lg border p-4">
        <h2 className="mb-3 text-sm font-semibold">Why it scores {d.score.total}</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {d.score.components.map((c) => (
            <div key={c.name} className="rounded border p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">{c.label}</span>
                <span className="tabular-nums text-sm">
                  {c.points}
                  <span className="text-muted-foreground">/{c.maxPoints}</span>
                </span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{c.raw}</div>
              <div className="mt-1 text-xs text-muted-foreground">{c.detail}</div>
            </div>
          ))}
        </div>
      </section>

      {d.memo ? (
        <section className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Market memo</h2>
            <span className="text-xs text-muted-foreground">
              {d.memo.createdAt.toISOString().slice(0, 16).replace("T", " ")}
            </span>
          </div>
          <p className="mt-2 max-w-3xl">{d.memo.learning}</p>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <MemoList title="Strongest evidence" items={list(d.memo.strongestEvidence)} />
            <MemoList title="Weakest assumptions" items={list(d.memo.weakestAssumptions)} tone="warn" />
            <MemoList title="Common problems" items={list(d.memo.commonProblems)} />
            <MemoList title="Commercial evidence" items={list(d.memo.commercialEvidence)} tone="good" />
            <MemoList title="Surprises" items={list(d.memo.surprises)} tone="violet" />
          </div>

          {d.memo.emergingBuyerProfile ? (
            <p className="mt-4 rounded bg-muted/40 p-3 text-sm">
              <strong>Emerging buyer: </strong>
              {d.memo.emergingBuyerProfile}
            </p>
          ) : null}
          <p className="mt-3 text-sm">
            <strong>Recommended next: </strong>
            {d.memo.recommendedNext}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            <strong>{d.memo.stageRecommendation}</strong> — {d.memo.stageRationale}
          </p>
        </section>
      ) : (
        <Empty title="No memo yet." hint="A memo is written once there is evidence to be wrong about." />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Pain signals</h2>
          {d.signals.length === 0 ? (
            <Empty title="None yet." />
          ) : (
            <ul className="space-y-2">
              {d.signals.map((s) => (
                <li key={s.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{s.category}</span>
                    <Tag tone={s.status}>{s.status.toLowerCase().replace(/_/g, " ")}</Tag>
                  </div>
                  <p className="mt-1 text-sm">{s.summary}</p>
                  {s.verbatim ? (
                    <blockquote className="mt-1 border-l-2 pl-2 text-sm italic text-muted-foreground">
                      “{s.verbatim}”
                    </blockquote>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {s.prospect?.organizationName ?? "—"}
                    {s.manufacturer ? ` · ${s.manufacturer}` : ""}
                    {s.requestedItem ? ` · ${s.requestedItem}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Pipeline</h2>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Organization</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {d.candidates.slice(0, 40).map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-1.5">
                      <div className="max-w-[220px] truncate">{c.organizationName}</div>
                      {c.rejectionReason ? (
                        <div className="max-w-[260px] truncate text-xs text-muted-foreground">
                          {c.rejectionReason}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="max-w-[160px] truncate">{c.contactName ?? "—"}</div>
                      <div className="max-w-[160px] truncate text-xs text-muted-foreground">{c.title ?? ""}</div>
                    </td>
                    <td className="px-3 py-1.5">
                      <Tag tone={c.status === "REJECTED" ? "REJECTED" : undefined}>
                        {c.status.toLowerCase().replace(/_/g, " ")}
                      </Tag>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <ScorePill score={c.qualificationScore} breakdown={parseJson(c.scoreBreakdown, null)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-semibold">Experiment definition</summary>
        <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
          <Field label="Buyer" value={e.buyerPersona} />
          <Field label="Suspected problem" value={e.likelyProblem} />
          <Field label="What we offer" value={e.offer} />
          <Field label="Geography" value={e.targetGeography} />
          <Field label="Target titles" value={list(e.targetTitles).join(", ")} />
          <Field label="Organization types" value={list(e.targetOrgTypes).join(", ")} />
          <Field label="Do not target" value={list(e.exclusionCriteria).join("; ")} />
          <Field label="Qualifies if" value={list(e.qualificationCriteria).join("; ")} />
          <Field label="Research strategy" value={e.researchStrategy} />
          <Field label="Success criteria" value={list(e.successCriteria).join(" · ")} />
          <Field label="Safety / regulatory" value={e.safetyNotes} />
          <Field label="Monetization paths" value={list(e.monetizationPaths).join(", ")} />
        </dl>
      </details>

      <details className="rounded-lg border p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          AI runs ({d.runs.length} most recent) and queue ({d.jobs.length} outstanding)
        </summary>
        <table className="mt-3 w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1">Task</th>
              <th>Prompt</th>
              <th>Status</th>
              <th>Conf</th>
              <th>Tokens</th>
              <th>Cost</th>
              <th>ms</th>
            </tr>
          </thead>
          <tbody>
            {d.runs.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="py-1 font-mono">{r.taskType}</td>
                <td className="font-mono text-muted-foreground">{r.promptVersion.split("@")[1]}</td>
                <td>
                  <Tag tone={r.status === "SUCCEEDED" ? "LOW" : "HIGH"}>{r.status.toLowerCase()}</Tag>
                </td>
                <td className="tabular-nums">{r.confidence?.toFixed(2) ?? "—"}</td>
                <td className="tabular-nums">
                  {r.inputTokens ?? 0}/{r.outputTokens ?? 0}
                </td>
                <td className="tabular-nums">{r.costUsd ? `$${r.costUsd.toFixed(4)}` : "—"}</td>
                <td className="tabular-nums">{r.durationMs ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.jobs.length > 0 ? (
          <ul className="mt-3 space-y-1 text-xs">
            {d.jobs.map((jb) => (
              <li key={jb.id} className="font-mono">
                {jb.status} · {jb.kind} · attempts {jb.attempts}
                {jb.error ? <span className="text-destructive"> · {jb.error.slice(0, 120)}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </details>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{value || "—"}</dd>
    </div>
  );
}

function MemoList({ title, items, tone }: { title: string; items: string[]; tone?: string }) {
  if (items.length === 0) return null;
  const border =
    tone === "warn" ? "border-amber-400" : tone === "good" ? "border-emerald-400" : tone === "violet" ? "border-violet-400" : "border-slate-300";
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="mt-1 space-y-1">
        {items.map((i, k) => (
          <li key={k} className={`border-l-2 ${border} pl-2 text-sm`}>
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}
