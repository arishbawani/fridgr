"use client";
import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { createClient } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import CommunityRecipeCard, { CommunityRecipe } from "./CommunityRecipeCard";
import RecipeDetailModal from "./RecipeDetailModal";
import UserProfileModal from "./UserProfileModal";

const ADMIN_ID = "a1c54fac-7593-40cf-901b-b5756c3f68e8";

type AIRecipe = {
  name: string;
  description: string;
  prepTime: string;
  servings: number;
  macros: { calories: number; protein: number; carbs: number; fat: number; fiber: number };
  have: string[];
  need: string[];
  steps: string[];
};

async function compressImage(file: File, maxWidth = 1200): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85);
    };
    img.src = url;
  });
}

export default function CommunityFeed({
  user,
  onRequireAuth,
  initialRecipe,
  onShareConsumed,
}: {
  user: User | null;
  onRequireAuth: () => void;
  initialRecipe?: AIRecipe | null;
  onShareConsumed?: () => void;
}) {
  const supabase = createClient();
  const imageFileRef = useRef<HTMLInputElement>(null);

  const [recipes, setRecipes] = useState<CommunityRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [detail, setDetail] = useState<CommunityRecipe | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  // Create/edit form state
  const [form, setForm] = useState({ name: "", description: "", prep_time: "", servings: "" });
  const [ingredientInput, setIngredientInput] = useState("");
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [stepInput, setStepInput] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [macros, setMacros] = useState({ calories: "", protein: "", carbs: "", fat: "", fiber: "" });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRecipes();
    if (user) {
      supabase.from("profiles").select("avatar_url, display_name").eq("id", user.id).single()
        .then(({ data }) => { setUserAvatarUrl(data?.avatar_url ?? null); setUserDisplayName(data?.display_name ?? null); });
    } else {
      setUserAvatarUrl(null);
    }
  }, [user]);

  // Pre-fill form when sharing an AI-generated recipe
  useEffect(() => {
    if (!initialRecipe) return;
    setForm({
      name: initialRecipe.name,
      description: initialRecipe.description,
      prep_time: initialRecipe.prepTime,
      servings: initialRecipe.servings.toString(),
    });
    setIngredients([...initialRecipe.have, ...initialRecipe.need]);
    setSteps(initialRecipe.steps);
    setMacros({
      calories: initialRecipe.macros.calories.toString(),
      protein: initialRecipe.macros.protein.toString(),
      carbs: initialRecipe.macros.carbs.toString(),
      fat: initialRecipe.macros.fat.toString(),
      fiber: initialRecipe.macros.fiber.toString(),
    });
    setImageUrl(null);
    setEditingId(null);
    setShowCreate(true);
    onShareConsumed?.();
  }, [initialRecipe]);

  async function fetchRecipes() {
    setLoading(true);
    const { data: recipesData, error: fetchError } = await supabase
      .from("community_recipes")
      .select("*")
      .order("created_at", { ascending: false });

    if (fetchError) { console.error("fetchRecipes error:", fetchError.message); }
    if (!recipesData || recipesData.length === 0) { setRecipes([]); setLoading(false); return; }

    const ids = recipesData.map((r) => r.id);
    const userIds = [...new Set(recipesData.map((r) => r.user_id))];
    const [likesRes, savesRes, likeCountsRes, commentCountsRes, allRatingsRes, userRatingsRes, profilesRes] = await Promise.all([
      user ? supabase.from("recipe_likes").select("recipe_id").eq("user_id", user.id).in("recipe_id", ids) : Promise.resolve({ data: [] }),
      user ? supabase.from("recipe_saves").select("recipe_id").eq("user_id", user.id).in("recipe_id", ids) : Promise.resolve({ data: [] }),
      supabase.from("recipe_likes").select("recipe_id").in("recipe_id", ids),
      supabase.from("recipe_comments").select("recipe_id").in("recipe_id", ids),
      supabase.from("recipe_ratings").select("recipe_id, rating").in("recipe_id", ids),
      user ? supabase.from("recipe_ratings").select("recipe_id, rating").eq("user_id", user.id).in("recipe_id", ids) : Promise.resolve({ data: [] }),
      supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", userIds),
    ]);

    const profileMap = Object.fromEntries(
      ((profilesRes as { data: Array<{ id: string; display_name: string | null; handle: string | null; avatar_url: string | null }> | null }).data ?? []).map((p) => [p.id, p])
    );

    const userLiked = new Set((likesRes.data ?? []).map((l: { recipe_id: string }) => l.recipe_id));
    const userSaved = new Set((savesRes.data ?? []).map((s: { recipe_id: string }) => s.recipe_id));
    const likeCounts = (likeCountsRes.data ?? []).reduce((acc: Record<string, number>, l: { recipe_id: string }) => {
      acc[l.recipe_id] = (acc[l.recipe_id] || 0) + 1; return acc;
    }, {});
    const commentCounts = (commentCountsRes.data ?? []).reduce((acc: Record<string, number>, c: { recipe_id: string }) => {
      acc[c.recipe_id] = (acc[c.recipe_id] || 0) + 1; return acc;
    }, {});
    const ratingsByRecipe: Record<string, number[]> = {};
    for (const r of (allRatingsRes.data ?? []) as { recipe_id: string; rating: number }[]) {
      if (!ratingsByRecipe[r.recipe_id]) ratingsByRecipe[r.recipe_id] = [];
      ratingsByRecipe[r.recipe_id].push(r.rating);
    }
    const userRatingMap: Record<string, number> = {};
    for (const r of (userRatingsRes.data ?? []) as { recipe_id: string; rating: number }[]) {
      userRatingMap[r.recipe_id] = r.rating;
    }

    setRecipes(recipesData.map((r) => {
      const ratings = ratingsByRecipe[r.id] ?? [];
      const profile = profileMap[r.user_id];
      return {
        ...r,
        author_name: profile?.display_name || r.author_name,
        author_handle: profile?.handle ?? null,
        author_avatar_url: profile?.avatar_url || r.author_avatar_url,
        like_count: likeCounts[r.id] || 0,
        comment_count: commentCounts[r.id] || 0,
        user_liked: userLiked.has(r.id),
        user_saved: userSaved.has(r.id),
        avg_rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
        rating_count: ratings.length,
        user_rating: userRatingMap[r.id] ?? null,
      };
    }));
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
      const recipe = recipes.find((r) => r.id === id);
      if (recipe && recipe.user_id !== user.id) {
        const actorName = userDisplayName || user.email?.split("@")[0] || "Someone";
        const { error } = await supabase.from("notifications").insert({
          user_id: recipe.user_id,
          actor_id: user.id,
          actor_name: actorName,
          actor_avatar_url: userAvatarUrl,
          type: "like",
          recipe_id: id,
          recipe_name: recipe.name,
        });
        if (error) console.error("Like notification error:", error.message);
      }
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

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this recipe?")) return;
    const isAdmin = user?.id === ADMIN_ID;
    const query = supabase.from("community_recipes").delete().eq("id", id);
    await (isAdmin ? query : query.eq("user_id", user!.id));
    setDetail(null);
    fetchRecipes();
  }

  function startEdit(recipe: CommunityRecipe) {
    setDetail(null);
    setEditingId(recipe.id);
    setForm({
      name: recipe.name,
      description: recipe.description ?? "",
      prep_time: recipe.prep_time ?? "",
      servings: recipe.servings?.toString() ?? "",
    });
    setIngredients(recipe.ingredients ?? []);
    setSteps(recipe.steps ?? []);
    setMacros({
      calories: recipe.macros?.calories?.toString() ?? "",
      protein: recipe.macros?.protein?.toString() ?? "",
      carbs: recipe.macros?.carbs?.toString() ?? "",
      fat: recipe.macros?.fat?.toString() ?? "",
      fiber: recipe.macros?.fiber?.toString() ?? "",
    });
    setImageUrl(recipe.image_url ?? null);
    setShowCreate(true);
  }

  function closeForm() {
    setShowCreate(false);
    setEditingId(null);
    setForm({ name: "", description: "", prep_time: "", servings: "" });
    setIngredients([]); setSteps([]);
    setMacros({ calories: "", protein: "", carbs: "", fat: "", fiber: "" });
    setImageUrl(null);
    setSubmitError("");
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    e.target.value = "";
    setImageUploading(true);
    const blob = await compressImage(file);
    const path = `${user.id}/${Date.now()}`;
    await supabase.storage.from("recipe-photos").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    const { data: urlData } = supabase.storage.from("recipe-photos").getPublicUrl(path);
    setImageUrl(urlData.publicUrl);
    setImageUploading(false);
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
    setSubmitError("");

    const payload = {
      user_id: user.id,
      author_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
      author_avatar_url: userAvatarUrl,
      name: form.name.trim(),
      description: form.description.trim() || null,
      prep_time: form.prep_time.trim() || null,
      servings: form.servings ? Number(form.servings) : null,
      ingredients: ingredients.length > 0 ? ingredients : null,
      steps: steps.length > 0 ? steps : null,
      image_url: imageUrl,
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

    const { error } = editingId
      ? await supabase.from("community_recipes").update(payload).eq("id", editingId).eq("user_id", user.id)
      : await supabase.from("community_recipes").insert(payload);

    if (error) { setSubmitError(error.message); setSubmitting(false); return; }
    closeForm();
    fetchRecipes();
  }

  const filtered = searchQuery
    ? recipes.filter((r) =>
        r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.ingredients?.some((i) => i.includes(searchQuery.toLowerCase()))
      )
    : recipes;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Community Recipes</h2>
        <button
          onClick={() => { if (!requireAuth()) return; setShowCreate(true); }}
          className="bg-green-600 text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-green-700 transition-colors"
        >
          + Share Recipe
        </button>
      </div>

      {/* Search */}
      <input
        placeholder="Search recipes, ingredients..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
      />

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
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <p className="text-slate-400 text-sm">
            {searchQuery ? `No recipes match "${searchQuery}".` : "No recipes yet. Be the first to share one!"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((r) => (
            <CommunityRecipeCard
              key={r.id}
              recipe={r}
              onLike={handleLike}
              onSave={handleSave}
              onOpen={setDetail}
              requireAuth={requireAuth}
              onAuthorClick={setViewingUserId}
            />
          ))}
        </div>
      )}

      {/* Create / Edit modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">{editingId ? "Edit Recipe" : "Share a Recipe"}</h2>
              <button onClick={closeForm} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              <input
                placeholder="Recipe name *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <input
                placeholder="Short description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
              />

              {/* Photo upload */}
              <div>
                <label className="text-xs font-medium text-slate-500 block mb-2">Photo (optional)</label>
                {imageUrl ? (
                  <div className="relative">
                    <img src={imageUrl} alt="preview" className="w-full h-40 object-cover rounded-xl" />
                    <button
                      onClick={() => setImageUrl(null)}
                      className="absolute top-2 right-2 bg-black/50 text-white w-6 h-6 rounded-full text-sm flex items-center justify-center hover:bg-black/70"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => imageFileRef.current?.click()}
                    disabled={imageUploading}
                    className="w-full border-2 border-dashed border-slate-200 rounded-xl py-6 text-sm text-slate-400 hover:border-green-400 hover:text-green-500 transition-colors disabled:opacity-60"
                  >
                    {imageUploading ? "Uploading..." : "+ Add Photo"}
                  </button>
                )}
                <input ref={imageFileRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <input
                  placeholder="Prep time (e.g. 20 min)"
                  value={form.prep_time}
                  onChange={(e) => setForm({ ...form, prep_time: e.target.value })}
                  className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <input
                  placeholder="Servings"
                  inputMode="numeric"
                  value={form.servings}
                  onChange={(e) => setForm({ ...form, servings: e.target.value.replace(/\D/g, "") })}
                  className="border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
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
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
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
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
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
                        className="w-full border border-slate-200 rounded-lg px-2 py-2 text-sm text-slate-900 placeholder-slate-400 text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {submitError && <p className="text-red-500 text-sm">{submitError}</p>}
              <button
                onClick={submitRecipe}
                disabled={submitting || !form.name.trim() || imageUploading}
                className="w-full bg-green-600 text-white py-3 rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors disabled:opacity-60 mt-2"
              >
                {submitting ? (editingId ? "Saving..." : "Sharing...") : (editingId ? "Save Changes" : "Share Recipe")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <RecipeDetailModal
          recipe={detail}
          user={user}
          onClose={() => setDetail(null)}
          onLike={handleLike}
          onSave={handleSave}
          onRequireAuth={onRequireAuth}
          userAvatarUrl={userAvatarUrl}
          onEdit={startEdit}
          onDelete={handleDelete}
          onAuthorClick={setViewingUserId}
        />
      )}

      {/* User profile modal */}
      {viewingUserId && (
        <UserProfileModal
          userId={viewingUserId}
          user={user}
          onClose={() => setViewingUserId(null)}
          onRequireAuth={onRequireAuth}
        />
      )}
    </div>
  );
}
