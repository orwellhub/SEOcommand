import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, service: "orwell-seo-command-centre" });
}
