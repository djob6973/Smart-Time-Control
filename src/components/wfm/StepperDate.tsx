import { ChevronLeft, ChevronRight } from "lucide-react";

export function StepperDate({ label, onPrev, onNext }: {
  label: string;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  return (
    <div className="inline-flex items-center rounded-pill border border-border bg-card overflow-hidden">
      <button
        onClick={onPrev}
        className="px-3 py-2 grid place-items-center text-foreground hover:bg-secondary transition-colors"
        aria-label="Anterior"
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="px-4 py-2 text-sm font-medium whitespace-nowrap border-x border-border">
        {label}
      </span>
      <button
        onClick={onNext}
        className="px-3 py-2 grid place-items-center text-foreground hover:bg-secondary transition-colors"
        aria-label="Siguiente"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-pill border border-border bg-card p-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={
            "px-4 py-1.5 rounded-pill text-sm font-medium transition-colors whitespace-nowrap " +
            (value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
