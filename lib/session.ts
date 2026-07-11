import { cookies } from "next/headers";
import { getUserById, type User } from "@/lib/users";

export const SESSION_COOKIE = "session";

/**
 * Returns the currently logged-in user based on the session cookie,
 * or null if there is no valid session.
 */
export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const id = cookieStore.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return getUserById(id);
}
