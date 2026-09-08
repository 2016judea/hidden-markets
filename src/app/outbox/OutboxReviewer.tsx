"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScorePill, Tag, Provenance, Empty } from "@/components/bits";
import {
  approveAllLowRisk,
  approveOutboxDraft,
  rejectProspectFromOutbox,
  skipOutboxDraft,
} from "@/lib/actions";

export type OutboxItem = {
  id: string;
  kind: string;
  sequenceIndex: number;
  subject: string;
  body: string;
  aiSubject: string | null;
  aiBody: string | null;
  altSubject: string | null;
  altBody: string | null;
  rationale: string | null;
  hypothesisTested: string | null;
  personalizationUsed: string[];
  confidence: number | null;
  riskLevel: string;
  experimentName: string;
  experimentHypothesis: string;
  prospect: {
    organizationName: string;
    contactName: string | null;
    title: string | null;
    email: string;
    city: string | null;
    state: string | null;
    orgType: string | null;
    score: number | null;
    breakdown: unknown;
    emailConfidence: string | null;
    emailBasis: string | null;
    researchNotes: string | null;
    relevanceReason: string | null;
    likelyProblemFit: string | null;
  };
  evidence: Array<{ id: string; claim: string; sourceUrl: string | null; quote: string | null; kind: string }>;
};

const KEYS = [
  ["j / k", "next / previous"],
  ["a", "approve + send"],
  ["e", "edit"],
  ["s", "skip"],
  ["x", "reject prospect"],
  ["⇧A", "approve all low-risk"],
];

export function OutboxReviewer({ items }: { items: OutboxItem[] }) {
  const [queue, setQueue] = useState(items);
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  const current = queue[index];

  useEffect(() => {
    if (!current) return;
    setSubject(current.subject);
    setBody(current.body);
    setEditing(false);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Drop the reviewed item locally so the next one is instantly on screen —
   *  a round-trip per decision is what makes a queue of 25 feel like work. */
  const advance = useCallback((id: string) => {
    setQueue((q) => {
      const next = q.filter((d) => d.id !== id);
      setIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
      return next;
    });
  }, []);

  const approve = useCallback(() => {
    if (!current) return;
    const id = current.id;
    const edited = subject !== current.aiSubject || body !== current.aiBody;
    advance(id);
    startTransition(async () => {
      await approveOutboxDraft(id, { subject, body });
      toast.success(edited ? "Edited and queued to send" : "Queued to send");
    });
  }, [current, subject, body, advance]);

  const skip = useCallback(() => {
    if (!current) return;
    const id = current.id;
    advance(id);
    startTransition(async () => {
      await skipOutboxDraft(id);
      toast("Skipped");
    });
  }, [current, advance]);

  const reject = useCallback(() => {
    if (!current) return;
    const reason = window.prompt("Why is this prospect wrong? (recorded as a correction)");
    if (!reason) return;
    const id = current.id;
    advance(id);
    startTransition(async () => {
      await rejectProspectFromOutbox(id, reason);
      toast("Prospect rejected");
    });
  }, [current, advance]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
        if (e.key === "Escape") (target as HTMLTextAreaElement).blur();
        return;
      }
      if (e.key === "j") setIndex((i) => Math.min(i + 1, queue.length - 1));
      else if (e.key === "k") setIndex((i) => Math.max(i - 1, 0));
      else if (e.key === "a" && !e.shiftKey) approve();
      else if (e.key === "A" && e.shiftKey) {
        startTransition(async () => {
          const n = await approveAllLowRisk();
          toast.success(`${n} low-risk drafts approved`);
          setQueue((q) => q.filter((d) => d.riskLevel !== "LOW"));
        });
      } else if (e.key === "e") setEditing(true);
      else if (e.key === "s") skip();
      else if (e.key === "x") reject();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue.length, approve, skip, reject]);

  const lowRiskCount = useMemo(() => queue.filter((q) => q.riskLevel === "LOW").length, [queue]);

  if (queue.length === 0) {
    return <Empty title="Outbox is empty." hint="Nothing is waiting to go out. The worker will add drafts as prospects qualify." />;
  }
  if (!current) return null;

  const p = current.prospect;
  const problemEvidence = current.evidence.filter((e) => e.kind === "PROBLEM_SIGNAL");
  const facts = current.evidence.filter((e) => e.kind !== "PROBLEM_SIGNAL");

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {index + 1} of {queue.length}
          </span>
          {lowRiskCount > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const n = await approveAllLowRisk();
                  toast.success(`${n} low-risk drafts approved`);
                  setQueue((q) => q.filter((d) => d.riskLevel !== "LOW"));
                })
              }
            >
              Approve {lowRiskCount} low-risk
            </Button>
          ) : null}
        </div>

        <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
          {queue.map((d, i) => (
            <button
              key={d.id}
              onClick={() => setIndex(i)}
              className={`w-full rounded-md border p-2 text-left text-sm transition-colors ${
                i === index ? "border-primary bg-muted" : "hover:bg-muted/50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{d.prospect.organizationName}</span>
                <ScorePill score={d.prospect.score} />
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {d.prospect.contactName ?? d.prospect.email} · {d.prospect.title ?? "—"}
              </div>
              <div className="mt-1 flex gap-1">
                <Tag tone={d.riskLevel}>{d.riskLevel.toLowerCase()}</Tag>
                {d.kind !== "INITIAL" ? <Tag>{d.kind.toLowerCase().replace("_", " ")}</Tag> : null}
              </div>
            </button>
          ))}
        </div>

        <div className="rounded-md border p-2 text-[11px] text-muted-foreground">
          {KEYS.map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <kbd className="font-mono">{k}</kbd>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </aside>

      <section className="space-y-4">
        <header className="rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {p.contactName ?? "Unnamed contact"}
                {p.title ? <span className="font-normal text-muted-foreground"> — {p.title}</span> : null}
              </h2>
              <p className="text-sm text-muted-foreground">
                {p.organizationName}
                {p.city || p.state ? ` · ${[p.city, p.state].filter(Boolean).join(", ")}` : ""}
                {p.orgType ? ` · ${p.orgType}` : ""}
              </p>
              <p className="mt-1 font-mono text-xs">{p.email}</p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <ScorePill score={p.score} breakdown={p.breakdown} />
              <Tag tone={p.emailConfidence ?? "UNKNOWN"}>{(p.emailConfidence ?? "unknown").toLowerCase()} address</Tag>
              <Tag tone={current.riskLevel}>{current.riskLevel.toLowerCase()} risk</Tag>
            </div>
          </div>
          {p.emailBasis ? (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
              Address basis: {p.emailBasis}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {current.experimentName} · {current.hypothesisTested ?? current.experimentHypothesis}
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border p-4">
            <h3 className="mb-2 text-sm font-semibold">Why this prospect</h3>
            <p className="text-sm">{p.relevanceReason ?? "—"}</p>
            {p.likelyProblemFit ? (
              <p className="mt-2 text-sm text-muted-foreground">{p.likelyProblemFit}</p>
            ) : null}
            {current.rationale ? (
              <p className="mt-3 border-t pt-3 text-sm">
                <span className="font-medium">Why this email: </span>
                {current.rationale}
              </p>
            ) : null}
          </div>

          <div className="rounded-lg border p-4">
            <h3 className="mb-2 text-sm font-semibold">
              Evidence{" "}
              <span className="font-normal text-muted-foreground">
                ({problemEvidence.length} problem signal{problemEvidence.length === 1 ? "" : "s"})
              </span>
            </h3>
            {problemEvidence.length + facts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No sourced evidence. This email rests on the organization type alone.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {[...problemEvidence, ...facts].slice(0, 6).map((e) => (
                  <li key={e.id} className="border-l-2 pl-2">
                    <span className={e.kind === "PROBLEM_SIGNAL" ? "font-medium" : ""}>{e.claim}</span>{" "}
                    <Provenance url={e.sourceUrl} quote={e.quote} />
                  </li>
                ))}
              </ul>
            )}
            {current.personalizationUsed.length > 0 ? (
              <div className="mt-3 border-t pt-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Personalization used
                </h4>
                <ul className="mt-1 list-disc pl-4 text-sm">
                  {current.personalizationUsed.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h3 className="text-sm font-semibold">Proposed email</h3>
            <div className="flex items-center gap-2">
              {current.confidence !== null ? (
                <span className="text-xs text-muted-foreground">
                  confidence {(current.confidence * 100).toFixed(0)}%
                </span>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
                {editing ? "Done editing" : "Edit"}
              </Button>
            </div>
          </div>
          <div className="space-y-2 p-4">
            {editing ? (
              <>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="font-medium" />
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="font-mono text-sm"
                />
              </>
            ) : (
              <>
                <p className="font-medium">{subject}</p>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{body}</pre>
              </>
            )}
            {current.altBody ? (
              <details className="mt-2 rounded border bg-muted/30 p-2 text-sm">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                  Alternate version
                </summary>
                <p className="mt-2 font-medium">{current.altSubject}</p>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-sm">{current.altBody}</pre>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    setSubject(current.altSubject ?? subject);
                    setBody(current.altBody ?? body);
                  }}
                >
                  Use this one
                </Button>
              </details>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={approve} disabled={pending}>
            Approve + send <kbd className="ml-2 font-mono text-[10px] opacity-60">a</kbd>
          </Button>
          <Button variant="outline" onClick={() => setEditing(true)} disabled={pending}>
            Edit <kbd className="ml-2 font-mono text-[10px] opacity-60">e</kbd>
          </Button>
          <Button variant="ghost" onClick={skip} disabled={pending}>
            Skip <kbd className="ml-2 font-mono text-[10px] opacity-60">s</kbd>
          </Button>
          <Button variant="ghost" className="text-destructive" onClick={reject} disabled={pending}>
            Reject prospect <kbd className="ml-2 font-mono text-[10px] opacity-60">x</kbd>
          </Button>
        </div>
      </section>
    </div>
  );
}
