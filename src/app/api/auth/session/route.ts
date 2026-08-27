import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
    process.env.AUTH_SECRET,
  );

  if (!session) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  return NextResponse.json({
    user: {
      email: session.email,
      name: session.name,
      role: session.role,
      groupIds: session.groupIds,
      siteIds: session.siteIds,
      allAccess: session.allAccess,
      grants: session.grants,
    },
  });
}
