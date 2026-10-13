import "@masc-landing/env/web";
import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  typedRoutes: true,
  reactCompiler: true,
  serverExternalPackages: ["sharp"],
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  outputFileTracingIncludes: {
    // Sharp's native binaries and libvips live in pnpm's optional @img packages.
    // Include them for image routes and ticket email delivery (worker/tRPC).
    "/*": ["../../node_modules/.pnpm/@img+sharp-*/node_modules/@img/sharp-*/lib/**/*"],
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
