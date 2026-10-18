import type { NextConfig } from "next";

// `npm run build:showcase` sets NEXT_PUBLIC_SHOWCASE=1: a static, read-only replay for GitHub Pages
// (scripts/build-showcase.mjs builds it from a copy without the API routes, login and middleware).
const showcase = process.env.NEXT_PUBLIC_SHOWCASE === "1";

const nextConfig: NextConfig = showcase
  ? {
      output: "export",
      basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
      trailingSlash: true, // jobs/<id>/index.html, so Pages serves it without a server
      images: { unoptimized: true },
    }
  : {
      // Self-contained server bundle for the Docker image.
      output: "standalone",
      // Runtime data (jobs, uploads) must not be bundled into the build.
      // Not "./data/**": that glob also strips next/dist/lib/metadata and the server crashes.
      outputFileTracingExcludes: { "*": ["./data/jobs/**", "./data/uploads/**"] },
    };

export default nextConfig;
