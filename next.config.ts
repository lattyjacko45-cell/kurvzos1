import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Prisma's generated client (and its native query-engine binary,
  // libquery_engine-rhel-openssl-3.0.x.so.node) lives under a custom output
  // path (see prisma/schema.prisma's generator block), outside node_modules.
  // Next's file tracer does not follow the engine binary from that custom
  // path on its own — it isn't require()'d, Prisma finds it via its own
  // filesystem lookup at runtime — so without this it gets left out of the
  // Vercel serverless bundle, producing
  // "Prisma Client could not locate the Query Engine for runtime
  // rhel-openssl-3.0.x" at runtime even though the build itself succeeds.
  outputFileTracingIncludes: {
    "/*": ["./src/generated/prisma/**/*"],
  },
  async headers() {
    const securityHeaders = [
      {
        key: "Content-Security-Policy",
        value: "frame-ancestors 'none'",
      },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];

    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }

    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
