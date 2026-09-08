"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { proposeExperiment } from "@/lib/actions";

export function ProposeExperiment() {
  const [open, setOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  if (!open) {
    return <Button onClick={() => setOpen(true)}>New experiment from an idea</Button>;
  }

  return (
    <div className="w-full max-w-xl rounded-lg border p-4">
      <label className="text-sm font-medium">Describe what you want to find out</label>
      <Textarea
        className="mt-2"
        rows={3}
        autoFocus
        placeholder="Investigate whether commercial bakeries have valuable recurring byproducts they're currently paying to dispose of."
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        It will be researched into a full experiment definition and saved as a draft. Nothing is contacted
        until you start it.
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          disabled={pending || idea.trim().length < 15}
          onClick={() =>
            start(async () => {
              try {
                await proposeExperiment(idea.trim());
                toast.success("Experiment drafted");
                setOpen(false);
                setIdea("");
                router.refresh();
              } catch (err) {
                toast.error(String((err as Error).message).slice(0, 160));
              }
            })
          }
        >
          {pending ? "Researching…" : "Propose experiment"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
