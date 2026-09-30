import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  createSessionValue,
  passwordsMatch,
  sessionCookieOptions,
} from "@/lib/auth";

export async function POST(request: Request) {
  const expected = process.env.GALLERY_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "Gallery password is not configured" },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    password?: unknown;
  } | null;
  const password = typeof body?.password === "string" ? body.password : "";

  if (!password || !passwordsMatch(password, expected)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, createSessionValue(expected), sessionCookieOptions());

  return NextResponse.json({ ok: true });
}
