# Hidden Markets

An autonomous market-research and outreach system for finding out which obscure
B2B markets contain a painful, expensive, recurring problem that real buyers
will engage with us about.

It is not a CRM. The operator does not import CSVs, enrich contacts, classify
replies, extract pain signals, schedule follow-ups or compute metrics. They do
two things: **review what is about to go out, and review what came back.**

## What it does on its own

For each experiment, continuously:

```
DISCOVER → RESEARCH → QUALIFY → DRAFT → ▶ HUMAN REVIEW ◀ → SEND
   ↑                                                          ↓
UPDATE MARKET MODEL ← EXTRACT SIGNAL ← ▶ HUMAN REVIEW ◀ ← INTERPRET ← MONITOR
```

The two `▶ HUMAN REVIEW ◀` gates are database states, not prompt instructions.
`OutboxDraft` reaches `SENT` only via `APPROVED`, and only `approveOutboxDraft`
writes `APPROVED`. There is no path through this codebase that sends an email
without a person. `tests/pipeline.test.ts` asserts it by draining the entire job
queue and checking that nothing was sent.

## Architecture

**Twelve typed cognitive functions. No agents talking to each other.**

Each function is a `PromptModule` — a versioned prompt, a Zod output schema, and
a deterministic validator — declared in `src/lib/ai/prompts/`. Every one runs
through a single wrapper, `runAITask()`, which writes an `AITaskRun` row
recording the input, the output, the model, the prompt version, the confidence,
the token cost, the retry count and the error. Nothing can skip it.

Application code owns every state transition. The LLM never chooses what runs
next; `maintainPipeline()` in `src/lib/jobs/handlers/prospecting.ts` does, by
counting rows.

| Function | Web search | What it must not do |
|---|---|---|
| `discoverOrganizations` | yes | Return an organization already in the pipeline |
| `researchOrganization` | yes | Assert a problem signal with no source URL |
| `identifyDecisionMakers` | yes | Call an address VERIFIED without the page it was published on |
| `extractVerifiedContactInfo` | yes | Inflate its own confidence |
| `qualifyProspect` | no | Return an overall score (TypeScript computes it from components) |
| `draftOutboundEmail` | no | Use flattery, or personalization it was not given |
| `classifyInboundReply` | no | Label REFERRAL without quoting who was named |
| `extractPainSignals` | no | Return a `verbatim` that is not in the message |
| `draftReply` | no | Promise a price, date, compatibility or warranty |
| `analyzeExperiment` | no | Recommend PROMOTE on under five contacts |
| `clusterPainSignals` | no | Create a cluster of one |
| `generateExperiment` | yes | Ship success criteria with no numbers in them |

Those "must not"s are enforced in code, in each module's `validate()`. A
violation fails the run and the model gets one retry with the problem quoted
back at it.

### Deliberately not AI

Bounce and out-of-office detection, deduplication, suppression, state
transitions, the qualification arithmetic, targeting statistics and opportunity
scoring are all plain functions. A model's judgement buys nothing there and its
latency, cost and variance are pure loss.

## The human boundary

The system may research, enrich, classify, extract, score, summarize, cluster,
deduplicate, suppress bounces, handle out-of-office replies, and draft. It must
stop for a person before sending an initial email, sending a substantive reply,
committing to a price or a date, claiming technical compatibility, or changing
what the business says it can do.

Three trust levels (`REVIEW_ALL` default, `TRUSTED_FOLLOWUPS`,
`HIGH_AUTOMATION`) relax the first two. `mayAutoApprove()` is the single
predicate, shared by the automatic policy and the "approve all low-risk" button,
so low-risk means one thing rather than two. A referral intro and any
high-risk draft are never auto-approved at any level.

## Running it

```bash
npm install
cp .env.example .env          # add ANTHROPIC_API_KEY
npx prisma migrate deploy
npm run db:seed               # 18 experiments, all DRAFT

npm run dev                   # the app
npm run worker                # the background worker, separate process
```

Open an experiment, press **Start experiment**, and watch `/activity`.

Everything works with no credentials at all: `EMAIL_PROVIDER=mock` writes sends
to `.mailbox/sent/` as JSON, and reads `.mailbox/inbox/*.json` as if they had
arrived from Zoho — so the whole loop can be exercised before a stranger is ever
emailed. Drop a file in `.mailbox/inbox/` to simulate a reply.

### Connecting the mailbox

`aidan@brickandmortar.dev`, Zoho account `5671348000000008002` (verified live
2026-09-07). The app talks to the **Zoho Mail REST API directly**, not the Zoho
MCP connector — that endpoint is OAuth-gated per Claude Code session, and a
worker that must run at 3am cannot hold a session's token.

Create a **Self Client** at `api-console.zoho.com`, scope
`ZohoMail.messages.ALL,ZohoMail.accounts.READ`, exchange the 10-minute code for
a permanent refresh token, then set `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`,
`ZOHO_REFRESH_TOKEN` and `EMAIL_PROVIDER=zoho`.

### Cost

Measured 2026-09-07 on `claude-opus-5` with server-side web search:
**~$0.48 per discovery call** (14 searches, 76K input tokens) and ~$0.47 per
decision-maker hunt. A 25-contact scout stage is roughly $30-50. The research
functions are where the money goes; `LLM_MODEL` sets the default and a per-task
override is a one-line change in `runAITask`.

## Seeded prospect sources

`scripts/import-legistar.ts` imports the sole-source procurement corpus from
[`the-google-of-obsolete-infrastructure-parts`](https://github.com/2016judea/the-google-of-obsolete-infrastructure-parts)
(1,128 records, 18 agencies, live at
[the-google-of-obsolete-infrastructu.vercel.app](https://the-google-of-obsolete-infrastructu.vercel.app))
straight into the municipal experiment as candidates carrying the agency's own
verbatim justification as evidence.

What that corpus is measurably good for, and not:

- **As a buyer list, excellent.** 18 agencies that demonstrably buy sole-source
  physical infrastructure and publish the paperwork — 163 records across pumps,
  treatment process, switchgear, motors, generators, valves and pipe. Free,
  against $0.48 a discovery call.
- **As an obsolescence signal, thin.** 26 of 1,128 records cite obsolescence,
  touching 7 of 18 agencies, and 11 of those 26 are *software* end-of-life
  (SharePoint, election management) rather than the physical equipment this
  experiment is about. Only 3 are motor/drive. The importer says so on the
  candidate rather than implying every agency has the problem.

## Tests

```bash
npm test    # 29 tests
```

`tests/pipeline.test.ts` runs the entire loop against mock providers: discover,
research, qualify, draft, **stop**, approve, send, receive a reply, classify,
extract, auto-confirm, cancel follow-ups, draft a response, **stop**, approve,
send in-thread, write the memo — asserting at each gate that nothing was sent
without a human, that follow-ups were cancelled the moment someone replied, and
that every judgement left an auditable `AITaskRun`.

`scripts/smoke.ts` is the live check against the real API. It costs about a
dollar and proves what mocks cannot: that the JSON schema is accepted, that
forced tool use returns valid arguments, and that citations come back.

## Layout

```
prisma/schema.prisma        the store; SQLite, so no enums and no arrays
prisma/experiments.ts       the 18 seed experiments
src/lib/llm/                LLMProvider — Anthropic + a validating mock
src/lib/email/              EmailProvider — Zoho REST + an on-disk mock
src/lib/ai/prompts/         the twelve modules: prompt, schema, validator
src/lib/ai/runner.ts        the only path an AI call may take
src/lib/jobs/               the queue and the handlers that own state
src/lib/domain/             everything deliberately not AI
src/lib/actions/            the only code that can approve a send
src/lib/ingest/             seeded prospect sources
```

## Not built yet

No vector database, no graph database, no workflow builder, no auth, no billing,
no multi-user. The market graph is relational (`GraphNode`/`GraphEdge`), which
is enough to answer "which problems span two buyer types" without a graph
database, and the schema is shaped so one could be introduced if a query ever
needs it.
