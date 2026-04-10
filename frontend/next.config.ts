import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ensure Next resolves modules from the frontend workspace instead of the repo root
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
