-- CreateTable
CREATE TABLE "MarketExperiment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL,
    "buyerPersona" TEXT NOT NULL,
    "likelyProblem" TEXT NOT NULL,
    "offer" TEXT NOT NULL,
    "targetTitles" TEXT NOT NULL DEFAULT '[]',
    "targetOrgTypes" TEXT NOT NULL DEFAULT '[]',
    "exclusionCriteria" TEXT NOT NULL DEFAULT '[]',
    "targetGeography" TEXT NOT NULL DEFAULT 'United States',
    "researchStrategy" TEXT NOT NULL DEFAULT '',
    "qualificationCriteria" TEXT NOT NULL DEFAULT '[]',
    "successCriteria" TEXT NOT NULL DEFAULT '[]',
    "safetyNotes" TEXT NOT NULL DEFAULT '',
    "monetizationPaths" TEXT NOT NULL DEFAULT '[]',
    "stage" TEXT NOT NULL DEFAULT 'SCOUT',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "trustLevel" TEXT NOT NULL DEFAULT 'REVIEW_ALL',
    "prospectTarget" INTEGER NOT NULL DEFAULT 25,
    "contactedTarget" INTEGER NOT NULL DEFAULT 25,
    "minQualificationScore" INTEGER NOT NULL DEFAULT 60,
    "generatedByRunId" TEXT,
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "website" TEXT,
    "orgType" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "sizeBucket" TEXT,
    "yearFounded" INTEGER,
    "researchSummary" TEXT,
    "suppressed" BOOLEAN NOT NULL DEFAULT false,
    "suppressedReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProspectCandidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "organizationId" TEXT,
    "organizationName" TEXT NOT NULL,
    "website" TEXT,
    "contactName" TEXT,
    "title" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "orgType" TEXT,
    "sourceUrls" TEXT NOT NULL DEFAULT '[]',
    "researchNotes" TEXT,
    "relevanceReason" TEXT,
    "likelyProblemFit" TEXT,
    "personalizationFacts" TEXT NOT NULL DEFAULT '[]',
    "qualificationScore" INTEGER,
    "scoreBreakdown" TEXT,
    "confidenceScore" REAL,
    "emailConfidence" TEXT,
    "emailInferenceNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
    "rejectionReason" TEXT,
    "rejectedBy" TEXT,
    "referredByProspectId" TEXT,
    "referralContext" TEXT,
    "dedupeKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProspectCandidate_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "MarketExperiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProspectCandidate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "candidateId" TEXT,
    "organizationId" TEXT,
    "organizationName" TEXT NOT NULL,
    "contactName" TEXT,
    "title" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "orgType" TEXT,
    "qualificationScore" INTEGER,
    "scoreBreakdown" TEXT,
    "personalizationFacts" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'READY',
    "featureSnapshot" TEXT NOT NULL DEFAULT '{}',
    "firstContactedAt" DATETIME,
    "lastContactedAt" DATETIME,
    "repliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Prospect_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "MarketExperiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Prospect_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProspectCandidate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Prospect_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProspectReferral" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceProspectId" TEXT NOT NULL,
    "targetProspectId" TEXT,
    "targetCandidateId" TEXT,
    "referredName" TEXT,
    "referredTitle" TEXT,
    "referredEmail" TEXT,
    "quotedText" TEXT NOT NULL,
    "emailMessageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProspectReferral_sourceProspectId_fkey" FOREIGN KEY ("sourceProspectId") REFERENCES "Prospect" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProspectReferral_targetProspectId_fkey" FOREIGN KEY ("targetProspectId") REFERENCES "Prospect" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "prospectId" TEXT,
    "providerThreadId" TEXT,
    "subject" TEXT NOT NULL,
    "lastMessageAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmailThread_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "MarketExperiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmailThread_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "threadId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "ccAddress" TEXT,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "providerMessageId" TEXT,
    "rfcMessageId" TEXT,
    "inReplyTo" TEXT,
    "references" TEXT,
    "providerFolderId" TEXT,
    "sentAt" DATETIME,
    "receivedAt" DATETIME,
    "isBounce" BOOLEAN NOT NULL DEFAULT false,
    "isAutoReply" BOOLEAN NOT NULL DEFAULT false,
    "autoReplyUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OutboxDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "threadId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'INITIAL',
    "sequenceIndex" INTEGER NOT NULL DEFAULT 0,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "aiSubject" TEXT,
    "aiBody" TEXT,
    "altSubject" TEXT,
    "altBody" TEXT,
    "rationale" TEXT,
    "hypothesisTested" TEXT,
    "personalizationUsed" TEXT NOT NULL DEFAULT '[]',
    "evidenceRefs" TEXT NOT NULL DEFAULT '[]',
    "confidence" REAL,
    "riskLevel" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "scheduledFor" DATETIME,
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    "editedByHuman" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" DATETIME,
    "sendError" TEXT,
    "emailMessageId" TEXT,
    "generatedByRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OutboxDraft_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "MarketExperiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OutboxDraft_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OutboxDraft_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReplyReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "inboundMessageId" TEXT NOT NULL,
    "classifications" TEXT NOT NULL DEFAULT '[]',
    "interpretation" TEXT,
    "extraction" TEXT NOT NULL DEFAULT '{}',
    "confidence" REAL,
    "draftSubject" TEXT,
    "draftBody" TEXT,
    "aiDraftBody" TEXT,
    "draftRationale" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    "editedByHuman" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" DATETIME,
    "sendError" TEXT,
    "sentMessageId" TEXT,
    "generatedByRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReplyReview_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "MarketExperiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReplyReview_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "EmailThread" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReplyReview_inboundMessageId_fkey" FOREIGN KEY ("inboundMessageId") REFERENCES "EmailMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PainSignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "prospectId" TEXT,
    "emailMessageId" TEXT,
    "category" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "verbatim" TEXT,
    "requestedItem" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "partNumber" TEXT,
    "quantity" TEXT,
    "currentSupplier" TEXT,
    "currentPrice" TEXT,
    "estimatedSpend" TEXT,
    "deadline" TEXT,
    "urgency" TEXT,
    "frequency" TEXT,
    "durationSoFar" TEXT,
    "currentWorkaround" TEXT,
    "dissatisfaction" TEXT,
    "commercialSignal" TEXT,
    "fieldConfidence" TEXT NOT NULL DEFAULT '{}',
    "confidence" REAL,
    "status" TEXT NOT NULL DEFAULT 'NEEDS_REVIEW',
    "confirmedAt" DATETIME,
    "confirmedBy" TEXT,
    "generatedByRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PainSignal_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "MarketExperiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PainSignal_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PainSignal_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PainCluster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "crossMarket" BOOLEAN NOT NULL DEFAULT false,
    "experimentIds" TEXT NOT NULL DEFAULT '[]',
    "industries" TEXT NOT NULL DEFAULT '[]',
    "estimatedValue" TEXT,
    "rationale" TEXT,
    "signalCount" INTEGER NOT NULL DEFAULT 0,
    "generatedByRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PainClusterMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clusterId" TEXT NOT NULL,
    "painSignalId" TEXT NOT NULL,
    CONSTRAINT "PainClusterMember_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "PainCluster" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PainClusterMember_painSignalId_fkey" FOREIGN KEY ("painSignalId") REFERENCES "PainSignal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransactionOpportunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "prospectId" TEXT,
    "painSignalId" TEXT,
    "trigger" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "estimatedValue" TEXT,
    "urgency" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransactionOpportunity_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "MarketExperiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TransactionOpportunity_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransactionOpportunity_painSignalId_fkey" FOREIGN KEY ("painSignalId") REFERENCES "PainSignal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EvidenceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "candidateId" TEXT,
    "organizationId" TEXT,
    "claim" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT,
    "quote" TEXT,
    "retrievedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confidence" REAL,
    "kind" TEXT NOT NULL DEFAULT 'FACT',
    "aiTaskRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvidenceItem_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProspectCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EvidenceItem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AITaskRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "taskType" TEXT NOT NULL,
    "experimentId" TEXT,
    "prospectId" TEXT,
    "candidateId" TEXT,
    "emailMessageId" TEXT,
    "inputJson" TEXT NOT NULL,
    "outputJson" TEXT,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "confidence" REAL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" REAL,
    "webSearches" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "durationMs" INTEGER,
    CONSTRAINT "AITaskRun_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "MarketExperiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AITaskRun_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AITaskRun_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "ProspectCandidate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AITaskRun_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HumanCorrection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "aiValue" TEXT,
    "humanValue" TEXT,
    "reason" TEXT,
    "aiTaskRunId" TEXT,
    "experimentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "detail" TEXT,
    "actor" TEXT NOT NULL DEFAULT 'SYSTEM',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityEvent_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "MarketExperiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "experimentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "runAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "error" TEXT,
    "result" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobRun_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "MarketExperiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TargetingStat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "contacted" INTEGER NOT NULL DEFAULT 0,
    "replied" INTEGER NOT NULL DEFAULT 0,
    "qualifiedPain" INTEGER NOT NULL DEFAULT 0,
    "commercial" INTEGER NOT NULL DEFAULT 0,
    "negative" INTEGER NOT NULL DEFAULT 0,
    "bounced" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TargetingStat_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "MarketExperiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketMemo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "experimentId" TEXT NOT NULL,
    "learning" TEXT NOT NULL,
    "strongestEvidence" TEXT NOT NULL DEFAULT '[]',
    "weakestAssumptions" TEXT NOT NULL DEFAULT '[]',
    "emergingBuyerProfile" TEXT,
    "commonProblems" TEXT NOT NULL DEFAULT '[]',
    "commercialEvidence" TEXT NOT NULL DEFAULT '[]',
    "surprises" TEXT NOT NULL DEFAULT '[]',
    "recommendedNext" TEXT,
    "stageRecommendation" TEXT,
    "stageRationale" TEXT,
    "evidenceCounts" TEXT NOT NULL DEFAULT '{}',
    "generatedByRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketMemo_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "MarketExperiment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "GraphNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "meta" TEXT NOT NULL DEFAULT '{}',
    "weight" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GraphEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "meta" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GraphEdge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "GraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GraphEdge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "GraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketExperiment_slug_key" ON "MarketExperiment"("slug");

-- CreateIndex
CREATE INDEX "MarketExperiment_status_stage_idx" ON "MarketExperiment"("status", "stage");

-- CreateIndex
CREATE INDEX "Organization_orgType_state_idx" ON "Organization"("orgType", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_domain_key" ON "Organization"("domain");

-- CreateIndex
CREATE INDEX "ProspectCandidate_experimentId_status_idx" ON "ProspectCandidate"("experimentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProspectCandidate_experimentId_dedupeKey_key" ON "ProspectCandidate"("experimentId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_candidateId_key" ON "Prospect"("candidateId");

-- CreateIndex
CREATE INDEX "Prospect_experimentId_status_idx" ON "Prospect"("experimentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_experimentId_email_key" ON "Prospect"("experimentId", "email");

-- CreateIndex
CREATE INDEX "EmailThread_experimentId_status_idx" ON "EmailThread"("experimentId", "status");

-- CreateIndex
CREATE INDEX "EmailThread_providerThreadId_idx" ON "EmailThread"("providerThreadId");

-- CreateIndex
CREATE INDEX "EmailMessage_threadId_sentAt_idx" ON "EmailMessage"("threadId", "sentAt");

-- CreateIndex
CREATE INDEX "EmailMessage_rfcMessageId_idx" ON "EmailMessage"("rfcMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxDraft_emailMessageId_key" ON "OutboxDraft"("emailMessageId");

-- CreateIndex
CREATE INDEX "OutboxDraft_status_scheduledFor_idx" ON "OutboxDraft"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "OutboxDraft_experimentId_status_idx" ON "OutboxDraft"("experimentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ReplyReview_inboundMessageId_key" ON "ReplyReview"("inboundMessageId");

-- CreateIndex
CREATE INDEX "ReplyReview_experimentId_status_idx" ON "ReplyReview"("experimentId", "status");

-- CreateIndex
CREATE INDEX "PainSignal_experimentId_status_idx" ON "PainSignal"("experimentId", "status");

-- CreateIndex
CREATE INDEX "PainSignal_category_idx" ON "PainSignal"("category");

-- CreateIndex
CREATE UNIQUE INDEX "PainClusterMember_clusterId_painSignalId_key" ON "PainClusterMember"("clusterId", "painSignalId");

-- CreateIndex
CREATE INDEX "TransactionOpportunity_experimentId_status_idx" ON "TransactionOpportunity"("experimentId", "status");

-- CreateIndex
CREATE INDEX "EvidenceItem_candidateId_idx" ON "EvidenceItem"("candidateId");

-- CreateIndex
CREATE INDEX "AITaskRun_taskType_status_idx" ON "AITaskRun"("taskType", "status");

-- CreateIndex
CREATE INDEX "AITaskRun_experimentId_startedAt_idx" ON "AITaskRun"("experimentId", "startedAt");

-- CreateIndex
CREATE INDEX "HumanCorrection_entityType_field_idx" ON "HumanCorrection"("entityType", "field");

-- CreateIndex
CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobRun_idempotencyKey_key" ON "JobRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "JobRun_status_runAfter_idx" ON "JobRun"("status", "runAfter");

-- CreateIndex
CREATE UNIQUE INDEX "TargetingStat_experimentId_feature_value_key" ON "TargetingStat"("experimentId", "feature", "value");

-- CreateIndex
CREATE INDEX "MarketMemo_experimentId_createdAt_idx" ON "MarketMemo"("experimentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_kind_value_key" ON "Suppression"("kind", "value");

-- CreateIndex
CREATE UNIQUE INDEX "GraphNode_type_key_key" ON "GraphNode"("type", "key");

-- CreateIndex
CREATE INDEX "GraphEdge_type_idx" ON "GraphEdge"("type");

-- CreateIndex
CREATE UNIQUE INDEX "GraphEdge_fromId_toId_type_key" ON "GraphEdge"("fromId", "toId", "type");
