import { cn } from "@/lib/utils";

export type PillTone = "ok" | "warn" | "late" | "muted";

const TONES: Record<PillTone, string> = {
  ok:   "bg-[color-mix(in_srgb,#1F8A5B_14%,transparent)] text-[#1F8A5B]",
  warn: "bg-[color-mix(in_srgb,#C98A00_16%,transparent)] text-[#9a6b00] dark:text-[#e0a93e]",
  late: "bg-primary/12 text-primary",
  muted:"bg-secondary text-muted-foreground",
};
const DOTS: Record<PillTone, string> = {
  ok: "bg-[#1F8A5B]", warn: "bg-[#C98A00]", late: "bg-primary", muted: "bg-muted-foreground",
};

export function StatusPill({ tone, children, className }: {
  tone: PillTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[11px] font-medium tracking-[0.02em]",
        TONES[tone],
        className,
      )}
    >
      <span className={cn("size-[7px] rounded-full", DOTS[tone])} />
      {children}
    </span>
  );
}
