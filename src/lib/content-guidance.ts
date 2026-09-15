export type InlineGuidance = { start: number; end: number; text: string; reason: string; kind: "sentence" | "paragraph" | "heading" };
/** Deterministic editing hints; no claims about ranking impact or originality. */
export function inlineContentGuidance(text: string): InlineGuidance[] {
  const hints: InlineGuidance[] = [];
  for (const m of text.matchAll(/[^.!?\n]+[.!?]+|[^.!?\n]+$/gm)) { const words = m[0].trim().split(/\s+/).length; if (words > 30) hints.push({ start: m.index!, end: m.index! + m[0].length, text: m[0].trim(), reason: `${words} words in one sentence. Consider splitting it.`, kind: "sentence" }); }
  for (const m of text.matchAll(/(?:^|\n)([^\n]+)(?=\n|$)/g)) { if (!/^\s*#/.test(m[1]!) && m[1]!.split(/\s+/).length > 120) hints.push({ start: m.index! + (m[0].startsWith("\n") ? 1 : 0), end: m.index! + m[0].length, text: m[1]!.trim(), reason: "Long paragraph. Consider a paragraph break or a descriptive subheading.", kind: "paragraph" }); }
  return hints.sort((a, b) => a.start - b.start).slice(0, 30);
}
export function draftHtml(text: string) {
  const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  return text.split(/\n{2,}/).map(block => { const match = block.match(/^(#{1,6})\s+([^\n]+)$/); return match ? `<h${match[1]!.length}>${esc(match[2]!)}</h${match[1]!.length}>` : `<p>${esc(block).replaceAll("\n", "<br>")}</p>`; }).join("\n");
}
