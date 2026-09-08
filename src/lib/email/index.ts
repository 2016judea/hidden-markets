import { env } from "../env";
import { MockEmailProvider } from "./mock";
import type { EmailProvider } from "./provider";
import { ZohoEmailProvider } from "./zoho";

let cached: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cached) return cached;
  cached = env.EMAIL_PROVIDER === "zoho" ? new ZohoEmailProvider() : new MockEmailProvider();
  return cached;
}

export function setEmailProvider(p: EmailProvider | null): void {
  cached = p;
}

export * from "./provider";
export { MockEmailProvider } from "./mock";
export { ZohoEmailProvider } from "./zoho";
