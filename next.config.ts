import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  devIndicators: false,
  allowedDevOrigins: [
    "http://10.0.2.2:3000",
    "http://10.0.2.2",
  ],
};

export default nextConfig;
