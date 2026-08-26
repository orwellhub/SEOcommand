import { NextResponse } from "next/server";
import { z } from "zod";
import { canWrite } from "@/lib/auth";
import { enrichProspectContacts } from "@/platform/link-outreach";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { prospectId: string } }) {
  if (!canWrite(request.headers.get("x-orwell-user-role"))) return NextResponse.json({ error: "Write access required." }, { status: 403 });
  if (!z.string().uuid().safeParse(params.prospectId).success) return NextResponse.json({ error: "Invalid prospect." }, { status: 400 });
  try {
    return NextResponse.json({ contacts: await enrichProspectContacts(params.prospectId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Contact research failed." }, { status: 502 });
  }
}
