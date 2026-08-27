import { ENDPOINTS } from "./config";
import { getDataForSeoClient } from "./index";

type Row = Record<string, unknown>;

function record(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

export function parseDataForSeoBalance(rows: Row[]): number {
  const value = record(rows[0]?.money).balance;
  if (value === null || value === undefined || value === "") throw new Error("DataForSEO balance is unavailable.");
  const balance = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(balance) || balance < 0) throw new Error("DataForSEO balance is unavailable.");
  return balance;
}

/** Zero-cost provider account lookup. No login, rates or pricing data leaves the server. */
export async function fetchDataForSeoBalance(): Promise<number> {
  const rows = await getDataForSeoClient().getMeta<Row>(ENDPOINTS.userData);
  return parseDataForSeoBalance(rows);
}
