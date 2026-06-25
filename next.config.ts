import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NEXT_PUBLIC_OFFLINE_ENABLED !== "true",
});

const nextConfig: NextConfig = {};

export default withSerwist(nextConfig);
