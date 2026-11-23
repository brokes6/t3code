import { cn } from "../../lib/utils";

export type UsageTone = "error" | "warning" | null;

export function limitTone(left: number): UsageTone {
  if (left <= 10) return "error";
  if (left <= 20) return "warning";
  return null;
}

export function UsageBar({
  fill,
  tone,
  tick,
  muted = false,
  color,
  accentTick = false,
}: {
  readonly fill: number;
  readonly tone: UsageTone;
  readonly tick: number | null;
  readonly muted?: boolean;
  readonly color?: string;
  readonly accentTick?: boolean;
}) {
  return (
    <span aria-hidden className="relative block h-1.5">
      <span className="absolute inset-0 overflow-hidden rounded-full bg-foreground/12">
        {fill > 0 ? (
          <span
            className={cn(
              "absolute inset-y-0 left-0 rounded-full motion-safe:transition-[width] motion-safe:duration-200",
              tone === "error"
                ? "bg-error"
                : tone === "warning"
                  ? "bg-warning"
                  : muted
                    ? "bg-muted-foreground"
                    : "bg-foreground/70",
            )}
            style={{
              width: `max(2px, ${fill}%)`,
              backgroundColor:
                tone === null && color
                  ? `color-mix(in oklab, ${color} 70%, transparent)`
                  : undefined,
            }}
          />
        ) : null}
      </span>
      {tick !== null ? (
        <span
          className={cn(
            "absolute -inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full ring-1 ring-background",
            accentTick ? "bg-warning" : "bg-foreground",
          )}
          style={{ left: `clamp(1px, ${tick}%, calc(100% - 1px))` }}
        />
      ) : null}
    </span>
  );
}
