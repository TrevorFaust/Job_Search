import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));

// Also load repo-root .env (scraper + shared keys like ANTHROPIC_API_KEY)
loadEnvConfig(root);
loadEnvConfig(path.resolve(root, ".."));

const nextConfig: NextConfig = {
  // Parent folder also has a package-lock.json (the scraper). Pin Turbopack to web/.
  turbopack: {
    root,
  },
};

export default nextConfig;
