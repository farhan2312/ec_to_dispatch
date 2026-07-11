import { Gauge } from "lucide-react";

const stats = [
  { value: "24/7", label: "Live EC monitoring" },
  { value: "<30s", label: "Dispatch routing" },
  { value: "99.9%", label: "Uptime" },
];

export function BrandPanel() {
  return (
    <section className="relative hidden flex-1 basis-[46%] flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-navy-1 via-brand-navy-2 to-brand-navy-3 px-12 py-14 text-[#eaf1fb] lg:flex">
      {/* subtle glow accents */}
      <div className="pointer-events-none absolute -left-24 top-1/3 h-96 w-96 rounded-full bg-[#4a9eff]/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-[#0d4a8f]/40 blur-[120px]" />

      {/* logo */}
      <div className="relative flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
          <Gauge className="h-5 w-5 text-white" />
        </div>
        <span className="font-display text-lg font-semibold tracking-tight text-white">
          Risansi
        </span>
      </div>

      {/* headline */}
      <div className="relative max-w-md">
        <h1 className="mb-5 font-display text-[44px] font-bold leading-[1.08] tracking-[-0.02em] text-white">
          From pump EC
          <br />
          straight to Dispatch.
        </h1>
        <p className="text-[16.5px] leading-relaxed text-[#b9cbe6]">
          Monitor electrical conductivity in real time and route work orders to
          the field crew — one connected control surface.
        </p>

        {/* stat row */}
        <div className="mt-10 flex gap-9">
          {stats.map((stat, index) => (
            <div key={stat.label} className="flex gap-9">
              {index > 0 && <div className="w-px bg-white/15" />}
              <div>
                <div className="font-display text-2xl font-semibold text-white">
                  {stat.value}
                </div>
                <div className="mt-1 text-[13px] text-[#8ba3c4]">
                  {stat.label}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* footer */}
      <div className="relative text-[12.5px] text-[#7e97ba]">
        Risansi Industries Ltd · Internal use only
      </div>
    </section>
  );
}
