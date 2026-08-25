import { Bell, FileText, ListChecks, ShieldCheck } from "lucide-react";
import Image from "next/image";
import logo from "@/assets/logo.png";

const features = [
  { icon: FileText, value: "7", label: "Departments in sync" },
  { icon: ListChecks, value: "EC-level", label: "Order tracking" },
  { icon: Bell, value: "Live", label: "Cross-team alerts" },
];

export function BrandPanel() {
  return (
    <section className="relative hidden basis-[60%] flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-navy-1 via-brand-navy-2 to-brand-navy-3 px-12 py-12 text-[#eaf1fb] lg:flex">
      {/* dotted texture, top-right */}
      <div
        className="pointer-events-none absolute right-10 top-10 h-40 w-56 opacity-40"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
          maskImage: "linear-gradient(to bottom left, black, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom left, black, transparent)",
        }}
      />
      {/* soft glow accents */}
      <div className="pointer-events-none absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-[#4a9eff]/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-16 right-0 h-80 w-80 rounded-full bg-[#0d4a8f]/40 blur-[120px]" />

      {/* wave graphic, bottom */}
      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56 w-full"
        viewBox="0 0 800 220"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden
      >
        <path
          d="M0 140 C 180 90, 320 200, 800 120 L 800 220 L 0 220 Z"
          fill="rgba(122,178,255,0.08)"
        />
        <path
          d="M0 170 C 220 120, 380 210, 800 150 L 800 220 L 0 220 Z"
          fill="rgba(122,178,255,0.10)"
        />
        <path
          d="M0 130 C 200 100, 360 180, 800 110"
          stroke="rgba(159,200,255,0.28)"
          strokeWidth="1.5"
          fill="none"
        />
      </svg>

      {/* logo */}
      <div className="relative">
        <Image src={logo} alt="Risansi" width={210} height={105} priority />
      </div>

      {/* headline + copy */}
      <div className="relative max-w-lg">
        <h1 className="mb-5 font-display text-[46px] font-bold leading-[1.05] tracking-[-0.02em] text-white">
          From Sales Order
          <br />
          straight to <span className="text-[#5aa9ff]">Dispatch.</span>
        </h1>
        <p className="max-w-md text-[16.5px] leading-relaxed text-[#b9cbe6]">
          Track every sales order from EC to dispatch — across drawing,
          purchase, quality, planning, packing and billing. One connected
          workspace, every hand-off in view.
        </p>

        {/* feature cards */}
        <div className="mt-10 grid max-w-lg grid-cols-3 gap-4">
          {features.map(({ icon: Icon, value, label }) => (
            <div
              key={label}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm transition-colors hover:border-white/20 hover:bg-white/[0.07]"
            >
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-[#7fc2ff]">
                <Icon className="h-5 w-5" />
              </div>
              <div className="font-display text-xl font-bold text-white">
                {value}
              </div>
              <div className="mt-0.5 text-[13px] leading-snug text-[#9db6d6]">
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* footer */}
      <div className="relative flex items-center gap-2 text-[12.5px] text-[#8aa2c4]">
        <ShieldCheck className="h-4 w-4 text-[#7fc2ff]" />
        Risansi Industries Ltd · Internal use only
      </div>
    </section>
  );
}
