import { getCurrentUser } from "@/lib/session";
import { recordPresence } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The app shell's once-a-minute "still here". The client decides whether the
 * user is actually present — tab visible, touched recently — and only then
 * calls; this just records the minute against whoever is signed in.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  await recordPresence(user.id);
  return new Response(null, { status: 204 });
}
