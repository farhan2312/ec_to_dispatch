"use server";

import { cookies } from "next/headers";
import { verifyCredentials } from "@/lib/users";
import { SESSION_COOKIE } from "@/lib/session";

export type LoginInput = { email: string; password: string };

export type LoginResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

const STATUS_MESSAGES: Record<string, string> = {
  pending: "Your access request is still pending admin approval.",
  rejected: "Your access request was not approved. Contact an administrator.",
  disabled: "This account has been disabled. Contact an administrator.",
};

export async function login(input: LoginInput): Promise<LoginResult> {
  const email = input.email?.trim() ?? "";
  const password = input.password ?? "";

  if (!email || !password) {
    return { ok: false, error: "Email and password are required." };
  }

  const result = await verifyCredentials(email, password);

  if (!result.ok) {
    if (result.reason === "invalid") {
      return { ok: false, error: "Invalid email or password." };
    }
    return { ok: false, error: STATUS_MESSAGES[result.reason] };
  }

  // Minimal session: store the user id in an httpOnly cookie.
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, result.user.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return { ok: true, redirectTo: "/dashboard" };
}
