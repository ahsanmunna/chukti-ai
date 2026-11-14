import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
});

const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),
  DATABASE_URL: z.string().min(1).optional(),
  LLM_PROVIDER: z.enum(["gemini"]).default("gemini"),
  LLM_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  GEMINI_API_KEY: z.string().min(1).optional(),
  EXTRACT_MAX_PER_HOUR: z.coerce.number().int().positive().default(30),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Validates and returns public (browser-safe) Supabase environment variables.
 */
export function getPublicEnv(): PublicEnv {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/**
 * Validates and returns server-only environment variables.
 * Never call this from client components.
 */
export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() must only be called on the server.");
  }

  return serverEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    DATABASE_URL: process.env.DATABASE_URL || undefined,
    LLM_PROVIDER: process.env.LLM_PROVIDER || undefined,
    LLM_MODEL: process.env.LLM_MODEL || undefined,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || undefined,
    EXTRACT_MAX_PER_HOUR: process.env.EXTRACT_MAX_PER_HOUR || undefined,
  });
}

/**
 * Returns non-secret boolean presence flags for health checks.
 */
export function getEnvStatus() {
  return {
    supabaseUrlConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKeyConfigured: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServiceRoleConfigured: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    llmKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
  };
}
