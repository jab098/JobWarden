import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev-tools badge photobombs local screenshots and the
  // owner's design review; errors still overlay when they happen.
  devIndicators: false,
};

export default nextConfig;
