import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { prisma } from "@/lib/db";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Hidden Markets",
  description: "Find out which obscure markets have a painful, expensive, recurring problem in them.",
};

export const dynamic = "force-dynamic";

async function Nav() {
  const [outbox, replies, transactions] = await Promise.all([
    prisma.outboxDraft.count({ where: { status: "PENDING_REVIEW" } }),
    prisma.replyReview.count({ where: { status: { in: ["PENDING_REVIEW", "ESCALATED"] } } }),
    prisma.transactionOpportunity.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
  ]);

  const items = [
    { href: "/", label: "Command" },
    { href: "/outbox", label: "Outbox", count: outbox },
    { href: "/replies", label: "Replies", count: replies },
    { href: "/insights", label: "Insights" },
    { href: "/experiments", label: "Experiments" },
    { href: "/activity", label: "Activity" },
  ];

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <nav className="mx-auto flex max-w-7xl items-center gap-1 px-4 py-2.5">
        <Link href="/" className="mr-4 font-semibold tracking-tight">
          Hidden Markets
        </Link>
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {i.label}
            {i.count ? (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
                {i.count}
              </span>
            ) : null}
          </Link>
        ))}
        {transactions > 0 ? (
          <span className="ml-auto rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
            {transactions} transaction {transactions === 1 ? "opportunity" : "opportunities"}
          </span>
        ) : null}
      </nav>
    </header>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Nav />
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
