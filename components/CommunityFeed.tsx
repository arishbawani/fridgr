"use client";
import { useState, useEffect, KeyboardEvent } from "react";
import { createClient } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import CommunityRecipeCard, { CommunityRecipe } from "./CommunityRecipeCard";

type Comment = {
  id: string;
  content: string;
  created_at: string;
  profiles: { display_name: string | null } | null;
};

export default function CommunityFeed({
  user,
  onRequireAuth,
}: {
  user: User | null;
  onRequireAuth: () => void;
}) {
  const supabase = createClient();
  const [recipes, setRecipes] = useState<CommunityRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<CommunityRecipe | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);

  // Create form state
  const [form, setForm] = useState({
    name: "",
    description: "",
    prep_time: "",
    servings: "",
  });
  const [ingredientInput, setIngredientInput] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [stepInput, setStepInput] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [macros, setMacros] = useState({ calories: "", protein: "", carbs: "", fat: "", fiber: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchRecipes();
  }, [user]);

  async function fetchRecipes() {
    setLoading(true);
    const { data: recipesData } = await supabase
      .from("community_recipes")
      .select("*, profiles(display_name)")
      .order("created_at", { ascending: false });

    if (!recipesData) { setLoading(false); return; }

    // Get likes and saves for current user
    const ids = recipesData.map((r) => r.id);
    const [likesRes, savesRes, likeCountsRes, commentCountsRes] = await Promise.all([
      user ? supabase.from("recipe_likes").select("recipe_id").eq("user_id", user.id).in("recipe_id", ids) : Promise.resolve({ data: [] }),
      user ? supabase.from("recipe_saves").select("recipe_id").eq("user_id", user.id).in("recipe_id", ids) : Promise.resolve({ data: [] }),
      supabase.from("recipe_likes").select("recipe_id").in("recipe_id", ids),
      supabase.from("recipe_comments").select("recipe_id").in("recipe_id", ids),
    ]);

    const userLiked = new Set((likesRes.data ?? []).map((l: { recipe_id: string }) => l.recipe_id));
    const userSaved = new Set((savesRes.data ?? []).map((s: { recipe_id: string }) => s.recipe_id));
    const likeCounts = (likeCountsRes.data ?? []).reduce((acc: Record<string, number>, l: { recipe_id: string }) => {
      acc[l.recipe_id] = (acc[l.recipe_id] || 0) + 1;
      return acc;
    }, {});
    const commentCounts = (commentCountsRes.data ?? []).reduce((acc: Record<string, number>, c: { recipe_id: string }) => {
      acc[c.recipe_id] = (acc[c.recipe_id] || 0) + 1;
      return acc;
    }, {});

    setRecipes(
      recipesData.map((r) => ({
        ...r,
        like_count: likeCounts[r.id] || 0,
        comment_count: commentCounts[r.id] || 0,
        user_liked: userLiked.has(r.id),
        user_saved: userSaved.has(r.id),
      }))
    );
    setLoading(false);
  }

  function requireAuth(): boolean {
    if (user) return true;
    onRequireAuth();
    return false;
  }

  async function handleLike(id: string, liked: boolean) {
    if (!user) return;
    if (liked) {
      await supabase.from("recipe_likes").insert({ user_id: user.id, recipe_id: id });
    } else {
      await supabase.from("recipe_likes").delete().eq("user_id", user.id).eq("recipe_id", id);
    }
  }

  async function handleSave(id: string, saved: boolean) {
    if (!user) return;
    if (saved) {
      await supabase.from("recipe_saves").insert({ user_id: user.id, recipe_id: id });
    } else {
      await supabase.from("recipe_saves").delete().eq("user_id", user.id).eq("recipe_id", id);
    }
  }

  async function openDetail(recipe: CommunityRecipe) {
    setDetail(recipe);
    setCommentText("");
    setCommentsLoading(true);
    const { data } = await supabase
      .from("recipe_comments")
      .select("*, profiles(display_name)")
      .eq("recipe_id", recipe.id)
      .order("created_at", { ascending: true });
    setComments(data ?? []);
    setCommentsLoading(false);
  }

  async function postComment() {
    if (!user || !detail || !commentText.trim()) return;
    const content = commentText.trim();
    setCommentText("");
    const { data } = await supabase
      .from("recipe_comments")
      .insert({ user_id: user.id, recipe_id: detail.id, content })
      .select("*, profiles(display_name)")
      .single();
    if (data) setComments((prev) => [...prev, data]);
  }

  function addIngredient() {
    const t = ingredientInput.trim().toLowerCase();
    if (t && !ingredients.includes(t)) setIngredients([...ingredients, t]);
    setIngredientInput("");
  }

  function addStep() {
    const t = stepInput.trim();
    if (t) setSteps([...steps, t]);
    setStepInput("");
  }

  async function submitRecipe() {
    if (!user || !form.name.trim()) return;
    setSubmitting(true);
    const payload = {
      user_id: user.id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      prep_time: form.prep_time.trim() || null,
      servings: form.servings ? Number(form.servings) : null,
      ingredients: ingredients.length > 0 ? ingredients : null,
      steps: steps.length > 0 ? steps : null,
      macros: Object.values(macros).some(Boolean)
        ? {
            calories: macros.calories ? Number(macros.calories) : undefined,
            protein: macros.protein ? Number(macros.protein) : undefined,
            carbs: macros.carbs ? Number(macros.carbs) : undefined,
            fat: macros.fat ? Number(macros.fat) : undefined,
            fiber: macros.fiber ? Number(macros.fiber) : undefined,
          }
        : null,
    };
    await supabase.from("community_recipes").insert(payload);
    setForm({ name: "", description: "", prep_time: "", servings: "" });
    setIngredients([]);
    setSteps([]);
    setMacros({ calories: "", protein: "", carbs: "", fat: "", fiber: "" });
    setShowCreate(false);
    setSubmitting(false);
    fetchRecipes();
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Community Recipes</h2>
        <button
          onClick={() => {
            if (!requireAuth()) return;
            setShowCreate(true);
          }}
          className="bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-green-700 transition-colors"
        >
          + Share Recipe
        </button>
      </div>

      {/* Recipe list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/3 mb-3" />
              <div className="h-3 bg-slate-100 rounded w-full" />
            </div>
          ))}
        </div>
      ) : recipes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <p className="text-slate-400 text-sm">No recipes yet. Be the first to share one!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {recipes.map((r) => (
            <CommunityRecipeCard
              key={r.id}
              recipe={r}
              onLike={handleLike}
              onSave={handleSave}
              onOpen={openDetail}
              requireAuth={requireAuth}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Share a Recipe</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              <input
                placeholder="Recipe name *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <input
                placeholder="Short description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Prep time (e.g. 20 min)"
                  value={form.prep_time}
                  onChange={(e) => setForm({ ...form, prep_time: e.target.value })}
                  className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <input
                  placeholder="Servings"
                  inputMode="numeric"
                  value={form.servings}
                  onChange={(e) => setForm({ ...form, servings: e.target.value.replace(/\D/g, "") })}
                  className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Ingredients */}
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-2">Ingredients</label>
                <div className="flex gap-2 mb-2">
                  <input
                    placeholder="Add ingredient"
                    value={ingredientInput}
                    onChange={(e) => setIngredientInput(e.target.value)}
                    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && addIngredient()}
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button onClick={addIngredient} className="bg-slate-100 text-slate-700 px-3 py-2 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors">Add</button>
                </div>
                {ingredients.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {ingredients.map((item) => (
                      <span key={item} className="flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full">
                        {item}
                        <button onClick={() => setIngredients(ingredients.filter((i) => i !== item))} className="text-slate-400 hover:text-slate-700">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Steps */}
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-2">Steps</label>
                <div className="flex gap-2 mb-2">
                  <input
                    placeholder="Add a step"
                    value={stepInput}
                    onChange={(e) => setStepInput(e.target.value)}
                    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && addStep()}
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button onClick={addStep} className="bg-slate-100 text-slate-700 px-3 py-2 rounded-xl text-sm font-medium hover:bg-slate-200 transition-colors">Add</button>
                </div>
                {steps.length > 0 && (
                  <ol className="space-y-1.5">
                    {steps.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm text-slate-600">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs flex items-center justify-center font-medium">{i + 1}</span>
                        <span className="flex-1">{s}</span>
                        <button onClick={() => setSteps(steps.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-400">×</button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Macros */}
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-2">Macros (optional)</label>
                <div className="grid grid-cols-5 gap-2">
                  {(["calories", "protein", "carbs", "fat", "fiber"] as const).map((key) => (
                    <div key={key}>
                      <label className="text-xs text-slate-400 block mb-1 text-center capitalize">{key === "calories" ? "cal" : key}</label>
                      <input
                        inputMode="numeric"
                        placeholder="0"
                        value={macros[key]}
                        onChange={(e) => setMacros({ ...macros, [key]: e.target.value.replace(/\D/g, "") })}
                        className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={submitRecipe}
                disabled={submitting || !form.name.trim()}
                className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors disabled:opacity-60 mt-2"
              >
                {submitting ? "Sharing..." : "Share Recipe"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 truncate pr-4">{detail.name}</h2>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-600 text-xl shrink-0">×</button>
            </div>
            <div className="p-5 space-y-4">
              {detail.description && <p className="text-slate-500 text-sm">{detail.description}</p>}

              <div className="flex gap-4 text-xs text-slate-400">
                {detail.prep_time && <span>⏱ {detail.prep_time}</span>}
                {detail.servings && <span>🍽 {detail.servings} servings</span>}
                <span>by {detail.profiles?.display_name ?? "Anonymous"}</span>
              </div>

              {detail.macros && (
                <div className="grid grid-cols-5 gap-2">
                  {detail.macros.calories && <div className="bg-orange-50 rounded-xl p-2 text-center"><div className="font-semibold text-sm text-orange-700">{detail.macros.calories}</div><div className="text-xs text-orange-600 opacity-70">cal</div></div>}
                  {detail.macros.protein && <div className="bg-green-50 rounded-xl p-2 text-center"><div className="font-semibold text-sm text-green-700">{detail.macros.protein}g</div><div className="text-xs text-green-600 opacity-70">protein</div></div>}
                  {detail.macros.carbs && <div className="bg-blue-50 rounded-xl p-2 text-center"><div className="font-semibold text-sm text-blue-700">{detail.macros.carbs}g</div><div className="text-xs text-blue-600 opacity-70">carbs</div></div>}
                  {detail.macros.fat && <div className="bg-purple-50 rounded-xl p-2 text-center"><div className="font-semibold text-sm text-purple-700">{detail.macros.fat}g</div><div className="text-xs text-purple-600 opacity-70">fat</div></div>}
                  {detail.macros.fiber && <div className="bg-yellow-50 rounded-xl p-2 text-center"><div className="font-semibold text-sm text-yellow-700">{detail.macros.fiber}g</div><div className="text-xs text-yellow-600 opacity-70">fiber</div></div>}
                </div>
              )}

              {detail.ingredients && detail.ingredients.length > 0 && (
                <div>
                  <h3 className="font-medium text-slate-900 text-sm mb-2">Ingredients</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.ingredients.map((item) => (
                      <span key={item} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{item}</span>
                    ))}
                  </div>
                </div>
              )}

              {detail.steps && detail.steps.length > 0 && (
                <div>
                  <h3 className="font-medium text-slate-900 text-sm mb-2">Steps</h3>
                  <ol className="space-y-2">
                    {detail.steps.map((step, i) => (
                      <li key={i} className="flex gap-3 text-sm text-slate-600">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-green-100 text-green-700 font-medium text-xs flex items-center justify-center mt-0.5">{i + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Comments */}
              <div className="border-t border-slate-100 pt-4">
                <h3 className="font-medium text-slate-900 text-sm mb-3">Comments</h3>
                {commentsLoading ? (
                  <p className="text-xs text-slate-400">Loading...</p>
                ) : comments.length === 0 ? (
                  <p className="text-xs text-slate-400">No comments yet.</p>
                ) : (
                  <div className="space-y-3 mb-4">
                    {comments.map((c) => (
                      <div key={c.id}>
                        <p className="text-xs text-slate-400 mb-0.5">{c.profiles?.display_name ?? "Anonymous"}</p>
                        <p className="text-sm text-slate-700">{c.content}</p>
                      </div>
                    ))}
                  </div>
                )}

                {user ? (
                  <div className="flex gap-2 mt-3">
                    <input
                      placeholder="Add a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && postComment()}
                      className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                    <button
                      onClick={postComment}
                      disabled={!commentText.trim()}
                      className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60"
                    >
                      Post
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setDetail(null); onRequireAuth(); }}
                    className="text-sm text-green-600 font-medium hover:underline mt-2"
                  >
                    Sign in to comment
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
