import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep strict TypeScript/React hygiene from Step 0
  reactStrictMode: true,
  serverExternalPackages: ["unpdf"],
};

export default nextConfig;
