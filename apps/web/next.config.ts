import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Prototype-derived UI is outside this workspace package. Resolve its icon
  // import from the web app so clean installs do not need prototype dependencies.
  turbopack: {
    resolveAlias: {
      "@phosphor-icons/react": "./node_modules/@phosphor-icons/react",
    },
  },
  transpilePackages: ["@dealse/design-tokens"],
};

export default nextConfig;
