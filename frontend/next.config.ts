import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure Next resolves modules from the frontend workspace instead of the repo root
  outputFileTracingRoot: path.join(__dirname),
  async redirects() {
    return [
      // Legacy sidebar label /ai-cost → canonical analytics cost page
      { source: "/ai-cost", destination: "/analytics/cost", permanent: false },
    ];
  },
};

export default nextConfig;
