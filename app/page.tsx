"use client";
import { useState, KeyboardEvent, useEffect } from "react";
import RecipeCard from "@/components/RecipeCard";

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

const DIETARY_OPTIONS = ["Vegetarian", "Vegan", "Gluten-Free", "Dairy-Free", "Low-Carb", "Halal", "Kosher"];
const CUISINE_OPTIONS = ["Mexican", "Chinese", "Indian"];
const STORAGE_KEY = "fridgr_access_code";

export default function Home() {
  const [accessCode, setAccessCode] = useState("");
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [codeError, setCodeError] = useState("");
  const [input, setInput] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [maxCalories, setMaxCalories] = useState("");
  const [minProtein, setMinProtein] = useState("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [cuisine, setCuisine] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) setSavedCode(stored);
  }, []);

  async function submitCode() {
    if (!accessCode.trim()) return;
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-access-code": accessCode.trim() },
      body: JSON.stringify({ ingredients: ["test"], checkAuth: true }),
    });
    if (res.status === 403) {
      setCodeError("Wrong code. Try again.");
      return;
    }
    localStorage.setItem(STORAGE_KEY, accessCode.trim());
    setSavedCode(accessCode.trim());
    setCodeError("");
  }

  function handleCodeKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") submitCode();
  }

  function addIngredient() {
    const trimmed = input.trim();
    if (trimmed && !ingredients.includes(trimmed.toLowerCase())) {
      setIngredients([...ingredients, trimmed.toLowerCase()]);
    }
    setInput("");
  }

  function removeIngredient(item: string) {
    setIngredients(ingredients.filter((i) => i !== item));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addIngredient();
    }
  }

  function toggleDietary(option: string) {
    setDietary((prev) =>
      prev.includes(option) ? prev.filter((d) => d !== option) : [...prev, option]
    );
  }

  function toggleCuisine(option: string) {
    setCuisine((prev) =>
      prev.includes(option) ? prev.filter((c) => c !== option) : [...prev, option]
    );
  }

  async function findRecipes() {
    if (ingredients.length === 0) {
      setError("Add at least one ingredient first.");
      return;
    }
    setError("");
    setLoading(true);
    setRecipes([]);

    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-access-code": savedCode ?? "",
        },
        body: JSON.stringify({
          ingredients,
          maxCalories: maxCalories ? Number(maxCalories) : null,
          minProtein: minProtein ? Number(minProtein) : null,
          dietary,
          cuisine,
        }),
      });

      if (res.status === 403) {
        localStorage.removeItem(STORAGE_KEY);
        setSavedCode(null);
        return;
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setRecipes(data.recipes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  // Passcode gate
  if (!savedCode) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">fridgr</h1>
            <p className="text-slate-500 mt-1">Enter your access code to continue.</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              onKeyDown={handleCodeKeyDown}
              placeholder="Access code"
              className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent mb-3"
              autoFocus
            />
            {codeError && <p className="text-red-500 text-sm mb-3">{codeError}</p>}
            <button
              onClick={submitCode}
              className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors"
            >
              Continue
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">fridgr</h1>
          <p className="text-slate-500 mt-1">Turn what you have into what to eat.</p>
        </div>

        {/* Ingredient Input */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 mb-4 shadow-sm">
          <h2 className="font-semibold text-slate-900 mb-3">What&apos;s in your fridge?</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="chicken, rice, broccoli..."
              className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <button
              onClick={addIngredient}
              className="bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
            >
              Add
            </button>
          </div>

          {ingredients.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {ingredients.map((item) => (
                <span
                  key={item}
                  className="flex items-center gap-1.5 bg-slate-100 text-slate-700 text-sm px-3 py-1.5 rounded-full"
                >
                  {item}
                  <button
                    onClick={() => removeIngredient(item)}
                    className="text-slate-400 hover:text-slate-700 leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Macro Goals */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 mb-4 shadow-sm">
          <h2 className="font-semibold text-slate-900 mb-3">Your goals</h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Max calories</label>
              <input
                type="text"
                inputMode="numeric"
                value={maxCalories}
                onChange={(e) => setMaxCalories(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 600"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Min protein (g)</label>
              <input
                type="text"
                inputMode="numeric"
                value={minProtein}
                onChange={(e) => setMinProtein(e.target.value.replace(/\D/g, ""))}
                placeholder="e.g. 40"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {DIETARY_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => toggleDietary(option)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  dietary.includes(option)
                    ? "bg-green-600 text-white border-green-600"
                    : "border-slate-200 text-slate-600 hover:border-green-400"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <label className="text-xs font-medium text-slate-500 block mb-1">Cuisine</label>
          <div className="flex flex-wrap gap-2">
            {CUISINE_OPTIONS.map((option) => (
              <button
                key={option}
                onClick={() => toggleCuisine(option)}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                  cuisine.includes(option)
                    ? "bg-green-600 text-white border-green-600"
                    : "border-slate-200 text-slate-600 hover:border-green-400"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </section>

        {error && <p className="text-red-600 text-sm mb-4 px-1">{error}</p>}

        <button
          onClick={findRecipes}
          disabled={loading}
          className="w-full bg-green-600 text-white py-3.5 rounded-2xl font-semibold text-base hover:bg-green-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm mb-6"
        >
          {loading ? "Finding recipes..." : "Find Recipes"}
        </button>

        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
                <div className="h-5 bg-slate-200 rounded-full w-2/3 mb-2" />
                <div className="h-3 bg-slate-100 rounded-full w-1/2 mb-4" />
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((j) => (
                    <div key={j} className="h-12 bg-slate-100 rounded-xl" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && recipes.length > 0 && (
          <div>
            <h2 className="font-semibold text-slate-900 mb-3">{recipes.length} recipes found</h2>
            <div className="space-y-4">
              {recipes.map((recipe, i) => (
                <RecipeCard key={i} recipe={recipe} />
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
