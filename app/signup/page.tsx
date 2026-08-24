import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/session";
import { BrandPanel } from "@/components/auth/brand-panel";
import { SignupForm } from "@/components/signup/signup-form";

export const metadata: Metadata = {
  title: "Request access | SO to Dispatch",
};

// Session state is per-request, so this page can't be statically cached.
export const dynamic = "force-dynamic";

export default async function SignupPage() {
  // Signed-in users have no reason to request access.
  if (await isAuthenticated()) redirect("/risansi/dashboard");

  return (
    <main className="flex min-h-screen w-full bg-background">
      {/* LEFT: brand panel */}
      <BrandPanel />

      {/* RIGHT: form panel */}
      <section className="flex flex-1 basis-[46%] items-center justify-center bg-card px-6 py-8 sm:px-10">
        <SignupForm />
      </section>
    </main>
  );
}
