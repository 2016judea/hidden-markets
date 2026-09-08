import { runAITask, type TaskContext, type TaskResult } from "./runner";
import * as P from "./prompts";

/**
 * The twelve cognitive functions, and the whole AI surface of this system.
 *
 * Each is a thin binding of one prompt module to the runner. There is no
 * dispatcher, no planner, and nothing here calls anything else here — the
 * orchestrator in src/lib/jobs decides what runs next, always.
 */

export const discoverOrganizations = (
  input: P.DiscoverInput,
  ctx: TaskContext = {},
): Promise<TaskResult<P.DiscoverOutput>> => runAITask(P.discoverOrganizations, input, ctx);

export const prescreenCandidate = (
  input: P.PrescreenInput,
  ctx: TaskContext = {},
): Promise<TaskResult<P.PrescreenOutput>> => runAITask(P.prescreenCandidate, input, ctx);

export const researchOrganization = (
  input: P.ResearchInput,
  ctx: TaskContext = {},
): Promise<TaskResult<P.ResearchOutput>> => runAITask(P.researchOrganization, input, ctx);

export const identifyDecisionMakers = (
  input: P.DecisionMakerInput,
  ctx: TaskContext = {},
): Promise<TaskResult<P.DecisionMakerOutput>> => runAITask(P.identifyDecisionMakers, input, ctx);

export const extractVerifiedContactInfo = (
  input: P.ContactInput,
  ctx: TaskContext = {},
): Promise<TaskResult<P.ContactOutput>> => runAITask(P.extractVerifiedContactInfo, input, ctx);

export const qualifyProspect = (
  input: P.QualifyInput,
  ctx: TaskContext = {},
): Promise<TaskResult<P.QualifyOutput>> => runAITask(P.qualifyProspect, input, ctx);

export const draftOutboundEmail = (
  input: P.DraftInput,
  ctx: TaskContext = {},
): Promise<TaskResult<P.DraftOutput>> => runAITask(P.draftOutboundEmail, input, ctx);

export const classifyInboundReply = (
  input: P.ClassifyInput,
  ctx: TaskContext = {},
): Promise<TaskResult<P.ClassifyOutput>> => runAITask(P.classifyInboundReply, input, ctx);

export const extractPainSignals = (
  input: P.ExtractInput,
  ctx: TaskContext = {},
): Promise<TaskResult<P.ExtractOutput>> => runAITask(P.extractPainSignals, input, ctx);

export const draftReply = (
  input: P.DraftReplyInput,
  ctx: TaskContext = {},
): Promise<TaskResult<P.DraftReplyOutput>> => runAITask(P.draftReply, input, ctx);

export const analyzeExperiment = (
  input: P.AnalyzeInput,
  ctx: TaskContext = {},
): Promise<TaskResult<P.AnalyzeOutput>> => runAITask(P.analyzeExperiment, input, ctx);

export const clusterPainSignals = (
  input: P.ClusterInput,
  ctx: TaskContext = {},
): Promise<TaskResult<P.ClusterOutput>> => runAITask(P.clusterPainSignals, input, ctx);

export const generateExperiment = (
  input: P.GenerateExperimentInput,
  ctx: TaskContext = {},
): Promise<TaskResult<P.GenerateExperimentOutput>> => runAITask(P.generateExperiment, input, ctx);
