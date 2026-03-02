"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import CommunityRecipeCard, { CommunityRecipe, AvatarCircle } from "./CommunityRecipeCard";
import UserProfileModal from "./UserProfileModal";
import RecipeDetailModal from "./RecipeDetailModal";
import ImageCropModal from "./ImageCropModal";

type Profile = {
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
};

type FollowUser = {
  id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
};

type Collection = {
  id: string;
  name: string;
  count: number;
};

type Props = {
  user: User | null;
  onRequireAuth: () => void;
  onSignOut: () => void;
  onAvatarChange?: (url: string | null) => void;
};

async function enrichRecipes(
  supabase: ReturnType<typeof createClient>,
  recipesData: CommunityRecipe[],
  userId: string | undefined
): Promise<CommunityRecipe[]> {
  if (recipesData.length === 0) return [];
  const ids = recipesData.map((r) => r.id);
  const authorIds = [...new Set(recipesData.map((r) => r.user_id))];
  const [likesRes, savesRes, likeCountsRes, commentCountsRes, profilesRes, ratingsRes, userRatingsRes] = await Promise.all([
    userId ? supabase.from("recipe_likes").select("recipe_id").eq("user_id", userId).in("recipe_id", ids) : Promise.resolve({ data: [] }),
    userId ? supabase.from("recipe_saves").select("recipe_id").eq("user_id", userId).in("recipe_id", ids) : Promise.resolve({ data: [] }),
    supabase.from("recipe_likes").select("recipe_id").in("recipe_id", ids),
    supabase.from("recipe_comments").select("recipe_id").in("recipe_id", ids),
    supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", authorIds),
    supabase.from("recipe_ratings").select("recipe_id, rating").in("recipe_id", ids),
    userId ? supabase.from("recipe_ratings").select("recipe_id, rating").eq("user_id", userId).in("recipe_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const userLiked = new Set((likesRes.data ?? []).map((l: { recipe_id: string }) => l.recipe_id));
  const userSaved = new Set((savesRes.data ?? []).map((s: { recipe_id: string }) => s.recipe_id));
  const likeCounts = (likeCountsRes.data ?? []).reduce((acc: Record<string, number>, l: { recipe_id: string }) => {
    acc[l.recipe_id] = (acc[l.recipe_id] || 0) + 1; return acc;
  }, {});
  const commentCounts = (commentCountsRes.data ?? []).reduce((acc: Record<string, number>, c: { recipe_id: string }) => {
    acc[c.recipe_id] = (acc[c.recipe_id] || 0) + 1; return acc;
  }, {});
  const profileMap = Object.fromEntries(
    ((profilesRes.data ?? []) as Array<{ id: string; display_name: string | null; handle: string | null; avatar_url: string | null }>).map((p) => [p.id, p])
  );
  const ratingsByRecipe = (ratingsRes.data ?? []).reduce((acc: Record<string, number[]>, r: { recipe_id: string; rating: number }) => {
    if (!acc[r.recipe_id]) acc[r.recipe_id] = [];
    acc[r.recipe_id].push(r.rating);
    return acc;
  }, {});
  const userRatingMap = Object.fromEntries(
    ((userRatingsRes.data ?? []) as Array<{ recipe_id: string; rating: number }>).map((r) => [r.recipe_id, r.rating])
  );
  return recipesData.map((r) => {
    const p = profileMap[r.user_id];
    const ratings = ratingsByRecipe[r.id] ?? [];
    return {
      ...r,
      author_name: p?.display_name || r.author_name,
      author_handle: p?.handle ?? null,
      author_avatar_url: p?.avatar_url || r.author_avatar_url,
      like_count: likeCounts[r.id] || 0,
      comment_count: commentCounts[r.id] || 0,
      user_liked: userLiked.has(r.id),
      user_saved: userSaved.has(r.id),
      avg_rating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
      rating_count: ratings.length,
      user_rating: userRatingMap[r.id] ?? null,
    };
  });
}

export default function ProfilePage({ user, onRequireAuth, onSignOut, onAvatarChange }: Props) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<Profile>({ display_name: null, handle: null, avatar_url: null });
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Profile>({ display_name: "", handle: "", avatar_url: null });
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);

  const [profileTab, setProfileTab] = useState<"posts" | "saved" | "collections">("posts");
  const [posts, setPosts] = useState<CommunityRecipe[]>([]);
  const [saved, setSavedRecipes] = useState<CommunityRecipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(true);
  const [detail, setDetail] = useState<CommunityRecipe | null>(null);

  // Collections state
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [collectionRecipes, setCollectionRecipes] = useState<CommunityRecipe[]>([]);
  const [collectionRecipesLoading, setCollectionRecipesLoading] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [savingCollection, setSavingCollection] = useState(false);
  const [addingToCollection, setAddingToCollection] = useState<string | null>(null);
  const [collectionMemberships, setCollectionMemberships] = useState<Set<string>>(new Set());
  const [followView, setFollowView] = useState<"followers" | "following" | null>(null);
  const [followList, setFollowList] = useState<FollowUser[]>([]);
  const [followListLoading, setFollowListLoading] = useState(false);
  const [viewingUserId, setViewingUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    loadProfile();
    loadRecipes();
    loadCollections();
  }, [user]);

  // Load memberships when opening collection picker for a recipe
  useEffect(() => {
    if (!addingToCollection || !user) return;
    supabase
      .from("collection_recipes")
      .select("collection_id")
      .eq("recipe_id", addingToCollection)
      .eq("user_id", user.id)
      .then(({ data }) => {
        setCollectionMemberships(new Set((data ?? []).map((r: { collection_id: string }) => r.collection_id)));
      });
  }, [addingToCollection]);

  async function loadProfile() {
    if (!user) return;
    const [profileRes, followerRes, followingRes] = await Promise.all([
      supabase.from("profiles").select("display_name, handle, avatar_url").eq("id", user.id).single(),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", user.id),
      supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id),
    ]);
    if (profileRes.data) {
      setProfile(profileRes.data);
      setDraft(profileRes.data);
    }
    setFollowerCount(followerRes.count ?? 0);
    setFollowingCount(followingRes.count ?? 0);
  }

  async function loadRecipes() {
    if (!user) return;
    setRecipesLoading(true);

    const [postsRes, savesRes] = await Promise.all([
      supabase.from("community_recipes").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      supabase.from("recipe_saves").select("recipe_id, community_recipes(*)").eq("user_id", user.id),
    ]);

    const postsData = (postsRes.data ?? []) as CommunityRecipe[];
    const savedRaw = (savesRes.data ?? []).map((s: { community_recipes: unknown }) => s.community_recipes).filter(Boolean) as CommunityRecipe[];

    const [enrichedPosts, enrichedSaved] = await Promise.all([
      enrichRecipes(supabase, postsData, user.id),
      enrichRecipes(supabase, savedRaw, user.id),
    ]);

    setPosts(enrichedPosts);
    setSavedRecipes(enrichedSaved);
    setRecipesLoading(false);
  }

  async function loadCollections() {
    if (!user) return;
    setCollectionsLoading(true);
    const { data: cols } = await supabase
      .from("recipe_collections")
      .select("id, name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (!cols || cols.length === 0) { setCollections([]); setCollectionsLoading(false); return; }

    const ids = cols.map((c) => c.id);
    const { data: countData } = await supabase
      .from("collection_recipes")
      .select("collection_id")
      .in("collection_id", ids);

    const counts = (countData ?? []).reduce((acc: Record<string, number>, r: { collection_id: string }) => {
      acc[r.collection_id] = (acc[r.collection_id] || 0) + 1; return acc;
    }, {});

    setCollections(cols.map((c) => ({ id: c.id, name: c.name, count: counts[c.id] || 0 })));
    setCollectionsLoading(false);
  }

  async function loadFollowList(type: "followers" | "following") {
    if (!user) return;
    setFollowView(type);
    setFollowListLoading(true);
    setFollowList([]);
    if (type === "followers") {
      const { data } = await supabase.from("follows").select("follower_id").eq("following_id", user.id);
      const ids = (data ?? []).map((r: { follower_id: string }) => r.follower_id);
      if (ids.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", ids);
        setFollowList((profiles ?? []) as FollowUser[]);
      }
    } else {
      const { data } = await supabase.from("follows").select("following_id").eq("follower_id", user.id);
      const ids = (data ?? []).map((r: { following_id: string }) => r.following_id);
      if (ids.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", ids);
        setFollowList((profiles ?? []) as FollowUser[]);
      }
    }
    setFollowListLoading(false);
  }

  async function createCollection() {
    if (!user || !newCollectionName.trim()) return;
    setSavingCollection(true);
    const { data } = await supabase
      .from("recipe_collections")
      .insert({ user_id: user.id, name: newCollectionName.trim() })
      .select("id, name")
      .single();
    if (data) setCollections((prev) => [...prev, { id: data.id, name: data.name, count: 0 }]);
    setNewCollectionName("");
    setShowNewCollection(false);
    setSavingCollection(false);
  }

  async function deleteCollection(id: string) {
    if (!window.confirm("Delete this collection?")) return;
    await supabase.from("recipe_collections").delete().eq("id", id).eq("user_id", user!.id);
    setCollections((prev) => prev.filter((c) => c.id !== id));
    if (selectedCollection?.id === id) setSelectedCollection(null);
  }

  async function openCollection(col: Collection) {
    setSelectedCollection(col);
    setCollectionRecipesLoading(true);
    const { data } = await supabase
      .from("collection_recipes")
      .select("community_recipes(*)")
      .eq("collection_id", col.id)
      .eq("user_id", user!.id);
    const rawRecipes = (data ?? []).map((r: { community_recipes: unknown }) => r.community_recipes).filter(Boolean) as CommunityRecipe[];
    const enriched = await enrichRecipes(supabase, rawRecipes, user?.id);
    setCollectionRecipes(enriched);
    setCollectionRecipesLoading(false);
  }

  async function removeFromCollection(recipeId: string) {
    if (!selectedCollection || !user) return;
    await supabase.from("collection_recipes").delete()
      .eq("collection_id", selectedCollection.id)
      .eq("recipe_id", recipeId)
      .eq("user_id", user.id);
    setCollectionRecipes((prev) => prev.filter((r) => r.id !== recipeId));
    setCollections((prev) => prev.map((c) => c.id === selectedCollection.id ? { ...c, count: Math.max(0, c.count - 1) } : c));
    setSelectedCollection((prev) => prev ? { ...prev, count: Math.max(0, prev.count - 1) } : prev);
  }

  async function toggleRecipeInCollection(collectionId: string) {
    if (!addingToCollection || !user) return;
    if (collectionMemberships.has(collectionId)) {
      await supabase.from("collection_recipes").delete()
        .eq("collection_id", collectionId)
        .eq("recipe_id", addingToCollection)
        .eq("user_id", user.id);
      setCollectionMemberships((prev) => { const next = new Set(prev); next.delete(collectionId); return next; });
      setCollections((prev) => prev.map((c) => c.id === collectionId ? { ...c, count: Math.max(0, c.count - 1) } : c));
    } else {
      await supabase.from("collection_recipes").insert({ collection_id: collectionId, recipe_id: addingToCollection, user_id: user.id });
      setCollectionMemberships((prev) => new Set([...prev, collectionId]));
      setCollections((prev) => prev.map((c) => c.id === collectionId ? { ...c, count: c.count + 1 } : c));
    }
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = () => setCropImageSrc(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function handleCropApply(blob: Blob) {
    if (!user) return;
    setCropImageSrc(null);
    setAvatarUploading(true);
    const path = `${user.id}/avatar`;
    await supabase.storage.from("avatars").upload(path, blob, { upsert: true, contentType: "image/jpeg" });
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
    setProfile((p) => ({ ...p, avatar_url: avatarUrl }));
    setDraft((d) => ({ ...d, avatar_url: avatarUrl }));
    onAvatarChange?.(avatarUrl);
    setAvatarUploading(false);
  }

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
    setSaveError("");
    const handle = draft.handle?.replace(/^@/, "").trim() || null;
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: draft.display_name?.trim() || null, handle })
      .eq("id", user.id);
    if (error) {
      setSaveError(error.message.includes("unique") ? "That handle is already taken." : error.message);
      setSaving(false);
      return;
    }
    setProfile({ ...draft, handle });
    setEditing(false);
    setSaving(false);
  }

  function handleRecipeRated(id: string, avgRating: number | null, ratingCount: number) {
    const patch = (list: CommunityRecipe[]) => list.map((r) => r.id === id ? { ...r, avg_rating: avgRating, rating_count: ratingCount } : r);
    setPosts(patch);
    setSavedRecipes(patch);
    setCollectionRecipes(patch);
    if (detail?.id === id) setDetail((d) => d ? { ...d, avg_rating: avgRating, rating_count: ratingCount } : d);
  }

  async function handleLike(id: string, liked: boolean) {
    if (!user) return;
    if (liked) {
      await supabase.from("recipe_likes").insert({ user_id: user.id, recipe_id: id });
      const recipe = [...posts, ...saved, ...collectionRecipes].find((r) => r.id === id);
      if (recipe && recipe.user_id !== user.id) {
        const actorName = profile.display_name || user.email?.split("@")[0] || "Someone";
        const { error } = await supabase.from("notifications").insert({
          user_id: recipe.user_id,
          actor_id: user.id,
          actor_name: actorName,
          actor_avatar_url: profile.avatar_url,
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

  async function handleSave(id: string, isSaved: boolean) {
    if (!user) return;
    if (isSaved) {
      await supabase.from("recipe_saves").insert({ user_id: user.id, recipe_id: id });
    } else {
      await supabase.from("recipe_saves").delete().eq("user_id", user.id).eq("recipe_id", id);
      setSavedRecipes((prev) => prev.filter((r) => r.id !== id));
    }
  }

  const displayName = profile.display_name || user?.email?.split("@")[0] || "You";
  const initials = displayName.slice(0, 2).toUpperCase();

  if (!user) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center shadow-sm">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-2xl mx-auto mb-4">👤</div>
        <p className="text-slate-700 font-medium mb-1">You&apos;re not signed in</p>
        <p className="text-slate-400 text-sm mb-5">Sign in to view your profile, saved recipes, and more.</p>
        <button
          onClick={onRequireAuth}
          className="bg-green-600 text-white px-6 py-2.5 rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors"
        >
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Profile card */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-start gap-4 mb-4">
          {/* Avatar */}
          <div className="relative shrink-0">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 rounded-full overflow-hidden bg-green-100 flex items-center justify-center text-green-700 font-bold text-xl hover:opacity-80 transition-opacity"
              title="Change photo"
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </button>
            {avatarUploading && (
              <div className="absolute inset-0 rounded-full bg-white/70 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-2">
                <input
                  value={draft.display_name ?? ""}
                  onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
                  placeholder="Display name"
                  className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <div className="flex items-center gap-1">
                  <span className="text-slate-400 text-sm">@</span>
                  <input
                    value={(draft.handle ?? "").replace(/^@/, "")}
                    onChange={(e) => setDraft({ ...draft, handle: e.target.value.replace(/[^a-z0-9_]/gi, "").toLowerCase() })}
                    placeholder="handle"
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
                {saveError && <p className="text-red-500 text-xs">{saveError}</p>}
              </div>
            ) : (
              <>
                <p className="font-semibold text-slate-900 truncate">{displayName}</p>
                {profile.handle && <p className="text-sm text-slate-400">@{profile.handle}</p>}
                <div className="flex gap-4 mt-2 text-xs text-slate-500">
                  <button onClick={() => loadFollowList("followers")} className="hover:text-slate-900 transition-colors">
                    <strong className="text-slate-900">{followerCount}</strong> followers
                  </button>
                  <button onClick={() => loadFollowList("following")} className="hover:text-slate-900 transition-colors">
                    <strong className="text-slate-900">{followingCount}</strong> following
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={saveProfile}
                disabled={saving}
                className="flex-1 bg-green-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => { setEditing(false); setDraft(profile); setSaveError(""); }}
                className="flex-1 border border-slate-200 text-slate-600 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="flex-1 border border-slate-200 text-slate-700 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Edit Profile
              </button>
              <button
                onClick={onSignOut}
                className="border border-slate-200 text-slate-400 px-4 py-2 rounded-xl text-sm hover:text-red-400 hover:border-red-200 transition-colors"
              >
                Sign out
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2 text-center">Tap your photo to change it</p>
      </section>

      {/* Posts / Saved / Collections tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        {(["posts", "saved", "collections"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setProfileTab(tab)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${profileTab === tab ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
          >
            {tab === "posts" ? "Posts" : tab === "saved" ? "Saved" : "Collections"}
          </button>
        ))}
      </div>

      {/* Recipe cards */}
      {recipesLoading && profileTab !== "collections" ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-slate-100 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {profileTab === "posts" && (
            posts.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <p className="text-slate-400 text-sm">You haven&apos;t shared any recipes yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {posts.map((r) => (
                  <CommunityRecipeCard
                    key={r.id}
                    recipe={r}
                    onLike={handleLike}
                    onSave={handleSave}
                    onOpen={setDetail}
                    requireAuth={() => true}
                  />
                ))}
              </div>
            )
          )}

          {profileTab === "saved" && (
            saved.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <p className="text-slate-400 text-sm">No saved recipes yet. Tap ★ on any community recipe to save it.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {saved.map((r) => (
                  <div key={r.id} className="relative">
                    <CommunityRecipeCard
                      recipe={r}
                      onLike={handleLike}
                      onSave={handleSave}
                      onOpen={setDetail}
                      requireAuth={() => true}
                    />
                    <button
                      onClick={() => setAddingToCollection(r.id)}
                      className="absolute top-3 right-3 w-7 h-7 bg-white/90 border border-slate-200 rounded-full text-sm flex items-center justify-center hover:bg-slate-50 shadow-sm transition-colors"
                      title="Add to collection"
                    >
                      📁
                    </button>
                  </div>
                ))}
              </div>
            )
          )}

          {profileTab === "collections" && (
            <div className="space-y-3">
              {/* New collection form */}
              {showNewCollection ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex gap-2 shadow-sm">
                  <input
                    autoFocus
                    placeholder="Collection name"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && createCollection()}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    onClick={createCollection}
                    disabled={savingCollection || !newCollectionName.trim()}
                    className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60"
                  >
                    {savingCollection ? "..." : "Create"}
                  </button>
                  <button
                    onClick={() => { setShowNewCollection(false); setNewCollectionName(""); }}
                    className="text-slate-400 hover:text-slate-600 px-2 transition-colors text-lg"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewCollection(true)}
                  className="w-full bg-white border border-dashed border-slate-300 rounded-2xl p-4 text-sm text-slate-500 hover:border-green-400 hover:text-green-600 transition-colors shadow-sm"
                >
                  + New Collection
                </button>
              )}

              {collectionsLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
                      <div className="h-4 bg-slate-200 rounded w-1/2 mb-1" />
                      <div className="h-3 bg-slate-100 rounded w-1/4" />
                    </div>
                  ))}
                </div>
              ) : collections.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                  <p className="text-slate-400 text-sm">No collections yet. Create one to organize your saved recipes.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {collections.map((col) => (
                    <div
                      key={col.id}
                      className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                    >
                      <button
                        onClick={() => openCollection(col)}
                        className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
                      >
                        <span className="text-2xl">📁</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 truncate">{col.name}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{col.count} {col.count === 1 ? "recipe" : "recipes"}</p>
                        </div>
                        <span className="text-slate-400 text-sm">→</span>
                      </button>
                      <button
                        onClick={() => deleteCollection(col.id)}
                        className="w-full border-t border-slate-100 py-2 text-xs text-slate-400 hover:text-red-400 transition-colors"
                      >
                        Delete collection
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
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
          onRate={handleRecipeRated}
        />
      )}

      {/* Collection detail modal */}
      {selectedCollection && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">{selectedCollection.name}</h2>
                <p className="text-xs text-slate-400 mt-0.5">{selectedCollection.count} {selectedCollection.count === 1 ? "recipe" : "recipes"}</p>
              </div>
              <button onClick={() => setSelectedCollection(null)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <div className="p-4 space-y-3">
              {collectionRecipesLoading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-slate-50 rounded-xl p-4 animate-pulse">
                      <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
                      <div className="h-3 bg-slate-100 rounded w-1/3" />
                    </div>
                  ))}
                </div>
              ) : collectionRecipes.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No recipes in this collection yet.</p>
              ) : (
                collectionRecipes.map((r) => (
                  <div key={r.id} className="bg-slate-50 rounded-xl overflow-hidden">
                    <button
                      onClick={() => setDetail(r)}
                      className="w-full text-left p-4 hover:bg-slate-100 transition-colors"
                    >
                      {r.image_url && (
                        <img src={r.image_url} alt={r.name} className="w-full h-28 object-cover rounded-lg mb-2" />
                      )}
                      <p className="font-medium text-slate-900 text-sm">{r.name}</p>
                      {r.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{r.description}</p>}
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                        <span>♥ {r.like_count}</span>
                        <span>💬 {r.comment_count}</span>
                      </div>
                    </button>
                    <button
                      onClick={() => removeFromCollection(r.id)}
                      className="w-full border-t border-slate-200 py-2 text-xs text-slate-400 hover:text-red-400 transition-colors"
                    >
                      Remove from collection
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add to collection picker */}
      {addingToCollection && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end" onClick={() => setAddingToCollection(null)}>
          <div className="bg-white w-full rounded-t-2xl px-5 pt-5 pb-10 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Add to collection</h3>
              <button onClick={() => setAddingToCollection(null)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            {collections.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">No collections yet. Go to Collections tab to create one.</p>
            ) : (
              <div className="space-y-1">
                {collections.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => toggleRecipeInCollection(col.id)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">📁</span>
                      <div className="text-left">
                        <p className="text-sm text-slate-700 font-medium">{col.name}</p>
                        <p className="text-xs text-slate-400">{col.count} recipes</p>
                      </div>
                    </div>
                    {collectionMemberships.has(col.id) && (
                      <span className="text-green-600 font-bold text-sm">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Crop modal */}
      {cropImageSrc && (
        <ImageCropModal
          imageSrc={cropImageSrc}
          onApply={handleCropApply}
          onCancel={() => setCropImageSrc(null)}
        />
      )}

      {/* Follow list modal */}
      {followView && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">{followView === "followers" ? "Followers" : "Following"}</h2>
              <button onClick={() => setFollowView(null)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <div className="p-4">
              {followListLoading ? (
                <div className="space-y-1">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex gap-3 animate-pulse p-3">
                      <div className="w-9 h-9 rounded-full bg-slate-200 shrink-0" />
                      <div className="flex-1 space-y-1.5 pt-1">
                        <div className="h-3 bg-slate-200 rounded w-2/3" />
                        <div className="h-3 bg-slate-100 rounded w-1/3" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : followList.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-8">
                  {followView === "followers" ? "No followers yet." : "Not following anyone yet."}
                </p>
              ) : (
                <div className="space-y-1">
                  {followList.map((fu) => (
                    <button
                      key={fu.id}
                      onClick={() => { setFollowView(null); setViewingUserId(fu.id); }}
                      className="flex items-center gap-3 w-full p-3 hover:bg-slate-50 rounded-xl transition-colors text-left"
                    >
                      <AvatarCircle name={fu.display_name} url={fu.avatar_url} size={9} />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{fu.display_name ?? "User"}</p>
                        {fu.handle && <p className="text-xs text-slate-400">@{fu.handle}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View another user's profile */}
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
