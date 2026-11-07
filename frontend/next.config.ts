
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,

  // Allow access through your network IP during development
  allowedDevOrigins: [
    "100.64.0.158",
  ],

  experimental: {
    agentFeedback: true,
  },

  cacheComponents: true,
  partialPrefetching: true,

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
