"use client";
import { useState, KeyboardEvent } from "react";
import RecipeCard from "@/components/RecipeCard";

type Recipe = {
  name: string;
  description: string;
  prepTime: string;
  servings: number;
  macros: { calories: number; protein: number; carbs: number; fat: number };
  have: string[];
  need: string[];
  steps: string[];
};

const DIETARY_OPTIONS = ["Vegetarian", "Vegan", "Gluten-Free", "Dairy-Free", "Low-Carb"];

export default function Home() {
  const [input, setInput] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [maxCalories, setMaxCalories] = useState("");
  const [minProtein, setMinProtein] = useState("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [error, setError] = useState("");

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients,
          maxCalories: maxCalories ? Number(maxCalories) : null,
          minProtein: minProtein ? Number(minProtein) : null,
          dietary,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setRecipes(data.recipes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
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
                type="number"
                value={maxCalories}
                onChange={(e) => setMaxCalories(e.target.value)}
                placeholder="e.g. 600"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1">Min protein (g)</label>
              <input
                type="number"
                value={minProtein}
                onChange={(e) => setMinProtein(e.target.value)}
                placeholder="e.g. 40"
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
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
        </section>

        {/* Error */}
        {error && (
          <p className="text-red-600 text-sm mb-4 px-1">{error}</p>
        )}

        {/* Find Recipes Button */}
        <button
          onClick={findRecipes}
          disabled={loading}
          className="w-full bg-green-600 text-white py-3.5 rounded-2xl font-semibold text-base hover:bg-green-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm mb-6"
        >
          {loading ? "Finding recipes..." : "Find Recipes"}
        </button>

        {/* Loading skeleton */}
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

        {/* Results */}
        {!loading && recipes.length > 0 && (
          <div>
            <h2 className="font-semibold text-slate-900 mb-3">
              {recipes.length} recipes found
            </h2>
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
