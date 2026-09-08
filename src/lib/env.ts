import { z } from "zod";

/**
 * Every credential enters the process here and nowhere else. If a provider
 * needs a secret it takes it from this object, so a missing key fails at
 * startup with a readable message rather than at 2am inside a retry loop.
 */
const schema = z.object({
  DATABASE_URL: z.string().default("file:./dev.db"),

  LLM_PROVIDER: z.enum(["anthropic", "mock"]).default("anthropic"),
  LLM_MODEL: z.string().default("claude-sonnet-5"),
  ANTHROPIC_API_KEY: z.string().optional(),

  EMAIL_PROVIDER: z.enum(["zoho", "mock"]).default("mock"),
  ZOHO_CLIENT_ID: z.string().optional(),
  ZOHO_CLIENT_SECRET: z.string().optional(),
  ZOHO_REFRESH_TOKEN: z.string().optional(),
  ZOHO_ACCOUNT_ID: z.string().optional(),
  ZOHO_FROM_ADDRESS: z.string().default("aidan@brickandmortar.dev"),
  ZOHO_FROM_NAME: z.string().default("Aidan Jude"),
  ZOHO_API_BASE: z.string().default("https://mail.zoho.com/api"),
  ZOHO_ACCOUNTS_BASE: z.string().default("https://accounts.zoho.com"),

  GOOGLE_PLACES_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.7-flash"),
  /** Who does the web-searching tasks. "anthropic" keeps everything on one vendor. */
  RESEARCH_PROVIDER: z.enum(["gemini", "anthropic"]).default("anthropic"),

  OPERATOR_NAME: z.string().default("Aidan Jude"),
  WORKER_ENABLED: z.string().default("true"),
});

export const env = schema.parse(process.env);
export const workerEnabled = env.WORKER_ENABLED !== "false";
