import { NextResponse } from "next/server";
import { googleConfigured } from "@/providers/google/auth";
import { discoverGoogleProperties } from "@/platform/google-discovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const host = new URL(request.url).searchParams.get("host")?.trim() ?? "";
  if (!host) return NextResponse.json({ error: "A host is required." }, { status: 400 });
  if (!googleConfigured()) {
    return NextResponse.json({ configured: false, gsc: [], ga4: [], warnings: ["Google is not connected."] });
  }
  return NextResponse.json(await discoverGoogleProperties(host));
}
