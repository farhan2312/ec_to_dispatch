import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/session";
import { BrandPanel } from "@/components/auth/brand-panel";
import { LoginForm } from "@/components/login/login-form";

export const metadata: Metadata = {
  title: "Sign in | SO to Dispatch",
};

// Session state is per-request, so this page can't be statically cached.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string }>;
}) {
  // Already signed in? Skip the form and go straight to the app.
  if (await isAuthenticated()) redirect("/risansi/dashboard");

  const { requested } = await searchParams;
  const notice =
    requested === "1"
      ? "Request submitted — your access is now pending admin approval."
      : undefined;

  return (
    <main className="flex min-h-screen w-full bg-background">
      {/* LEFT: brand panel */}
      <BrandPanel />

      {/* RIGHT: form panel */}
      <section className="flex flex-1 basis-[46%] items-center justify-center bg-card px-6 py-8 sm:px-10">
        <LoginForm notice={notice} />
      </section>
    </main>
  );
}
