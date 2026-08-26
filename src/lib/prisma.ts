import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Rust-free query engine: PrismaClient talks to Postgres through the
// node-postgres (`pg`) driver adapter instead of a native query-engine
// binary. This is what makes the client fully serverless-bundle-safe (no
// libquery_engine-*.so.node to trace/copy on Vercel).
//
// Pool settings are explicit because the `pg` driver, unlike Prisma's
// classic engine, has no built-in defaults of its own (e.g. no default
// connection timeout). `max` is kept small since DATABASE_URL already
// points at Supabase's Supavisor transaction-mode pooler (port 6543,
// pgbouncer=true) — this pool sits in front of that pooler, not in place
// of it, so it only needs to cover concurrent queries within a single
// serverless invocation.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: 3,
  connectionTimeoutMillis: 5000,
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
