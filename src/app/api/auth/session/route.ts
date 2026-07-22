import { NextResponse } from "next/server";

export async function GET(request: Request) {
  return NextResponse.json({
    user: {
      email: request.headers.get("x-orwell-user-email"),
      name: request.headers.get("x-orwell-user-name"),
      role: request.headers.get("x-orwell-user-role"),
    },
  });
}
