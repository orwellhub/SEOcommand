import { OAuth2Client } from "google-auth-library";
export function businessConfigured() { return !!(process.env.BUSINESS_GOOGLE_CLIENT_ID && process.env.BUSINESS_GOOGLE_CLIENT_SECRET && process.env.BUSINESS_GOOGLE_REFRESH_TOKEN); }
export async function businessRequest(path: string, options: { method?: "GET" | "PUT" | "PATCH" | "POST"; body?: unknown; information?: boolean; accounts?: boolean } = {}) {
  if (!businessConfigured()) throw new Error("Connect an authorised Google Business Profile account to manage listings and reply to reviews.");
  if (process.env.QA_SYNTHETIC === "true") throw new Error("Google Business Profile changes are disabled in preview.");
  const auth = new OAuth2Client(process.env.BUSINESS_GOOGLE_CLIENT_ID, process.env.BUSINESS_GOOGLE_CLIENT_SECRET); auth.setCredentials({ refresh_token: process.env.BUSINESS_GOOGLE_REFRESH_TOKEN });
  const { token } = await auth.getAccessToken();
  const base = options.accounts ? "https://mybusinessaccountmanagement.googleapis.com/v1/" : options.information ? "https://mybusinessbusinessinformation.googleapis.com/v1/" : "https://mybusiness.googleapis.com/v4/";
  const response = await fetch(`${base}${path}`, { method: options.method ?? "GET", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, ...(options.body ? { body: JSON.stringify(options.body) } : {}), signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Google Business Profile returned ${response.status}. Check account access and API approval.`);
  return await response.json() as Record<string, unknown>;
}
export function compareListing(expected: { name: string; address: string; phone: string }, observed: { name: string; address: string; phone: string }) {
  const normal = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return (["name", "address", "phone"] as const).map((field) => ({ field, expected: expected[field], observed: observed[field], state: !expected[field] || !observed[field] ? "unverified" : normal(expected[field]) === normal(observed[field]) ? "matches" : "review difference" }));
}
