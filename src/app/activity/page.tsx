import { prisma } from "@/lib/db";
import { Tag, Empty } from "@/components/bits";
import { queueDepth } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const [events, depth, failedJobs] = await Promise.all([
    prisma.activityEvent.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    queueDepth(),
    prisma.jobRun.findMany({ where: { status: "FAILED" }, orderBy: { completedAt: "desc" }, take: 10 }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Queue: {depth.pending} pending · {depth.running} running · {depth.failed} failed
          {depth.pending + depth.running === 0 ? " — is the worker running? npm run worker" : ""}
        </p>
      </div>

      {failedJobs.length > 0 ? (
        <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <h2 className="text-sm font-semibold text-destructive">Failed jobs</h2>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {failedJobs.map((jb) => (
              <li key={jb.id}>
                {jb.kind} · {jb.attempts} attempts · {jb.error?.slice(0, 200)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {events.length === 0 ? (
        <Empty title="Nothing has happened yet." hint="Start an experiment and run the worker." />
      ) : (
        <ul className="space-y-0.5 text-sm">
          {events.map((a) => (
            <li key={a.id} className="flex gap-3 rounded px-2 py-1.5 hover:bg-muted/40">
              <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground">
                {a.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </span>
              <span className="w-20 shrink-0">
                <Tag>{a.kind.toLowerCase()}</Tag>
              </span>
              <span className="w-14 shrink-0 text-xs text-muted-foreground">{a.actor.toLowerCase()}</span>
              <span>{a.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
