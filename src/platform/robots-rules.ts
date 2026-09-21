/**
 * RFC 9309 robots.txt parsing and path matching.
 *
 * Group selection is an exact, case-insensitive match on the product token with
 * a `*` fallback, which is what RFC 9309 requires and what Google's reference
 * parser implements. Prefix matching is deliberately not used: guessing that a
 * `Claude` group governs `Claude-User` would let the audit report a block the
 * site never wrote, and this audit raises high-severity alerts.
 */

export interface RobotsRule {
  kind: "allow" | "disallow";
  path: string;
}

export interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  /** True when this group was selected through the `*` wildcard rather than a named token. */
  wildcard?: boolean;
}

/** Product tokens end at the first character outside [A-Za-z0-9_-], per RFC 9309. */
function productToken(value: string): string {
  return (value.trim().match(/^[A-Za-z0-9_-]+|^\*/)?.[0] ?? "").toLowerCase();
}

/** Decode percent-escapes that represent unreserved characters so both sides compare alike. */
function normalisePath(value: string): string {
  return value.replace(/%[0-9a-fA-F]{2}/g, (escape) => {
    const character = String.fromCharCode(Number.parseInt(escape.slice(1), 16));
    return /[A-Za-z0-9\-._~]/.test(character) ? character : escape.toUpperCase();
  });
}

export function parseRobots(robots: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  for (const rawLine of robots.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "user-agent") {
      // Consecutive user-agent lines share one group; a rule line closes it.
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      const token = productToken(value);
      if (token) current.agents.push(token);
      continue;
    }
    if ((field === "allow" || field === "disallow") && current) {
      // An empty value places no restriction, so it is not a rule.
      if (value) current.rules.push({ kind: field, path: value });
    }
  }
  return groups.filter((group) => group.agents.length);
}

export function sitemapUrls(robots: string): string[] {
  const urls: string[] = [];
  for (const rawLine of robots.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const match = line.match(/^sitemap\s*:\s*(\S+)$/i);
    if (match) urls.push(match[1]!);
  }
  return [...new Set(urls)];
}

/**
 * The group governing a bot: every named group matching the token, else every
 * wildcard group. Groups repeating the same token are merged, which is how
 * Google's parser treats a robots.txt that declares one agent twice.
 */
export function groupFor(robots: string, botToken: string): RobotsGroup | null {
  const groups = parseRobots(robots);
  const token = productToken(botToken);
  const named = groups.filter((group) => group.agents.includes(token));
  const chosen = named.length ? named : groups.filter((group) => group.agents.includes("*"));
  if (!chosen.length) return null;
  return {
    agents: [...new Set(chosen.flatMap((group) => group.agents))],
    rules: chosen.flatMap((group) => group.rules),
    wildcard: !named.length,
  };
}

function ruleMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const expression = body
    .split("*")
    .map((segment) => segment.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${expression}${anchored ? "$" : ""}`).test(path);
}

/**
 * The rule deciding a path: longest pattern wins, and Allow wins an equal-length
 * tie (RFC 9309 §2.2.2). Returns null when no rule applies, which means allowed.
 */
export function matchRule(group: RobotsGroup | null, path: string): RobotsRule | null {
  if (!group) return null;
  const target = normalisePath(path.startsWith("/") ? path : `/${path}`);
  let winner: RobotsRule | null = null;
  for (const rule of group.rules) {
    if (!ruleMatches(normalisePath(rule.path), target)) continue;
    if (!winner || rule.path.length > winner.path.length) {
      winner = rule;
      continue;
    }
    if (rule.path.length === winner.path.length && rule.kind === "allow") winner = rule;
  }
  return winner;
}

export function isAllowed(robots: string, botToken: string, path: string): boolean {
  return matchRule(groupFor(robots, botToken), path)?.kind !== "disallow";
}
