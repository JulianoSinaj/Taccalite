import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WeekDayRanges } from "@/lib/hours";

type Tone = "paper" | "dark";

type WeekBarsProps = {
  week: WeekDayRanges[];
  /** ISO weekday of "today" (1 = Monday). Resolved by the page — never here. */
  today?: number;
  /** Minutes since midnight, for the "adesso" hairline. Omit to leave it off. */
  nowMinutes?: number;
  tone?: Tone;
  className?: string;
};

const HOUR = 60;

/** Two-letter day heads, Italian week order. */
const HEADS = ["LU", "MA", "ME", "GI", "VE", "SA", "DO"];

/**
 * The chart's word for "we do not know this", per ground. It was written once
 * against paper and read as nothing at all on the brown band, where the detail
 * page draws the same week — so each surface carries its own ink.
 */
const HATCH: Record<Tone, string> = {
  paper: "repeating-linear-gradient(-45deg, var(--rule-strong) 0 1px, transparent 1px 6px)",
  dark: "repeating-linear-gradient(-45deg, color-mix(in srgb, var(--color-cream) 22%, transparent) 0 1px, transparent 1px 6px)",
};

/**
 * Whether there is a clock to draw the week against.
 *
 * `WeekBars` needs at least one readable range to size its axis, and a caller
 * has to know that *before* it lays a card out around a chart. Exported as a
 * guard rather than left implicit inside the render, so the stand-in below and
 * the bail above cannot drift apart.
 */
export function weekIsDrawable(
  week: WeekDayRanges[] | null | undefined
): week is WeekDayRanges[] {
  return !!week && week.some((d) => d.ranges != null && d.ranges.length > 0);
}

/** The day strip under the plot. Shared, so the chart and its stand-in align. */
function DayHeads({ days, today, dark }: { days: number[]; today?: number; dark: boolean }) {
  return (
    <div className="mt-2.5 flex gap-2.5 sm:gap-3.5">
      <span className="w-7 shrink-0 sm:w-8" />
      <div className="flex flex-1 gap-1 sm:gap-2">
        {days.map((day) => (
          <span
            key={day}
            aria-hidden
            className={cn(
              "min-w-0 flex-1 py-1 text-center text-[0.5625rem] font-bold tracking-[0.12em] uppercase",
              day === today
                ? dark
                  ? "bg-gold text-brown-950"
                  : "bg-brown-950 text-cream"
                : dark
                  ? "text-cream/55"
                  : "text-taupe"
            )}
          >
            {HEADS[day - 1]}
          </span>
        ))}
      </div>
    </div>
  );
}

function hhmm(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}` : `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * The week the shop is open, drawn.
 *
 * The hours were only ever a list, and a list is the one format that cannot
 * answer the question people actually arrive with — when is it worth walking
 * over? Bars against a common clock answer it at a glance: the market bottega's
 * mornings and the Centro's long continuous day read as two different shapes
 * before a single number has been read.
 *
 * Every value comes from `shopWeekGrid`, which keeps "closed" and "we could not
 * read this" apart; so does this. A day the data never stated is drawn as an
 * empty hatched column marked "n.d.", never as a closed one.
 */
export default function WeekBars({
  week,
  today,
  nowMinutes,
  tone = "paper",
  className,
}: WeekBarsProps) {
  const dark = tone === "dark";
  if (!weekIsDrawable(week)) return null;
  const all = week.flatMap((d) => d.ranges ?? []);

  // The clock the bars are measured against: the shop's own day, rounded out to
  // whole hours and never shorter than eight, so a single short market morning
  // is not stretched to fill the frame and read as "open all day".
  const rawStart = Math.min(...all.map((r) => r.start));
  const rawEnd = Math.max(...all.map((r) => r.end));
  let winStart = Math.max(0, Math.floor(rawStart / HOUR) * HOUR - HOUR);
  let winEnd = Math.min(24 * HOUR, Math.ceil(rawEnd / HOUR) * HOUR + HOUR);
  if (winEnd - winStart < 8 * HOUR) winEnd = Math.min(24 * HOUR, winStart + 8 * HOUR);
  if (winEnd - winStart < 8 * HOUR) winStart = Math.max(0, winEnd - 8 * HOUR);
  const span = winEnd - winStart;
  const pct = (m: number) => ((m - winStart) / span) * 100;

  // Whole-hour rules, thinned to at most six so the grid stays a grid.
  const step = Math.max(1, Math.ceil((winEnd - winStart) / HOUR / 5));
  const ticks: number[] = [];
  for (let m = winStart; m <= winEnd; m += step * HOUR) ticks.push(m);

  const showNow =
    nowMinutes != null && today != null && nowMinutes >= winStart && nowMinutes <= winEnd;

  return (
    <figure className={cn("m-0", className)}>
      <div className="flex gap-2.5 sm:gap-3.5">
        {/* The clock face: hours down the left margin, like a timetable. */}
        <div className="relative h-40 w-7 shrink-0 sm:h-48 sm:w-8">
          {ticks.map((m) => (
            <span
              key={m}
              className={cn(
                "absolute right-0 -translate-y-1/2 text-[0.5625rem] font-semibold tracking-[0.1em] tabular-nums",
                dark ? "text-cream/55" : "text-taupe"
              )}
              style={{ top: `${pct(m)}%` }}
            >
              {hhmm(m)}
            </span>
          ))}
        </div>

        <div className="relative h-40 flex-1 sm:h-48">
          {/* Ruled ground. */}
          <div aria-hidden className="absolute inset-0">
            {ticks.map((m) => (
              <span
                key={m}
                className={cn("absolute inset-x-0 h-px", dark ? "bg-cream/12" : "bg-rule")}
                style={{ top: `${pct(m)}%` }}
              />
            ))}
          </div>

          <div className="absolute inset-0 flex gap-1 sm:gap-2">
            {week.map((day) => {
              const isToday = day.day === today;
              const unknown = day.ranges == null;
              const closed = day.ranges != null && day.ranges.length === 0;
              return (
                <div key={day.day} className="relative min-w-0 flex-1">
                  {/* The column's own ground: today's is tinted, so the eye
                      lands on it before it reads a single label. */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-0",
                      isToday
                        ? dark
                          ? "bg-gold/12"
                          : "bg-gold/18"
                        : dark
                          ? "bg-cream/[0.04]"
                          : "bg-paper-deep/70",
                      unknown && "opacity-70"
                    )}
                    style={unknown ? { backgroundImage: HATCH[tone] } : undefined}
                  />

                  {(day.ranges ?? []).map((r) => (
                    <span
                      key={`${r.start}-${r.end}`}
                      className={cn(
                        "absolute inset-x-0",
                        isToday
                          ? dark
                            ? "bg-gold"
                            : "bg-brown-950"
                          : dark
                            ? // Warm, not grey: on the brown band a cream bar
                              // reads as ash. The week stays in the foil family
                              // and today is simply the one struck full.
                              "bg-gold/55"
                            : "bg-gold-dark"
                      )}
                      style={{
                        top: `${pct(r.start)}%`,
                        height: `${Math.max(2, pct(r.end) - pct(r.start))}%`,
                      }}
                    />
                  ))}

                  {closed && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-1/2 left-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2",
                        dark ? "bg-cream/30" : "bg-rule-strong"
                      )}
                    />
                  )}
                  {unknown && (
                    <span
                      aria-hidden
                      className={cn(
                        "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[0.5rem] font-bold tracking-[0.1em] uppercase",
                        dark ? "text-cream/55" : "text-taupe"
                      )}
                    >
                      n.d.
                    </span>
                  )}

                  {/* The chart is a picture; this is the same week in words, for
                      anyone who is not looking at it. */}
                  <span className="sr-only">
                    {day.name}:{" "}
                    {unknown
                      ? "orario non disponibile"
                      : closed
                        ? "chiuso"
                        : (day.ranges ?? [])
                            .map((r) => `${hhmm(r.start)}–${hhmm(r.end)}`)
                            .join(", ")}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Adesso: one hairline across the whole week at the current minute.
              It is what turns the chart from a schedule into a status. */}
          {showNow && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 flex items-center"
              style={{ top: `${pct(nowMinutes)}%` }}
            >
              <span className={cn("h-px flex-1", dark ? "bg-gold/70" : "bg-brown-950/45")} />
              <span
                className={cn("-mr-[3px] size-1.5 rotate-45", dark ? "bg-gold" : "bg-brown-950")}
              />
            </div>
          )}
        </div>
      </div>

      {/* Day heads. Outside the plot so the bars keep the full height. */}
      <DayHeads days={week.map((d) => d.day)} today={today} dark={dark} />
    </figure>
  );
}

/**
 * The chart's footprint, for a bottega whose week the data cannot yet state.
 *
 * `WeekBars` refuses to draw a clock it cannot read, and it is right to: seven
 * empty columns would claim the shop is shut all week. But the card around it
 * was composed for a chart, and without one the bottega reads as the lesser of
 * the two rather than as the one whose hours are still to be fixed — a gap in
 * the data showing up as a gap in the design.
 *
 * So the frame stays and the plot is struck with the same hatch a single
 * unknown day already gets. Nothing is invented: the hatch is the chart's own
 * word for "not known", and the panel says the one useful thing in its place —
 * call before you come.
 */
export function WeekBarsPending({
  today,
  tone = "paper",
  className,
}: {
  today?: number;
  tone?: Tone;
  className?: string;
}) {
  const dark = tone === "dark";
  return (
    <figure className={cn("m-0", className)}>
      <div className="flex gap-2.5 sm:gap-3.5">
        {/* The clock gutter, kept empty: there is no clock to letter. */}
        <span aria-hidden className="h-40 w-7 shrink-0 sm:h-48 sm:w-8" />

        <div className="relative h-40 flex-1 sm:h-48">
          <div aria-hidden className="absolute inset-0 flex gap-1 sm:gap-2">
            {HEADS.map((head) => (
              <span
                key={head}
                className={cn("min-w-0 flex-1 opacity-70", dark ? "bg-cream/[0.04]" : "bg-paper-deep/70")}
                style={{ backgroundImage: HATCH[tone] }}
              />
            ))}
          </div>

          <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 sm:inset-x-3">
            <div
              className={cn(
                "border px-4 py-3.5 text-center",
                dark ? "border-cream/15 bg-brown-950" : "border-rule bg-paper-warm"
              )}
            >
              <span
                className={cn(
                  "flex items-center justify-center gap-2 text-[0.5625rem] font-bold tracking-[0.12em] uppercase",
                  dark ? "text-gold" : "text-gold-deep"
                )}
              >
                <Clock className="size-3 shrink-0" />
                Orari da confermare
              </span>
              <p
                className={cn(
                  "mt-2 text-xs leading-relaxed text-pretty",
                  dark ? "text-cream/70" : "text-brown-700"
                )}
              >
                La settimana di questa bottega non è ancora fissata. Chiamaci prima di venire.
              </p>
            </div>
          </div>
        </div>
      </div>

      <DayHeads days={[1, 2, 3, 4, 5, 6, 7]} today={today} dark={dark} />
    </figure>
  );
}
