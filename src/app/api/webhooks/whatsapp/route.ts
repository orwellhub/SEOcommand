import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const mode = params.get("hub.mode"); const token = params.get("hub.verify_token"); const challenge = params.get("hub.challenge");
  if (mode === "subscribe" && challenge && token && process.env.WHATSAPP_VERIFY_TOKEN && token === process.env.WHATSAPP_VERIFY_TOKEN) return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  return NextResponse.json({ error: "Webhook verification failed." }, { status: 403 });
}

export async function POST() {
  // Inbound messages are intentionally not processed; acknowledging promptly
  // prevents Meta retries while keeping this connection delivery-only.
  return NextResponse.json({ ok: true });
}
