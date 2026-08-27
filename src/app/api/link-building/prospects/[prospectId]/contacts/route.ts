import { NextResponse } from "next/server";
import { z } from "zod";
import { canWrite } from "@/lib/auth";
import { enrichProspectContacts } from "@/platform/link-outreach";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ prospectId: string }> }) {
  const { prospectId } = await params;
  if (process.env.QA_SYNTHETIC === "true") return NextResponse.json({ contacts: [{ type: "email", value: "editor@publisher.example", source: "synthetic_qa" }], prospectId, synthetic: true });
  if (!canWrite(request.headers.get("x-orwell-user-role"))) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  if (!z.string().uuid().safeParse(prospectId).success) return NextResponse.json({ error: "Invalid prospect." }, { status: 400 });
  try {
    return NextResponse.json({ contacts: await enrichProspectContacts(prospectId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Contact research failed." }, { status: 502 });
  }
}
