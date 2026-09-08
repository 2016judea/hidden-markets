"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  pauseExperiment,
  promoteStage,
  runNow,
  setTrustLevel,
  startExperiment,
  terminateExperiment,
} from "@/lib/actions";
import {
  EXPERIMENT_STAGES,
  STAGE_TARGETS,
  TRUST_LEVELS,
  TRUST_LEVEL_LABELS,
  type ExperimentStage,
  type TrustLevel,
} from "@/lib/domain/constants";

export function Controls({
  id,
  status,
  stage,
  trustLevel,
  recommendation,
}: {
  id: string;
  status: string;
  stage: string;
  trustLevel: string;
  recommendation: string | null;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<unknown>, msg: string) =>
    start(async () => {
      await fn();
      toast.success(msg);
      router.refresh();
    });

  const nextStage = EXPERIMENT_STAGES[EXPERIMENT_STAGES.indexOf(stage as ExperimentStage) + 1];

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap gap-2">
        {status !== "ACTIVE" ? (
          <Button disabled={pending} onClick={() => run(() => startExperiment(id), "Experiment started")}>
            {status === "DRAFT" ? "Start experiment" : "Resume"}
          </Button>
        ) : (
          <Button variant="outline" disabled={pending} onClick={() => run(() => pauseExperiment(id), "Paused")}>
            Pause
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => runNow("MAINTAIN_PIPELINE", id), "Pipeline nudged")}
        >
          Find prospects now
        </Button>
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => runNow("ANALYZE_EXPERIMENT", id), "Memo regenerating")}
        >
          Regenerate memo
        </Button>
        <Button
          variant="ghost"
          className="text-destructive"
          disabled={pending}
          onClick={() => {
            const reason = window.prompt("Why are you terminating this experiment?");
            if (!reason) return;
            run(() => terminateExperiment(id, reason), "Terminated");
          }}
        >
          Terminate
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Automation:</span>
        {TRUST_LEVELS.map((t) => (
          <button
            key={t}
            disabled={pending}
            onClick={() => run(() => setTrustLevel(id, t as TrustLevel), `Set to ${t}`)}
            className={`rounded border px-2 py-1 text-xs ${
              trustLevel === t ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
          >
            {TRUST_LEVEL_LABELS[t as TrustLevel]}
          </button>
        ))}
      </div>

      {nextStage ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            Stage {stage.toLowerCase()} → {nextStage.toLowerCase()} ({STAGE_TARGETS[nextStage]} contacts):
          </span>
          <Button
            size="sm"
            variant={recommendation === "PROMOTE" ? "default" : "outline"}
            disabled={pending}
            onClick={() => run(() => promoteStage(id, nextStage), `Promoted to ${nextStage}`)}
          >
            Promote to {nextStage.toLowerCase()}
          </Button>
          {recommendation === "PROMOTE" ? (
            <span className="text-xs text-emerald-700">the memo recommends this</span>
          ) : null}
          {recommendation === "TERMINATE" ? (
            <span className="text-xs text-amber-700">the memo recommends terminating instead</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
