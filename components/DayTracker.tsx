"use client";
import { useState, useEffect } from "react";

type MacroEntry = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

type DailyLog = {
  date: string;
  entries: MacroEntry[];
};

type DailyGoals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

const DEFAULT_GOALS: DailyGoals = {
  calories: 2000,
  protein: 150,
  carbs: 250,
  fat: 65,
  fiber: 28,
};

const LOG_KEY = "fridgr_daily_log";
const GOALS_KEY = "fridgr_daily_goals";

function today() {
  return new Date().toISOString().split("T")[0];
}

function loadLog(): MacroEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const log: DailyLog = JSON.parse(raw);
    if (log.date !== today()) return [];
    return log.entries;
  } catch {
    return [];
  }
}

function saveLog(entries: MacroEntry[]) {
  localStorage.setItem(LOG_KEY, JSON.stringify({ date: today(), entries }));
}

function loadGoals(): DailyGoals {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    if (!raw) return DEFAULT_GOALS;
    return { ...DEFAULT_GOALS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_GOALS;
  }
}

function saveGoals(goals: DailyGoals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

export function logMeal(entry: MacroEntry) {
  const entries = loadLog();
  saveLog([...entries, entry]);
}

export default function DayTracker() {
  const [entries, setEntries] = useState<MacroEntry[]>([]);
  const [goals, setGoals] = useState<DailyGoals>(DEFAULT_GOALS);
  const [editingGoals, setEditingGoals] = useState(false);
  const [goalDraft, setGoalDraft] = useState<DailyGoals>(DEFAULT_GOALS);
  const [manualEntry, setManualEntry] = useState<Partial<MacroEntry>>({ name: "" });
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    setEntries(loadLog());
    const g = loadGoals();
    setGoals(g);
    setGoalDraft(g);
  }, []);

  const totals = entries.reduce(
    (acc, e) => ({
      calories: acc.calories + (e.calories || 0),
      protein: acc.protein + (e.protein || 0),
      carbs: acc.carbs + (e.carbs || 0),
      fat: acc.fat + (e.fat || 0),
      fiber: acc.fiber + (e.fiber || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );

  function removeEntry(index: number) {
    const updated = entries.filter((_, i) => i !== index);
    setEntries(updated);
    saveLog(updated);
  }

  function saveGoalEdits() {
    setGoals(goalDraft);
    saveGoals(goalDraft);
    setEditingGoals(false);
  }

  function addManual() {
    const entry: MacroEntry = {
      name: manualEntry.name || "Custom entry",
      calories: Number(manualEntry.calories) || 0,
      protein: Number(manualEntry.protein) || 0,
      carbs: Number(manualEntry.carbs) || 0,
      fat: Number(manualEntry.fat) || 0,
      fiber: Number(manualEntry.fiber) || 0,
    };
    const updated = [...entries, entry];
    setEntries(updated);
    saveLog(updated);
    setManualEntry({ name: "" });
    setShowManual(false);
  }

  const macros: { key: keyof DailyGoals; label: string; unit: string; color: string; bar: string }[] = [
    { key: "calories", label: "Calories", unit: "", color: "text-orange-700", bar: "bg-orange-400" },
    { key: "protein", label: "Protein", unit: "g", color: "text-green-700", bar: "bg-green-500" },
    { key: "carbs", label: "Carbs", unit: "g", color: "text-blue-700", bar: "bg-blue-400" },
    { key: "fat", label: "Fat", unit: "g", color: "text-purple-700", bar: "bg-purple-400" },
    { key: "fiber", label: "Fiber", unit: "g", color: "text-yellow-700", bar: "bg-yellow-400" },
  ];

  return (
    <div className="space-y-4">
      {/* Daily Summary */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Today&apos;s progress</h2>
          <button
            onClick={() => { setEditingGoals(!editingGoals); setGoalDraft(goals); }}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            {editingGoals ? "Cancel" : "Edit goals"}
          </button>
        </div>

        {editingGoals ? (
          <div className="space-y-3">
            {macros.map(({ key, label, unit }) => (
              <div key={key} className="flex items-center gap-3">
                <label className="text-xs text-slate-500 w-20 shrink-0">{label}{unit ? ` (${unit})` : ""}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={goalDraft[key]}
                  onChange={(e) => setGoalDraft({ ...goalDraft, [key]: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                  className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            ))}
            <button
              onClick={saveGoalEdits}
              className="w-full bg-green-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors mt-2"
            >
              Save goals
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {macros.map(({ key, label, unit, color, bar }) => {
              const val = totals[key];
              const goal = goals[key];
              const pct = Math.min(100, goal > 0 ? Math.round((val / goal) * 100) : 0);
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className={`font-medium ${color}`}>{label}</span>
                    <span className="text-slate-500">
                      {val}{unit} / {goal}{unit}
                      <span className="text-slate-400 ml-1">({pct}%)</span>
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${bar} rounded-full transition-all duration-300`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Today's Log */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Today&apos;s log</h2>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-slate-400 px-5 py-6 text-center">
            Nothing logged yet. Generate recipes or add manually below.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((entry, i) => (
              <li key={i} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{entry.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {entry.calories} cal · {entry.protein}g protein · {entry.carbs}g carbs · {entry.fat}g fat · {entry.fiber}g fiber
                  </p>
                </div>
                <button
                  onClick={() => removeEntry(i)}
                  className="text-slate-300 hover:text-red-400 transition-colors text-lg leading-none shrink-0"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Add Manually */}
      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowManual(!showManual)}
          className="w-full px-5 py-4 text-sm font-medium text-slate-600 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <span>Add manually</span>
          <span className="text-slate-400">{showManual ? "↑" : "↓"}</span>
        </button>

        {showManual && (
          <div className="px-5 pb-5 space-y-3 border-t border-slate-100 pt-4">
            <input
              type="text"
              placeholder="Name (e.g. Protein bar, Apple)"
              value={manualEntry.name || ""}
              onChange={(e) => setManualEntry({ ...manualEntry, name: e.target.value })}
              className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="grid grid-cols-5 gap-2">
              {macros.map(({ key, label }) => (
                <div key={key}>
                  <label className="text-xs text-slate-400 block mb-1">{label}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={manualEntry[key] ?? ""}
                    onChange={(e) => setManualEntry({ ...manualEntry, [key]: e.target.value.replace(/\D/g, "") })}
                    className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm text-slate-900 placeholder-slate-400 text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={addManual}
              className="w-full bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Add to log
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
