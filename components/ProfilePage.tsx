"use client";
import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import CommunityRecipeCard, { CommunityRecipe } from "./CommunityRecipeCard";
import RecipeDetailModal from "./RecipeDetailModal";

type Profile = {
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
};

type Props = {
  user: User | null;
  onRequireAuth: () => void;
  onSignOut: () => void;
};

async function enrichRecipes(
  supabase: ReturnType<typeof createClient>,
  recipesData: CommunityRecipe[],
  userId: string | undefined
): Promise<CommunityRecipe[]> {
  if (recipesData.length === 0) return [];
  const ids = recipesData.map((r) => r.id);
  const [likesRes, savesRes, likeCountsRes, commentCountsRes] = await Promise.all([
    userId ? supabase.from("recipe_likes").select("recipe_id").eq("user_id", userId).in("recipe_id", ids) : Promise.resolve({ data: [] }),
    userId ? supabase.from("recipe_saves").select("recipe_id").eq("user_id", userId).in("recipe_id", ids) : Promise.resolve({ data: [] }),
    supabase.from("recipe_likes").select("recipe_id").in("recipe_id", ids),
    supabase.from("recipe_comments").select("recipe_id").in("recipe_id", ids),
  ]);
  const userLiked = new Set((likesRes.data ?? []).map((l: { recipe_id: string }) => l.recipe_id));
  const userSaved = new Set((savesRes.data ?? []).map((s: { recipe_id: string }) => s.recipe_id));
  const likeCounts = (likeCountsRes.data ?? []).reduce((acc: Record<string, number>, l: { recipe_id: string }) => {
    acc[l.recipe_id] = (acc[l.recipe_id] || 0) + 1; return acc;
  }, {});
  const commentCounts = (commentCountsRes.data ?? []).reduce((acc: Record<string, number>, c: { recipe_id: string }) => {
    acc[c.recipe_id] = (acc[c.recipe_id] || 0) + 1; return acc;
  }, {});
  return recipesData.map((r) => ({
    ...r,
    like_count: likeCounts[r.id] || 0,
    comment_count: commentCounts[r.id] || 0,
    user_liked: userLiked.has(r.id),
    user_saved: userSaved.has(r.id),
  }));
}

export default function ProfilePage({ user, onRequireAuth, onSignOut }: Props) {
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

  const [profileTab, setProfileTab] = useState<"posts" | "saved">("posts");
  const [posts, setPosts] = useState<CommunityRecipe[]>([]);
  const [saved, setSavedRecipes] = useState<CommunityRecipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(true);
  const [detail, setDetail] = useState<CommunityRecipe | null>(null);

  useEffect(() => {
    if (!user) return;
    loadProfile();
    loadRecipes();
  }, [user]);

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

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setAvatarUploading(true);
    const path = `${user.id}/avatar`;
    await supabase.storage.from("avatars").upload(path, file, { upsert: true });
    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
    const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;
    await supabase.from("profiles").update({ avatar_url: avatarUrl }).eq("id", user.id);
    setProfile((p) => ({ ...p, avatar_url: avatarUrl }));
    setDraft((d) => ({ ...d, avatar_url: avatarUrl }));
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

  async function handleLike(id: string, liked: boolean) {
    if (!user) return;
    if (liked) {
      await supabase.from("recipe_likes").insert({ user_id: user.id, recipe_id: id });
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
                  <span><strong className="text-slate-900">{followerCount}</strong> followers</span>
                  <span><strong className="text-slate-900">{followingCount}</strong> following</span>
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

      {/* Posts / Saved tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
        <button
          onClick={() => setProfileTab("posts")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${profileTab === "posts" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          Posts
        </button>
        <button
          onClick={() => setProfileTab("saved")}
          className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${profileTab === "saved" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          Saved
        </button>
      </div>

      {/* Recipe cards */}
      {recipesLoading ? (
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
        />
      )}
    </div>
  );
}
