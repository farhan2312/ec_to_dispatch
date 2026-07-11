import type { Metadata } from "next";
import { BrandPanel } from "@/components/auth/brand-panel";
import { LoginForm } from "@/components/login/login-form";

export const metadata: Metadata = {
  title: "Sign in | Pumps EC to Dispatch",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string }>;
}) {
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
      <section className="flex flex-1 basis-[54%] items-center justify-center bg-card px-6 py-12 sm:px-10">
        <LoginForm notice={notice} />
      </section>
    </main>
  );
}
