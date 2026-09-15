/** Export the tables and labels from our own escaped report document, preserving section order. */
export function reportDocumentCsv(html: string): string {
  const unescape = (text: string) => text.replace(/<[^>]*>/g, " ").replace(/&(?:amp|lt|gt|quot|#39);/g, token => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" })[token]!).replace(/\s+/g, " ").trim();
  const body = html.slice(html.indexOf("<main>"));
  const rows: string[][] = [];
  for (const match of body.matchAll(/<(h[123]|p|tr)\b[^>]*>([\s\S]*?)<\/\1>|<div class="metric">([\s\S]*?)<\/div>/g)) {
    if (match[1] === "tr") rows.push([...match[2]!.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(cell => unescape(cell[1]!)));
    else if (match[3]) rows.push([...match[3].matchAll(/<(?:span|strong)>([\s\S]*?)<\/(?:span|strong)>/g)].map(cell => unescape(cell[1]!)));
    else rows.push([unescape(match[2]!)]);
  }
  return "\uFEFF" + rows.map(row => row.map(cell => `"${(/^[\s]*[=+@-]/.test(cell) ? "'" : "") + cell.replace(/"/g, '""')}"`).join(",")).join("\r\n");
}
