import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { getUserById, type User } from "@/lib/users";

export const SESSION_COOKIE = "session";

const ISSUER = "ectodispatch";
const AUDIENCE = "ectodispatch-app";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Add it to .env.local (any long random string)."
    );
  }
  return new TextEncoder().encode(secret);
}

/**
 * Sign a session token for a user. The token carries only the user id (`sub`);
 * role/status are always re-read from the DB, so a signed-but-stale token can't
 * escalate privileges or outlive an account being disabled.
 */
export async function signSession(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/** Verify a session token, returning the user id (`sub`) or null if invalid. */
export async function verifySession(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export const SESSION_MAX_AGE = MAX_AGE_SECONDS;

/**
 * Returns the currently logged-in user based on the signed session cookie,
 * or null if there is no valid session.
 */
export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const userId = await verifySession(token);
  if (!userId) return null;
  return getUserById(userId);
}
