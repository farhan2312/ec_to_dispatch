import type { Metadata } from "next";
import { BrandPanel } from "@/components/auth/brand-panel";
import { SignupForm } from "@/components/signup/signup-form";

export const metadata: Metadata = {
  title: "Request access | Pumps EC to Dispatch",
};

export default function SignupPage() {
  return (
    <main className="flex min-h-screen w-full bg-background">
      {/* LEFT: brand panel */}
      <BrandPanel />

      {/* RIGHT: form panel */}
      <section className="flex flex-1 basis-[54%] items-center justify-center bg-card px-6 py-12 sm:px-10">
        <SignupForm />
      </section>
    </main>
  );
}
