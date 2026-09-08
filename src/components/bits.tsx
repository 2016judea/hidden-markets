import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "default" | "warn" | "good" | "muted";
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "warn" && "text-amber-600",
          tone === "good" && "text-emerald-600",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

const TONES: Record<string, string> = {
  LOW: "bg-emerald-50 text-emerald-700 border-emerald-200",
  NORMAL: "bg-slate-50 text-slate-700 border-slate-200",
  HIGH: "bg-amber-50 text-amber-800 border-amber-300",
  VERIFIED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  INFERRED: "bg-amber-50 text-amber-800 border-amber-200",
  GUESSED: "bg-red-50 text-red-700 border-red-200",
  UNKNOWN: "bg-slate-100 text-slate-600 border-slate-200",
  POSITIVE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  HAS_ACTIVE_PROBLEM: "bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold",
  WANTS_PRICE: "bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold",
  WANTS_CALL: "bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold",
  REFERRAL: "bg-violet-50 text-violet-700 border-violet-200",
  NEGATIVE: "bg-red-50 text-red-700 border-red-200",
  UNSUBSCRIBE: "bg-red-100 text-red-800 border-red-300",
  NEUTRAL: "bg-slate-50 text-slate-600 border-slate-200",
  OUT_OF_OFFICE: "bg-slate-50 text-slate-600 border-slate-200",
  BOUNCE: "bg-red-50 text-red-700 border-red-200",
  AUTO_CONFIRMED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  NEEDS_REVIEW: "bg-amber-50 text-amber-800 border-amber-300",
  CONFIRMED: "bg-emerald-100 text-emerald-800 border-emerald-300",
  REJECTED: "bg-slate-100 text-slate-500 border-slate-200 line-through",
};

export function Tag({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-none",
        TONES[tone ?? ""] ?? "bg-slate-50 text-slate-600 border-slate-200",
      )}
    >
      {children}
    </span>
  );
}

/** Score with its components visible on hover — never a bare opaque number. */
export function ScorePill({ score, breakdown }: { score: number | null; breakdown?: unknown }) {
  if (score === null) return <Tag tone="UNKNOWN">unscored</Tag>;
  const tone = score >= 80 ? "LOW" : score >= 60 ? "NORMAL" : "HIGH";
  const parts =
    breakdown && typeof breakdown === "object" && "components" in (breakdown as Record<string, unknown>)
      ? Object.entries((breakdown as { components: Record<string, { score: number; reason: string }> }).components)
      : [];
  return (
    <span className="group relative">
      <Tag tone={tone}>{score}/100</Tag>
      {parts.length ? (
        <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden w-80 rounded-md border bg-popover p-3 text-xs shadow-lg group-hover:block">
          {parts.map(([k, v]) => (
            <span key={k} className="mb-1.5 block">
              <strong className="capitalize">{k.replace(/([A-Z])/g, " $1")}</strong>: {v.score}
              <span className="block text-muted-foreground">{v.reason}</span>
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-dashed p-12 text-center">
      <p className="font-medium">{title}</p>
      {hint ? <p className="mt-1 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function Provenance({ url, quote }: { url?: string | null; quote?: string | null }) {
  if (!url) return <span className="text-xs text-amber-700">unsourced</span>;
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    /* a malformed URL still tells the reviewer something */
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title={quote ?? url}
      className="text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800"
    >
      {host}
    </a>
  );
}
