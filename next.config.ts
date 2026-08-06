import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required by the Docker `runner` stage.
  output: "standalone",
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
