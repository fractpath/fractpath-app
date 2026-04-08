import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "e65d6c0f-2424-4792-91b7-dbc5497fad14-00-3p7hkgjzlnfo9.spock.replit.dev",
  ],
  transpilePackages: ["fractpath-calculator-widget"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "photos.listhub.net",
      },
    ],
  },
  webpack(config) {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@fractpath/compute": path.resolve(
        __dirname,
        "node_modules/fractpath-calculator-widget/packages/compute/dist",
      ),
    };
    return config;
  },
};

export default nextConfig;