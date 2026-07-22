import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { readGoogleAuthConfig, type GoogleAuthConfig } from "./config";

/**
 * Headless Google access-token minting. Supports either a service-account JSON
 * (JWT) or a stored OAuth refresh token — whichever is configured in env. Tokens
 * are cached per scope-set until shortly before expiry. Server-side only.
 */

export class MissingGoogleCredentialsError extends Error {
  constructor() {
    super(
      "Google credentials are not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON, " +
        "or GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET + GOOGLE_REFRESH_TOKEN.",
    );
    this.name = "MissingGoogleCredentialsError";
  }
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

const cache = new Map<string, CachedToken>();

function buildAuth(cfg: GoogleAuthConfig, scopes: string[]) {
  if (cfg.mode === "service_account") {
    const credentials = JSON.parse(cfg.serviceAccountJson!);
    return new GoogleAuth({ credentials, scopes });
  }
  const client = new OAuth2Client({ clientId: cfg.clientId, clientSecret: cfg.clientSecret });
  client.setCredentials({ refresh_token: cfg.refreshToken });
  return client;
}

export async function getGoogleAccessToken(scopes: string[]): Promise<string> {
  const cfg = readGoogleAuthConfig();
  if (!cfg) throw new MissingGoogleCredentialsError();

  const key = `${cfg.mode}:${scopes.join(",")}`;
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt - 60_000 > now) return cached.token;

  const auth = buildAuth(cfg, scopes);
  let token: string | null | undefined;
  if (auth instanceof OAuth2Client) {
    const res = await auth.getAccessToken();
    token = res.token;
  } else {
    token = await auth.getAccessToken();
  }
  if (!token) throw new Error("Failed to obtain a Google access token.");

  // Google access tokens live ~1h; cache conservatively for 50 minutes.
  cache.set(key, { token, expiresAt: now + 50 * 60_000 });
  return token;
}

export function googleConfigured(): boolean {
  return readGoogleAuthConfig() !== null;
}
