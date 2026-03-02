"use client";
import { useState, KeyboardEvent, useEffect, useRef } from "react";
import RecipeCard from "@/components/RecipeCard";
import type { Recipe as RecipeType } from "@/components/RecipeCard";
import DayTracker, { logMeal } from "@/components/DayTracker";
import CommunityFeed from "@/components/CommunityFeed";
import AuthModal from "@/components/AuthModal";
import ProfilePage from "@/components/ProfilePage";
import NotificationsPanel from "@/components/NotificationsPanel";
import { createClient } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";

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
const CUISINE_OPTIONS = [
  "Mexican", "Chinese", "Indian", "Italian", "Japanese",
  "Thai", "Mediterranean", "American", "Korean", "Middle Eastern", "French", "Greek",
];
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
  const [view, setView] = useState<"recipes" | "community" | "day" | "profile">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("fridgr_view");
      if (saved === "recipes" || saved === "community" || saved === "day" || saved === "profile") return saved;
    }
    return "recipes";
  });
  const [loading, setLoading] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [error, setError] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [shareRecipe, setShareRecipe] = useState<RecipeType | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState<string[]>([]);
  const [scanError, setScanError] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);

  const supabase = createClient();

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      // Validate stored code is still correct before accepting it
      fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-code": stored },
        body: JSON.stringify({ ingredients: ["test"], checkAuth: true }),
      }).then((res) => {
        if (res.status === 403) {
          localStorage.removeItem(STORAGE_KEY);
        } else {
          setSavedCode(stored);
        }
      });
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) setShowAuthModal(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setAvatarUrl(null); setUnreadCount(0); return; }
    supabase.from("profiles").select("avatar_url").eq("id", user.id).single()
      .then(({ data }) => setAvatarUrl(data?.avatar_url ?? null));

    // Fetch initial unread count
    supabase.from("notifications").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).eq("read", false)
      .then(({ count }) => setUnreadCount(count ?? 0));

    // Real-time: increment badge on new notification
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`,
      }, () => setUnreadCount((c) => c + 1))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    localStorage.setItem("fridgr_view", view);
  }, [view]);

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

  async function handleScanSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setScanError("");
    setScanning(true);
    setScannedItems([]);

    // Compress image to max 800px before sending
    const compressed = await new Promise<string>((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxW = 800;
        const scale = Math.min(1, maxW / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = url;
    });

    try {
      const res = await fetch("/api/scan-fridge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-access-code": savedCode ?? "",
        },
        body: JSON.stringify({ image: compressed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error || "Scan failed. Try again.");
      } else if (data.ingredients?.length > 0) {
        setScannedItems(data.ingredients);
      } else {
        setScanError("No food items detected. Try a clearer photo.");
      }
    } catch {
      setScanError("Scan failed. Check your connection and try again.");
    } finally {
      setScanning(false);
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">fridgr</h1>
            <p className="text-slate-500 mt-1">Turn what you have into what to eat.</p>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <button
                onClick={() => setShowNotifications(true)}
                className="relative w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Notifications"
              >
                <span className="text-xl">🔔</span>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => user ? setView("profile") : setShowAuthModal(true)}
              className={`w-10 h-10 rounded-full overflow-hidden flex items-center justify-center shrink-0 transition-all ${
                view === "profile"
                  ? "ring-2 ring-green-500 ring-offset-2"
                  : "hover:ring-2 hover:ring-slate-300 hover:ring-offset-1"
              } ${avatarUrl ? "" : "bg-green-100 text-green-700 font-bold text-sm"}`}
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="profile" className="w-full h-full object-cover" />
              ) : user ? (
                (user.user_metadata?.full_name || user.email || "?").slice(0, 2).toUpperCase()
              ) : (
                <span className="text-slate-400 text-lg">👤</span>
              )}
            </button>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6">
          {(["recipes", "community", "day"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {v === "recipes" ? "Recipes" : v === "community" ? "Community" : "My Day"}
            </button>
          ))}
        </div>

        {view === "day" && <DayTracker user={user} />}

        {view === "community" && (
          <CommunityFeed
            user={user}
            onRequireAuth={() => setShowAuthModal(true)}
            initialRecipe={shareRecipe}
            onShareConsumed={() => setShareRecipe(null)}
          />
        )}

        {view === "profile" && (
          <ProfilePage
            user={user}
            onRequireAuth={() => setShowAuthModal(true)}
            onSignOut={() => supabase.auth.signOut()}
            onAvatarChange={setAvatarUrl}
          />
        )}

        {view === "recipes" && <>
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
            <button
              onClick={() => scanInputRef.current?.click()}
              disabled={scanning}
              title="Scan your fridge"
              className="bg-slate-100 text-slate-600 px-3 py-2.5 rounded-xl text-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              {scanning ? (
                <span className="inline-block w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              ) : "📷"}
            </button>
            <input
              ref={scanInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleScanSelect}
            />
          </div>

          {/* Scan error */}
          {scanError && (
            <p className="text-red-500 text-xs mt-2 px-1">{scanError}</p>
          )}

          {/* Scan review panel */}
          {scannedItems.length > 0 && (
            <div className="mt-3 p-3 bg-green-50 rounded-xl border border-green-100">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-green-700">Detected — tap × to remove any wrong items</p>
                <button
                  onClick={() => setScannedItems([])}
                  className="text-green-400 hover:text-green-600 text-sm leading-none"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {scannedItems.map((item) => (
                  <span key={item} className="flex items-center gap-1 bg-white text-slate-700 text-xs px-2.5 py-1.5 rounded-full border border-slate-200">
                    {item}
                    <button
                      onClick={() => setScannedItems((prev) => prev.filter((i) => i !== item))}
                      className="text-slate-300 hover:text-red-400 leading-none"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <button
                onClick={() => {
                  const toAdd = scannedItems.filter((item) => !ingredients.includes(item));
                  setIngredients((prev) => [...prev, ...toAdd]);
                  setScannedItems([]);
                }}
                className="w-full bg-green-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors"
              >
                Add {scannedItems.filter((item) => !ingredients.includes(item)).length} items to fridge
              </button>
            </div>
          )}

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
            {[1, 2, 3, 4, 5].map((i) => (
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
                <RecipeCard
                  key={i}
                  recipe={recipe}
                  onLog={(r) => { logMeal({ name: r.name, ...r.macros }, user?.id); }}
                  onShare={() => { setShareRecipe(recipe); setView("community"); }}
                />
              ))}
            </div>
          </div>
        )}
        </>}
      </div>

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={() => setShowAuthModal(false)}
        />
      )}

      {showNotifications && user && (
        <NotificationsPanel
          user={user}
          onClose={() => setShowNotifications(false)}
          onMarkRead={() => setUnreadCount(0)}
        />
      )}
    </main>
  );
}
