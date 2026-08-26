import type { AiCrawlerAuditRow, ManagedSite } from "./types";

const BOTS: { bot: string; category: AiCrawlerAuditRow["category"] }[] = [
  { bot: "GPTBot", category: "training" },
  { bot: "OAI-SearchBot", category: "search" },
  { bot: "ChatGPT-User", category: "assistant" },
  { bot: "ClaudeBot", category: "training" },
  { bot: "PerplexityBot", category: "search" },
  { bot: "Google-Extended", category: "training" },
  { bot: "Googlebot", category: "search" },
  { bot: "Bingbot", category: "search" },
];

function isSafePublicHost(host: string): boolean {
  const value = host.toLowerCase().replace(/^www\./, "");
  if (!/^[a-z0-9.-]+$/.test(value) || value === "localhost" || value.endsWith(".local")) return false;
  if (/^(10\.|127\.|169\.254\.|192\.168\.)/.test(value)) return false;
  const match = value.match(/^172\.(\d+)\./);
  return !match || Number(match[1]) < 16 || Number(match[1]) > 31;
}

export function classifyRobotsAccess(robots: string, bot: string): Pick<AiCrawlerAuditRow, "access" | "evidence"> {
  const groups: { agents: string[]; directives: { kind: string; path: string }[] }[] = [];
  let current: (typeof groups)[number] | null = null;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const agent = line.match(/^user-agent\s*:\s*(.+)$/i);
    if (agent) {
      if (!current || current.directives.length) {
        current = { agents: [], directives: [] };
        groups.push(current);
      }
      current.agents.push(agent[1]!.trim().toLowerCase());
      continue;
    }
    const directive = line.match(/^(allow|disallow)\s*:\s*(.*)$/i);
    if (directive && current) current.directives.push({ kind: directive[1]!.toLowerCase(), path: directive[2]!.trim() });
  }
  const exact = groups.filter((group) => group.agents.includes(bot.toLowerCase()));
  const relevant = exact.length ? exact : groups.filter((group) => group.agents.includes("*"));
  if (!relevant.length) return { access: "allowed", evidence: "No matching disallow rule in robots.txt." };
  const directives = relevant.flatMap((group) => group.directives);
  const blocked = directives.some((item) => item.kind === "disallow" && item.path === "/");
  const allowedRoot = directives.some((item) => item.kind === "allow" && item.path === "/");
  if (blocked && !allowedRoot) return { access: "blocked", evidence: `User-agent ${bot} has Disallow: /.` };
  const partial = directives.filter((item) => item.kind === "disallow" && item.path).map((item) => item.path);
  return {
    access: "allowed",
    evidence: partial.length ? `Root is accessible; ${partial.length} path rule${partial.length === 1 ? "" : "s"} remain.` : "No blocking rule for the root path.",
  };
}

export async function auditAiCrawlerAccess(site: ManagedSite): Promise<AiCrawlerAuditRow[]> {
  const robotsUrl = `https://${site.host}/robots.txt`;
  if (!isSafePublicHost(site.host)) {
    return BOTS.map(({ bot, category }) => ({ bot, category, access: "unknown", evidence: "Host is not eligible for an external robots.txt request.", robotsUrl }));
  }
  try {
    const response = await fetch(robotsUrl, {
      headers: { "user-agent": "OrwellSEOCommand/1.0 (+AI crawler access audit)" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (response.status === 404) {
      return BOTS.map(({ bot, category }) => ({ bot, category, access: "allowed", evidence: "robots.txt was not found; no crawler restrictions were declared.", robotsUrl }));
    }
    if (!response.ok) throw new Error(`robots.txt returned HTTP ${response.status}`);
    const robots = (await response.text()).slice(0, 500_000);
    return BOTS.map(({ bot, category }) => ({ bot, category, ...classifyRobotsAccess(robots, bot), robotsUrl }));
  } catch (error) {
    const evidence = error instanceof Error ? error.message : "robots.txt could not be checked";
    return BOTS.map(({ bot, category }) => ({ bot, category, access: "unknown", evidence, robotsUrl }));
  }
}
