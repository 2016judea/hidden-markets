import { registerHandler } from "./queue";
import { discoverCandidates, draftOutreach, maintainPipeline, prescreenCandidateJob, qualifyCandidate, researchCandidate } from "./handlers/prospecting";
import { sendApprovedOutbox, sendApprovedReplies } from "./handlers/outbound";
import { processInbound, syncInbox } from "./handlers/inbound";
import { analyzeExperiment, clusterPain } from "./handlers/analysis";

/**
 * The whole orchestration surface. Handlers are registered once, here; nothing
 * registers a handler dynamically, so this list is the complete set of things
 * the system can decide to do on its own.
 */
let registered = false;

export function registerHandlers(): void {
  if (registered) return;
  registered = true;
  registerHandler("MAINTAIN_PIPELINE", maintainPipeline);
  registerHandler("DISCOVER_CANDIDATES", discoverCandidates);
  registerHandler("PRESCREEN_CANDIDATE", prescreenCandidateJob);
  registerHandler("RESEARCH_CANDIDATE", researchCandidate);
  registerHandler("QUALIFY_CANDIDATE", qualifyCandidate);
  registerHandler("DRAFT_OUTREACH", draftOutreach);
  registerHandler("SEND_APPROVED_OUTBOX", sendApprovedOutbox);
  registerHandler("SYNC_INBOX", syncInbox);
  registerHandler("PROCESS_INBOUND", processInbound);
  registerHandler("SEND_APPROVED_REPLIES", sendApprovedReplies);
  registerHandler("ANALYZE_EXPERIMENT", analyzeExperiment);
  registerHandler("CLUSTER_PAIN", clusterPain);
  registerHandler("SCHEDULE_FOLLOWUPS", async () => ({ noop: true }));
}

export * from "./queue";
export { maintainPipeline, promoteCandidate } from "./handlers/prospecting";
export { mayAutoApprove, cancelFollowups } from "./handlers/outbound";
