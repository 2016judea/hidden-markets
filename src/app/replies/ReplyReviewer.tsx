"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tag, Empty } from "@/components/bits";
import {
  approveReply,
  confirmPainSignal,
  markNotInterested,
  rejectPainSignal,
  setReplyStatus,
} from "@/lib/actions";
import { REPLY_CLASSIFICATIONS } from "@/lib/domain/constants";

export type SignalPreview = {
  id: string;
  category: string;
  summary: string;
  verbatim: string | null;
  status: string;
  confidence: number | null;
  fields: Array<[string, string, number | null]>;
};

export type ReplyItem = {
  id: string;
  status: string;
  classifications: string[];
  interpretation: string | null;
  confidence: number | null;
  draftSubject: string | null;
  draftBody: string | null;
  aiDraftBody: string | null;
  draftRationale: string | null;
  experimentName: string;
  from: string;
  subject: string;
  body: string;
  receivedAt: string;
  prospect: { organizationName: string; contactName: string | null; title: string | null; status: string } | null;
  thread: Array<{ direction: string; subject: string; body: string; at: string }>;
  signals: SignalPreview[];
  transactionish: boolean;
};

export function ReplyReviewer({ items }: { items: ReplyItem[] }) {
  const [queue, setQueue] = useState(items);
  const [index, setIndex] = useState(0);
  const [body, setBody] = useState("");
  const [subject, setSubject] = useState("");
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const current = queue[index];

  useEffect(() => {
    if (!current) return;
    setBody(current.draftBody ?? "");
    setSubject(current.draftSubject ?? `Re: ${current.subject}`);
    setEditing(false);
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback((id: string) => {
    setQueue((q) => {
      const next = q.filter((d) => d.id !== id);
      setIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
      return next;
    });
  }, []);

  const send = useCallback(() => {
    if (!current) return;
    const id = current.id;
    advance(id);
    startTransition(async () => {
      await approveReply(id, { subject, body });
      toast.success("Reply queued to send in-thread");
    });
  }, [current, subject, body, advance]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.tagName === "TEXTAREA" || t.tagName === "INPUT") {
        if (e.key === "Escape") (t as HTMLElement).blur();
        return;
      }
      if (e.key === "j") setIndex((i) => Math.min(i + 1, queue.length - 1));
      else if (e.key === "k") setIndex((i) => Math.max(i - 1, 0));
      else if (e.key === "a") send();
      else if (e.key === "e") setEditing(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [queue.length, send]);

  if (queue.length === 0) {
    return <Empty title="No replies waiting." hint="Inbound mail is classified and drafted automatically; it lands here when a human needs to decide." />;
  }
  if (!current) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-2">
        <div className="text-sm font-medium">
          {index + 1} of {queue.length}
        </div>
        <div className="max-h-[70vh] space-y-1 overflow-y-auto pr-1">
          {queue.map((r, i) => (
            <button
              key={r.id}
              onClick={() => setIndex(i)}
              className={`w-full rounded-md border p-2 text-left text-sm ${
                i === index ? "border-primary bg-muted" : "hover:bg-muted/50"
              }`}
            >
              <div className="truncate font-medium">{r.prospect?.organizationName ?? r.from}</div>
              <div className="truncate text-xs text-muted-foreground">{r.subject}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {r.status === "ESCALATED" ? <Tag tone="HIGH">escalated</Tag> : null}
                {r.classifications.slice(0, 3).map((c) => (
                  <Tag key={c} tone={c}>
                    {c.toLowerCase().replace(/_/g, " ")}
                  </Tag>
                ))}
              </div>
            </button>
          ))}
        </div>
        <div className="rounded-md border p-2 text-[11px] text-muted-foreground">
          <div className="flex justify-between">
            <kbd className="font-mono">j / k</kbd>
            <span>next / previous</span>
          </div>
          <div className="flex justify-between">
            <kbd className="font-mono">a</kbd>
            <span>approve + send</span>
          </div>
          <div className="flex justify-between">
            <kbd className="font-mono">e</kbd>
            <span>edit</span>
          </div>
        </div>
      </aside>

      <section className="space-y-4">
        {current.status === "ESCALATED" ? (
          <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
            <strong>Escalated.</strong> The draft would need a commitment only you can make — a price, a date,
            a compatibility claim, or an agreement to supply. Read it before you send it.
          </div>
        ) : null}

        <header className="rounded-lg border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">
                {current.prospect?.contactName ?? current.from}
                {current.prospect?.title ? (
                  <span className="font-normal text-muted-foreground"> — {current.prospect.title}</span>
                ) : null}
              </h2>
              <p className="text-sm text-muted-foreground">
                {current.prospect?.organizationName ?? "unknown organization"} · {current.experimentName}
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-1">
              {current.classifications.map((c) => (
                <Tag key={c} tone={c}>
                  {c.toLowerCase().replace(/_/g, " ")}
                </Tag>
              ))}
            </div>
          </div>
        </header>

        <div className="rounded-lg border">
          <div className="border-b px-4 py-2 text-sm font-semibold">
            Incoming message
            <span className="ml-2 font-normal text-muted-foreground">{current.receivedAt}</span>
          </div>
          <div className="p-4">
            <p className="mb-2 text-sm font-medium">{current.subject}</p>
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{current.body}</pre>
          </div>
          {current.thread.length > 0 ? (
            <details className="border-t px-4 py-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Thread ({current.thread.length} earlier {current.thread.length === 1 ? "message" : "messages"})
              </summary>
              <div className="mt-2 space-y-3">
                {current.thread.map((m, i) => (
                  <div key={i} className="border-l-2 pl-3 text-sm">
                    <div className="text-xs text-muted-foreground">
                      {m.direction} · {m.at} · {m.subject}
                    </div>
                    <pre className="mt-1 whitespace-pre-wrap font-sans">{m.body}</pre>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          <h3 className="text-sm font-semibold">What this means</h3>
          <p className="mt-1 text-sm">{current.interpretation}</p>
          {current.confidence !== null ? (
            <p className="mt-1 text-xs text-muted-foreground">
              classification confidence {(current.confidence * 100).toFixed(0)}%
            </p>
          ) : null}
        </div>

        {current.signals.length > 0 ? (
          <div className="space-y-3">
            {current.signals.map((s) => (
              <div key={s.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold">
                      Pain signal — {s.category}{" "}
                      <Tag tone={s.status}>{s.status.toLowerCase().replace(/_/g, " ")}</Tag>
                    </h3>
                    <p className="mt-1 text-sm">{s.summary}</p>
                  </div>
                  {s.status === "NEEDS_REVIEW" ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await confirmPainSignal(s.id);
                            toast.success("Signal confirmed");
                          })
                        }
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => {
                          const reason = window.prompt("Why is this extraction wrong?");
                          if (!reason) return;
                          startTransition(async () => {
                            await rejectPainSignal(s.id, reason);
                            toast("Signal rejected");
                          });
                        }}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : null}
                </div>
                {s.verbatim ? (
                  <blockquote className="mt-2 border-l-2 border-primary pl-3 text-sm italic">
                    “{s.verbatim}”
                  </blockquote>
                ) : null}
                {s.fields.length > 0 ? (
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-3">
                    {s.fields.map(([k, v, conf]) => (
                      <div key={k}>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                          {k.replace(/([A-Z])/g, " $1")}
                        </dt>
                        <dd>
                          {v}
                          {conf !== null && conf < 0.7 ? (
                            <span className="ml-1 text-xs text-amber-700">({(conf * 100).toFixed(0)}%)</span>
                          ) : null}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <div className="rounded-lg border">
          <div className="flex items-center justify-between border-b px-4 py-2">
            <h3 className="text-sm font-semibold">Proposed response</h3>
            <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? "Done editing" : "Edit"}
            </Button>
          </div>
          <div className="space-y-2 p-4">
            {current.draftBody === null ? (
              <p className="text-sm text-muted-foreground">
                No response was drafted for this one.
              </p>
            ) : editing ? (
              <>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10} className="font-mono text-sm" />
              </>
            ) : (
              <>
                <p className="font-medium">{subject}</p>
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{body}</pre>
              </>
            )}
            {current.draftRationale ? (
              <p className="border-t pt-2 text-xs text-muted-foreground">{current.draftRationale}</p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={send} disabled={pending || !body}>
            Approve + send <kbd className="ml-2 font-mono text-[10px] opacity-60">a</kbd>
          </Button>
          <Button variant="outline" onClick={() => setEditing(true)} disabled={pending}>
            Edit
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              const id = current.id;
              advance(id);
              startTransition(async () => {
                await setReplyStatus(id, "NO_RESPONSE");
                toast("Marked no response");
              });
            }}
          >
            No response
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              const id = current.id;
              advance(id);
              startTransition(async () => {
                await markNotInterested(id);
                toast("Marked not interested");
              });
            }}
          >
            Not interested
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              const id = current.id;
              advance(id);
              startTransition(async () => {
                await setReplyStatus(id, "ESCALATED");
                toast("Escalated — left in the queue for you");
              });
            }}
          >
            Escalate
          </Button>
        </div>
      </section>
    </div>
  );
}

export { REPLY_CLASSIFICATIONS };
