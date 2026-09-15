import { NextResponse } from "next/server";
import { z } from "zod";
import { getContent, patchContent } from "@/platform/content-store";
import { getManagedSite } from "@/platform/site-store";
import { canAccessSite, hasPermission } from "@/platform/access";
import { googleConfigured, getGoogleAccessToken } from "@/providers/google/auth";
import { assertPublicHostname } from "@/platform/public-network";
import { draftHtml } from "@/lib/content-guidance";
export const runtime = "nodejs";
function wordpress(site: string) { const suffix = site.toUpperCase().replace(/[^A-Z0-9]/g, "_"); return { user: process.env[`WORDPRESS_USERNAME_${suffix}`], password: process.env[`WORDPRESS_APPLICATION_PASSWORD_${suffix}`] }; }
export async function GET(request: Request) {
  const site = new URL(request.url).searchParams.get("site") ?? "";
  if (!await canAccessSite(request, site)) return NextResponse.json({ error: "Website access required." }, { status: 403 });
  const wp = wordpress(site), preview = process.env.QA_SYNTHETIC === "true";
  return NextResponse.json({ wordpress: !preview && Boolean(wp.user && wp.password), googleDocs: !preview && googleConfigured(), note: "WordPress needs this website’s application password. Google Docs needs a Google connection with document creation permission. Exports create private or draft documents only." });
}
const inputSchema = z.object({ id: z.string().uuid(), provider: z.enum(["wordpress", "googleDocs"]), revision: z.string().min(1).max(60) });
export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a saved draft and export destination." }, { status: 400 });
  const { id, provider, revision } = parsed.data, item = await getContent(id);
  if (!item || !await canAccessSite(request, item.domainSlug) || !await hasPermission(request, "manage_content", item.domainSlug)) return NextResponse.json({ error: "Content access required." }, { status: 403 });
  if (!["content_brief", "refresh_brief"].includes(item.executionType ?? "")) return NextResponse.json({ error: "Select a content task." }, { status: 400 });
  const editor = item.executionData?.editor as { text?: string; revision?: string } | undefined;
  if (!editor?.text || editor.revision !== revision) return NextResponse.json({ error: "Save or reload the latest draft before exporting." }, { status: 409 });
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ error: "External exports are disabled in preview." }, { status: 409 });
  const previous = item.executionData?.contentExport as { status?: string; url?: string; revision?: string; provider?: string } | undefined;
  if (previous?.status === "creating") return NextResponse.json({ error: "An earlier export may have created a document. Check the destination before retrying." }, { status: 409 });
  const exports = (item.executionData?.contentExports as { revision: string; provider: string; url: string }[] | undefined) ?? [];
  const existing = exports.find(e => e.revision === revision && e.provider === provider) ?? (previous?.revision === revision && previous.provider === provider && previous.url ? { url: previous.url } : null);
  if (existing) return NextResponse.json({ url: existing.url, message: previous?.status === "partial" ? "The document was created, but content insertion was interrupted. Open it and paste your saved draft." : "This saved draft has already been exported." });
  try {
    const site = await getManagedSite(item.domainSlug); if (!site) throw new Error("Website not found.");
    const wp = wordpress(site.id);
    if (provider === "wordpress" && (!wp.user || !wp.password)) throw new Error("Configure this website’s WordPress application password first.");
    // Authorize before claiming. No unrequested document or publication is created while viewing the editor.
    const token = provider === "googleDocs" ? await getGoogleAccessToken(["https://www.googleapis.com/auth/documents"]) : null;
    if (provider === "wordpress") await assertPublicHostname(site.host);
    const claimed = await patchContent(item, {}, { contentExport: { status: "creating", provider, revision, startedAt: new Date().toISOString() } });
    if (!claimed) return NextResponse.json({ error: "Draft changed during export. Reopen it." }, { status: 409 });
    let url: string;
    if (provider === "wordpress") {
      const response = await fetch(`https://${site.host}/wp-json/wp/v2/posts`, { method: "POST", redirect: "error", headers: { "content-type": "application/json", authorization: `Basic ${Buffer.from(`${wp.user}:${wp.password}`).toString("base64")}` }, body: JSON.stringify({ title: item.title, content: draftHtml(editor.text), status: "draft" }), signal: AbortSignal.timeout(30000) });
      const body = await response.json(); if (!response.ok || !Number.isInteger(body.id)) throw new Error(`WordPress export failed (${response.status}). Check Drafts before retrying.`);
      url = `https://${site.host}/wp-admin/post.php?post=${body.id}&action=edit`;
    } else {
      const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
      const response = await fetch("https://docs.googleapis.com/v1/documents", { method: "POST", headers, body: JSON.stringify({ title: item.title }), signal: AbortSignal.timeout(30000) });
      const body = await response.json(); if (!response.ok || !/^[a-zA-Z0-9_-]+$/.test(body.documentId ?? "")) throw new Error(`Google Docs export failed (${response.status}). Check Drive before retrying.`);
      url = `https://docs.google.com/document/d/${body.documentId}/edit`;
      const created = await getContent(id);
      if (created) await patchContent(created, {}, { contentExport: { status: "partial", provider, revision, url, exportedAt: new Date().toISOString() } });
      const write = await fetch(`https://docs.googleapis.com/v1/documents/${body.documentId}:batchUpdate`, { method: "POST", headers, body: JSON.stringify({ requests: [{ insertText: { location: { index: 1 }, text: editor.text } }] }), signal: AbortSignal.timeout(30000) });
      if (!write.ok) throw new Error(`Document created at ${url}, but content insertion failed. Open it and paste the saved draft.`);
    }
    const latest = await getContent(id);
    if (latest) await patchContent(latest, {}, { contentExports: [...exports, { provider, revision, url }], contentExport: { status: "created", provider, revision, url, exportedAt: new Date().toISOString() } });
    return NextResponse.json({ url, message: provider === "wordpress" ? "WordPress draft created. Review it before publishing." : "Google document created. Sharing remains under your account’s control." });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Export failed. Check the destination before retrying." }, { status: 400 }); }
}
