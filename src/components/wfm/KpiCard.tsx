import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type KpiCardProps = {
  label: string;
  value: string | number;
  unit?: string;
  foot?: string;
  delta?: string;
  icon: LucideIcon;
  alert?: boolean;
  className?: string;
};

export function KpiCard({ label, value, unit, foot, delta, icon: Icon, alert, className }: KpiCardProps) {
  return (
    <Card
      className={cn(
        "flex flex-col gap-3 p-5 rounded-card shadow-card border-0 transition-transform hover:-translate-y-0.5",
        alert && "bg-foreground text-background dark:bg-[#232323] dark:text-foreground",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "text-[11px] font-medium uppercase tracking-[0.04em]",
            alert ? "text-background/70" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "size-[34px] shrink-0 rounded-md grid place-items-center",
            alert ? "bg-white/12 text-background" : "bg-secondary text-foreground",
          )}
        >
          <Icon className="size-[18px]" />
        </span>
      </div>

      <div className="font-display text-[2.25rem] leading-none tracking-tight tabular-nums">
        {value}
        {unit && <span className="text-xl text-muted-foreground ml-0.5">{unit}</span>}
      </div>

      {(delta || foot) && (
        <div
          className={cn(
            "flex items-center gap-2 text-[11px]",
            alert ? "text-background/70" : "text-muted-foreground",
          )}
        >
          {delta && (
            <span className="inline-flex items-center gap-0.5 font-medium text-primary">
              <TrendingUp className="size-3" />
              {delta}
            </span>
          )}
          {delta && foot && <span>·</span>}
          {foot && <span>{foot}</span>}
        </div>
      )}
    </Card>
  );
}
