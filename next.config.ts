import type { NextConfig } from "next";

// cacheComponents is intentionally OFF: pages read the gr_pid cookie freely without
// Suspense boundaries. Keeps main buildable while 5 people ship fast.
const nextConfig: NextConfig = {
  // @getdial/sdk reads its own package.json via __dirname at load time; bundling breaks that path.
  serverExternalPackages: ["@getdial/sdk"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
