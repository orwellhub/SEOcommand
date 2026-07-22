import type { SeoProvider } from "./contracts";
import { demoProvider } from "./demo";
import { createDataForSeoProvider } from "./dataforseo";

/**
 * Provider factory. The active provider is chosen by environment, defaulting to
 * the demo provider. A provider is only ever treated as "live" once a real
 * request has succeeded — until then the UI stays in demo mode and badges data
 * accordingly.
 */
export function getSeoProvider(): SeoProvider {
  const mode = process.env.SEO_PROVIDER ?? "demo";
  if (mode === "dataforseo") {
    // Guard: never activate live provider without credentials present.
    if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) {
      return createDataForSeoProvider();
    }
  }
  return demoProvider;
}

export const IS_DEMO_MODE = (process.env.SEO_PROVIDER ?? "demo") === "demo";

export type { SeoProvider };
