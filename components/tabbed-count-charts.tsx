"use client";

import { useMemo, useState } from "react";

type ChartView = "difficulty" | "letter";

type Segment = {
  label: string;
  count: number;
  color: string;
};

type DailyRow = {
  date: string;
  count: number;
  difficultySegments: Segment[];
  letterSegments: Segment[];
};

type WeeklyRow = {
  weekStart: string;
  count: number;
  difficultySegments: Segment[];
  letterSegments: Segment[];
};

type TabbedCountChartsProps = {
  dailyRows: DailyRow[];
  weeklyRows: WeeklyRow[];
  initialDailyView: ChartView;
  initialWeeklyView: ChartView;
  dailyEmptyMessage: string;
  weeklyEmptyMessage: string;
};

export function TabbedCountCharts({
  dailyRows,
  weeklyRows,
  initialDailyView,
  initialWeeklyView,
  dailyEmptyMessage,
  weeklyEmptyMessage,
}: TabbedCountChartsProps) {
  const [dailyView, setDailyView] = useState<ChartView>(initialDailyView);
  const [weeklyView, setWeeklyView] = useState<ChartView>(initialWeeklyView);

  const maxDaily = Math.max(1, ...dailyRows.map((r) => r.count));
  const maxWeekly = Math.max(1, ...weeklyRows.map((r) => r.count));

  const dailyLegend = useMemo(() => {
    const labels = new Map<string, string>();
    for (const row of dailyRows) {
      const segments = dailyView === "difficulty" ? row.difficultySegments : row.letterSegments;
      for (const s of segments) {
        labels.set(s.label, s.color);
      }
    }
    return [...labels.entries()].map(([label, color]) => ({ label, color }));
  }, [dailyRows, dailyView]);

  const weeklyLegend = useMemo(() => {
    const labels = new Map<string, string>();
    for (const row of weeklyRows) {
      const segments = weeklyView === "difficulty" ? row.difficultySegments : row.letterSegments;
      for (const s of segments) {
        labels.set(s.label, s.color);
      }
    }
    return [...labels.entries()].map(([label, color]) => ({ label, color }));
  }, [weeklyRows, weeklyView]);

  return (
    <>
      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-semibold">日別の解いた問題数</h2>
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => setDailyView("difficulty")}
            className={`rounded-md px-3 py-1 ${
              dailyView === "difficulty"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            difficulty
          </button>
          <button
            type="button"
            onClick={() => setDailyView("letter")}
            className={`rounded-md px-3 py-1 ${
              dailyView === "letter"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            問題番号（A/B...）
          </button>
        </div>
        {dailyRows.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{dailyEmptyMessage}</p>
        ) : (
          <div className="space-y-2">
            {dailyRows.slice(-30).map((row) => {
              const segments = dailyView === "difficulty" ? row.difficultySegments : row.letterSegments;
              return (
                <div key={row.date} className="grid grid-cols-[96px_1fr_40px] items-center gap-3 text-sm">
                  <span>{row.date.slice(5)}</span>
                  <div className="h-3 rounded bg-zinc-100 dark:bg-zinc-800">
                    <div className="flex h-3 overflow-hidden rounded" style={{ width: `${(row.count / maxDaily) * 100}%` }}>
                      {segments.map((segment) => (
                        <div
                          key={`${row.date}-${segment.label}`}
                          style={{
                            width: `${(segment.count / row.count) * 100}%`,
                            backgroundColor: segment.color,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-right">{row.count}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-600 dark:text-zinc-300">
          {dailyLegend.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-3 text-lg font-semibold">週ごとの解いた問題数</h2>
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => setWeeklyView("difficulty")}
            className={`rounded-md px-3 py-1 ${
              weeklyView === "difficulty"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            difficulty
          </button>
          <button
            type="button"
            onClick={() => setWeeklyView("letter")}
            className={`rounded-md px-3 py-1 ${
              weeklyView === "letter"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
            }`}
          >
            問題番号（A/B...）
          </button>
        </div>
        {weeklyRows.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-300">{weeklyEmptyMessage}</p>
        ) : (
          <div className="space-y-2">
            {weeklyRows.map((row) => {
              const segments = weeklyView === "difficulty" ? row.difficultySegments : row.letterSegments;
              return (
                <div key={row.weekStart} className="grid grid-cols-[120px_1fr_40px] items-center gap-3 text-sm">
                  <span>{row.weekStart}</span>
                  <div className="h-3 rounded bg-zinc-100 dark:bg-zinc-800">
                    <div className="flex h-3 overflow-hidden rounded" style={{ width: `${(row.count / maxWeekly) * 100}%` }}>
                      {segments.map((segment) => (
                        <div
                          key={`${row.weekStart}-${segment.label}`}
                          style={{
                            width: `${(segment.count / row.count) * 100}%`,
                            backgroundColor: segment.color,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <span className="text-right">{row.count}</span>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-600 dark:text-zinc-300">
          {weeklyLegend.map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}