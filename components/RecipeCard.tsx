"use client";
import { useState } from "react";

type Recipe = {
  name: string;
  description: string;
  prepTime: string;
  servings: number;
  macros: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  have: string[];
  need: string[];
  steps: string[];
};

export { Recipe };
export default function RecipeCard({ recipe, onLog, onShare }: { recipe: Recipe; onLog?: (recipe: Recipe) => void; onShare?: () => void }) {
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState(false);

  function handleLog() {
    onLog?.(recipe);
    setLogged(true);
    setTimeout(() => setLogged(false), 2000);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-slate-900 text-lg leading-tight">{recipe.name}</h3>
            <p className="text-slate-500 text-sm mt-0.5">{recipe.description}</p>
          </div>
          <div className="text-right shrink-0">
            <span className="text-xs text-slate-400">{recipe.prepTime}</span>
            <div className="text-xs text-slate-400 mt-0.5">{recipe.servings} servings</div>
          </div>
        </div>

        {/* Macros */}
        <div className="grid grid-cols-5 gap-2 mt-4">
          <MacroChip label="cal" value={recipe.macros.calories} color="bg-orange-50 text-orange-700" />
          <MacroChip label="protein" value={`${recipe.macros.protein}g`} color="bg-green-50 text-green-700" />
          <MacroChip label="carbs" value={`${recipe.macros.carbs}g`} color="bg-blue-50 text-blue-700" />
          <MacroChip label="fat" value={`${recipe.macros.fat}g`} color="bg-purple-50 text-purple-700" />
          <MacroChip label="fiber" value={`${recipe.macros.fiber}g`} color="bg-yellow-50 text-yellow-700" />
        </div>

        <div className="flex gap-2 mt-3">
          {onLog && (
            <button
              onClick={handleLog}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                logged
                  ? "bg-green-100 text-green-700"
                  : "bg-slate-100 text-slate-600 hover:bg-green-50 hover:text-green-700"
              }`}
            >
              {logged ? "✓ Logged" : "Log meal"}
            </button>
          )}
          {onShare && (
            <button
              onClick={onShare}
              className="flex-1 py-2 rounded-xl text-sm font-medium border border-green-500 text-green-600 hover:bg-green-50 transition-colors"
            >
              Share
            </button>
          )}
        </div>

        {/* Ingredients */}
        <div className="mt-4">
          {recipe.have && recipe.have.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {recipe.have.map((item) => (
                <span key={item} className="flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-1 rounded-full">
                  <span>✓</span> {item}
                </span>
              ))}
            </div>
          )}
          {recipe.need && recipe.need.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recipe.need.map((item) => (
                <span key={item} className="flex items-center gap-1 text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">
                  <span>+</span> {item}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Steps toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-3 text-sm font-medium text-slate-600 border-t border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors"
      >
        <span>{open ? "Hide" : "Show"} steps</span>
        <span className="text-slate-400">{open ? "↑" : "↓"}</span>
      </button>

      {open && (
        <ol className="px-5 pb-5 space-y-2">
          {recipe.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-slate-600">
              <span className="shrink-0 w-5 h-5 rounded-full bg-green-100 text-green-700 font-medium text-xs flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function MacroChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={`${color} rounded-xl p-2 text-center`}>
      <div className="font-semibold text-sm leading-none">{value}</div>
      <div className="text-xs opacity-70 mt-1">{label}</div>
    </div>
  );
}
