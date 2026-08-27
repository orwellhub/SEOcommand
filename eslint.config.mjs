import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      // Data workspaces intentionally refresh client state when the selected
      // portfolio scope changes. The React 19 advisory rejects that established
      // fetch-on-scope-change pattern even though requests are asynchronous.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([".next/**", "node_modules/**", "coverage/**"]),
]);
