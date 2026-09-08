import { prisma, j } from "../db";

export type NodeType =
  | "BUYER_TYPE" | "PROBLEM" | "PRODUCT" | "MANUFACTURER" | "SUPPLIER"
  | "GEOGRAPHY" | "REGULATION" | "PAIN_SIGNAL" | "TRANSACTION" | "EXPERIMENT";

export type EdgeType =
  | "EXPERIENCES" | "MAKES" | "SUPPLIES" | "LOCATED_IN" | "GOVERNED_BY" | "EVIDENCED_BY" | "SPANS";

const key = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 180);

export async function upsertNode(type: NodeType, label: string, meta: Record<string, unknown> = {}) {
  const k = key(label);
  return prisma.graphNode.upsert({
    where: { type_key: { type, key: k } },
    create: { type, key: k, label, meta: j(meta) },
    update: { weight: { increment: 1 } },
  });
}

export async function upsertEdge(fromId: string, toId: string, type: EdgeType, meta: Record<string, unknown> = {}) {
  if (fromId === toId) return null;
  return prisma.graphEdge.upsert({
    where: { fromId_toId_type: { fromId, toId, type } },
    create: { fromId, toId, type, meta: j(meta) },
    update: { weight: { increment: 1 } },
  });
}

/**
 * Every confirmed pain signal writes its own little subgraph. Doing it at write
 * time rather than in a nightly rebuild means the "same manufacturer, four
 * industries" pattern is queryable the moment the fourth one lands.
 */
export async function recordPainSignalInGraph(signal: {
  id: string;
  category: string;
  manufacturer: string | null;
  requestedItem: string | null;
  experimentName: string;
  buyerType: string | null;
  state: string | null;
}): Promise<void> {
  const problem = await upsertNode("PROBLEM", signal.category);
  const experiment = await upsertNode("EXPERIMENT", signal.experimentName);
  const pain = await upsertNode("PAIN_SIGNAL", signal.id, { category: signal.category });

  await upsertEdge(pain.id, problem.id, "EVIDENCED_BY");
  await upsertEdge(experiment.id, problem.id, "SPANS");

  if (signal.buyerType) {
    const buyer = await upsertNode("BUYER_TYPE", signal.buyerType);
    await upsertEdge(buyer.id, problem.id, "EXPERIENCES");
  }
  if (signal.manufacturer) {
    const mfr = await upsertNode("MANUFACTURER", signal.manufacturer);
    if (signal.requestedItem) {
      const product = await upsertNode("PRODUCT", signal.requestedItem);
      await upsertEdge(mfr.id, product.id, "MAKES");
      await upsertEdge(product.id, problem.id, "EVIDENCED_BY");
    } else {
      await upsertEdge(mfr.id, problem.id, "EVIDENCED_BY");
    }
  }
  if (signal.state) {
    const geo = await upsertNode("GEOGRAPHY", signal.state);
    await upsertEdge(pain.id, geo.id, "LOCATED_IN");
  }
}

/** Problems seen by two or more distinct buyer types — the cross-market read. */
export async function crossMarketProblems(): Promise<
  Array<{ problem: string; buyerTypes: string[]; weight: number }>
> {
  const problems = await prisma.graphNode.findMany({
    where: { type: "PROBLEM" },
    include: { incoming: { where: { type: "EXPERIENCES" }, include: { from: true } } },
  });
  return problems
    .map((p) => ({
      problem: p.label,
      buyerTypes: [...new Set(p.incoming.map((e) => e.from.label))],
      weight: p.weight,
    }))
    .filter((p) => p.buyerTypes.length >= 2)
    .sort((a, b) => b.buyerTypes.length - a.buyerTypes.length || b.weight - a.weight);
}
