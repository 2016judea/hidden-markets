import Link from "next/link";
import { prisma, parseJson } from "@/lib/db";
import { Tag } from "@/components/bits";
import { ProposeExperiment } from "./ProposeExperiment";

export const dynamic = "force-dynamic";

export default async function ExperimentsPage() {
  const experiments = await prisma.marketExperiment.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { _count: { select: { prospects: true, painSignals: true, candidates: true } } },
  });

  const groups = {
    ACTIVE: experiments.filter((e) => e.status === "ACTIVE"),
    PAUSED: experiments.filter((e) => e.status === "PAUSED"),
    DRAFT: experiments.filter((e) => e.status === "DRAFT"),
    TERMINATED: experiments.filter((e) => e.status === "TERMINATED"),
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Experiments</h1>
          <p className="text-sm text-muted-foreground">
            {experiments.length} markets. Nothing contacts anyone until you start it.
          </p>
        </div>
        <ProposeExperiment />
      </div>

      {(Object.keys(groups) as Array<keyof typeof groups>).map((status) =>
        groups[status].length === 0 ? null : (
          <section key={status}>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {status.toLowerCase()} ({groups[status].length})
            </h2>
            <div className="grid gap-2 md:grid-cols-2">
              {groups[status].map((e) => (
                <Link
                  key={e.id}
                  href={`/experiments/${e.slug}`}
                  className="rounded-lg border p-4 transition-colors hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{e.name}</span>
                    <Tag>{e.stage.toLowerCase()}</Tag>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{e.hypothesis}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {e._count.candidates} candidates · {e._count.prospects} prospects ·{" "}
                    {e._count.painSignals} signals ·{" "}
                    {parseJson<string[]>(e.targetTitles, []).slice(0, 2).join(", ")}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ),
      )}
    </div>
  );
}
