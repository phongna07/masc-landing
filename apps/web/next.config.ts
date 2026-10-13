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
    // Trace each @img package's real directory. A broad sharp-* glob also
    // follows libvips symlinks inside native packages, which Vercel rejects.
    "/*": [
      "../../node_modules/.pnpm/@img+sharp-{darwin,linux,linuxmusl,win32}-*/node_modules/@img/sharp-{darwin,linux,linuxmusl,win32}-*/lib/**/*",
      "../../node_modules/.pnpm/@img+sharp-libvips-*/node_modules/@img/sharp-libvips-*/lib/**/*",
    ],
  },
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
