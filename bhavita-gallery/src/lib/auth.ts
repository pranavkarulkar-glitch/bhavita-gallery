import { createHmac, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE = "gallery_auth";

const SESSION_PAYLOAD = "gallery-session";

export function createSessionValue(password: string) {
  return createHmac("sha256", password).update(SESSION_PAYLOAD).digest("hex");
}

export function passwordsMatch(input: string, expected: string) {
  const inputHash = createHmac("sha256", "gallery-password")
    .update(input)
    .digest();
  const expectedHash = createHmac("sha256", "gallery-password")
    .update(expected)
    .digest();
  return timingSafeEqual(inputHash, expectedHash);
}

export function isValidSessionToken(
  token: string | undefined,
  password: string | undefined,
) {
  if (!token || !password) return false;
  const expected = createSessionValue(password);
  const actualBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  };
}
