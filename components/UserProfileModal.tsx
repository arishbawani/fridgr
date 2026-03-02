"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import { AvatarCircle, CommunityRecipe } from "./CommunityRecipeCard";
import RecipeDetailModal from "./RecipeDetailModal";

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

type Props = {
  userId: string;
  user: User | null;
  onClose: () => void;
  onRequireAuth: () => void;
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function UserProfileModal({ userId, user, onClose, onRequireAuth }: Props) {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [recipes, setRecipes] = useState<CommunityRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<CommunityRecipe | null>(null);
  const [followView, setFollowView] = useState<"followers" | "following" | null>(null);
  const [followList, setFollowList] = useState<FollowUser[]>([]);
  const [followListLoading, setFollowListLoading] = useState(false);
  const [viewingNestedUserId, setViewingNestedUserId] = useState<string | null>(null);

  const isOwnProfile = user?.id === userId;

  useEffect(() => {
    async function load() {
      const [profileRes, followerRes, followingRes, recipesRes] = await Promise.all([
        supabase.from("profiles").select("display_name, handle, avatar_url").eq("id", userId).single(),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", userId),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", userId),
        supabase.from("community_recipes").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      ]);

      setProfile(profileRes.data ?? null);
      setFollowerCount(followerRes.count ?? 0);
      setFollowingCount(followingRes.count ?? 0);

      if (user && !isOwnProfile) {
        const { data: followData } = await supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", user.id)
          .eq("following_id", userId)
          .maybeSingle();
        setFollowing(!!followData);
      }

      const rawRecipes = (recipesRes.data ?? []) as CommunityRecipe[];
      if (rawRecipes.length === 0) { setRecipes([]); setLoading(false); return; }

      const ids = rawRecipes.map((r) => r.id);
      const [likesRes, savesRes, likeCountsRes, commentCountsRes, ratingsRes, userRatingsRes] = await Promise.all([
        user ? supabase.from("recipe_likes").select("recipe_id").eq("user_id", user.id).in("recipe_id", ids) : Promise.resolve({ data: [] }),
        user ? supabase.from("recipe_saves").select("recipe_id").eq("user_id", user.id).in("recipe_id", ids) : Promise.resolve({ data: [] }),
        supabase.from("recipe_likes").select("recipe_id").in("recipe_id", ids),
        supabase.from("recipe_comments").select("recipe_id").in("recipe_id", ids),
        supabase.from("recipe_ratings").select("recipe_id, rating").in("recipe_id", ids),
        user ? supabase.from("recipe_ratings").select("recipe_id, rating").eq("user_id", user.id).in("recipe_id", ids) : Promise.resolve({ data: [] }),
      ]);

      const userLiked = new Set((likesRes.data ?? []).map((l: { recipe_id: string }) => l.recipe_id));
      const userSaved = new Set((savesRes.data ?? []).map((s: { recipe_id: string }) => s.recipe_id));
      const likeCounts = (likeCountsRes.data ?? []).reduce((acc: Record<string, number>, l: { recipe_id: string }) => {
        acc[l.recipe_id] = (acc[l.recipe_id] || 0) + 1; return acc;
      }, {});
      const commentCounts = (commentCountsRes.data ?? []).reduce((acc: Record<string, number>, c: { recipe_id: string }) => {
        acc[c.recipe_id] = (acc[c.recipe_id] || 0) + 1; return acc;
      }, {});
      const ratingsByRecipe = (ratingsRes.data ?? []).reduce((acc: Record<string, number[]>, r: { recipe_id: string; rating: number }) => {
        if (!acc[r.recipe_id]) acc[r.recipe_id] = [];
        acc[r.recipe_id].push(r.rating);
        return acc;
      }, {});
      const userRatingMap = Object.fromEntries(
        ((userRatingsRes.data ?? []) as Array<{ recipe_id: string; rating: number }>).map((r) => [r.recipe_id, r.rating])
      );

      setRecipes(rawRecipes.map((r) => {
        const ratings = ratingsByRecipe[r.id] ?? [];
        return {
          ...r,
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
    load();
  }, [userId]);

  async function loadFollowList(type: "followers" | "following") {
    setFollowView(type);
    setFollowListLoading(true);
    setFollowList([]);
    if (type === "followers") {
      const { data } = await supabase.from("follows").select("follower_id").eq("following_id", userId);
      const ids = (data ?? []).map((r: { follower_id: string }) => r.follower_id);
      if (ids.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", ids);
        setFollowList((profiles ?? []) as FollowUser[]);
      }
    } else {
      const { data } = await supabase.from("follows").select("following_id").eq("follower_id", userId);
      const ids = (data ?? []).map((r: { following_id: string }) => r.following_id);
      if (ids.length > 0) {
        const { data: profiles } = await supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", ids);
        setFollowList((profiles ?? []) as FollowUser[]);
      }
    }
    setFollowListLoading(false);
  }

  async function handleFollow() {
    if (!user) { onRequireAuth(); return; }
    setFollowLoading(true);
    if (following) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", userId);
      setFollowing(false);
      setFollowerCount((c) => c - 1);
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: userId });
      setFollowing(true);
      setFollowerCount((c) => c + 1);
      // Rate limit: only notify once per 24h per actor→target pair
      const notifKey = `fridgr_follow_notif_${user.id}_${userId}`;
      const lastNotified = localStorage.getItem(notifKey);
      if (!lastNotified || Date.now() - parseInt(lastNotified) > 24 * 60 * 60 * 1000) {
        const { data: actorProfile } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).single();
        const { error } = await supabase.from("notifications").insert({
          user_id: userId,
          actor_id: user.id,
          actor_name: actorProfile?.display_name || user.email?.split("@")[0] || "Someone",
          actor_avatar_url: actorProfile?.avatar_url ?? null,
          type: "follow",
        });
        if (!error) localStorage.setItem(notifKey, Date.now().toString());
        else console.error("Follow notification error:", error.message);
      }
    }
    setFollowLoading(false);
  }

  async function handleLike(id: string, liked: boolean) {
    if (!user) return;
    if (liked) {
      await supabase.from("recipe_likes").insert({ user_id: user.id, recipe_id: id });
      const recipe = [...recipes, ...(detail ? [detail] : [])].find((r) => r.id === id);
      if (recipe && recipe.user_id !== user.id) {
        const { data: actorProfile } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).single();
        const actorName = actorProfile?.display_name || user.email?.split("@")[0] || "Someone";
        const { error } = await supabase.from("notifications").insert({
          user_id: recipe.user_id,
          actor_id: user.id,
          actor_name: actorName,
          actor_avatar_url: actorProfile?.avatar_url ?? null,
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

  const displayName = profile?.display_name || "User";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[60] px-4 pb-4 sm:pb-0">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          {followView ? (
            <button
              onClick={() => setFollowView(null)}
              className="flex items-center gap-1.5 font-semibold text-slate-900 hover:text-green-600 transition-colors"
            >
              <span className="text-base">←</span>
              <span>{followView === "followers" ? "Followers" : "Following"}</span>
            </button>
          ) : (
            <h2 className="font-semibold text-slate-900 truncate pr-4">{displayName}</h2>
          )}
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl shrink-0">×</button>
        </div>

        {followView ? (
          /* Follow list view */
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
                    onClick={() => setViewingNestedUserId(fu.id)}
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
        ) : (
          /* Profile view */
          <div className="p-5">
            {/* Profile info */}
            <div className="flex items-start gap-4 mb-5">
              <AvatarCircle name={profile?.display_name ?? null} url={profile?.avatar_url ?? null} size={16} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900">{displayName}</p>
                {profile?.handle && <p className="text-sm text-slate-400">@{profile.handle}</p>}
                <div className="flex gap-4 mt-2 text-xs text-slate-500">
                  <button
                    onClick={() => loadFollowList("followers")}
                    className="hover:text-slate-900 transition-colors"
                  >
                    <strong className="text-slate-900">{followerCount}</strong> followers
                  </button>
                  <button
                    onClick={() => loadFollowList("following")}
                    className="hover:text-slate-900 transition-colors"
                  >
                    <strong className="text-slate-900">{followingCount}</strong> following
                  </button>
                </div>
              </div>
              {!isOwnProfile && (
                <button
                  onClick={handleFollow}
                  disabled={followLoading}
                  className={`text-sm font-medium px-4 py-2 rounded-xl border transition-colors shrink-0 ${
                    following
                      ? "border-slate-300 text-slate-500 hover:border-red-300 hover:text-red-400"
                      : "bg-green-600 text-white border-green-600 hover:bg-green-700"
                  }`}
                >
                  {following ? "Following" : "Follow"}
                </button>
              )}
            </div>

            {/* Their recipes */}
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-medium text-slate-500 mb-3">
                {recipes.length} {recipes.length === 1 ? "recipe" : "recipes"}
              </p>
              {loading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <div key={i} className="bg-slate-50 rounded-xl p-4 animate-pulse">
                      <div className="h-4 bg-slate-200 rounded w-2/3 mb-2" />
                      <div className="h-3 bg-slate-100 rounded w-1/3" />
                    </div>
                  ))}
                </div>
              ) : recipes.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No recipes shared yet.</p>
              ) : (
                <div className="space-y-3">
                  {recipes.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setDetail(r)}
                      className="w-full text-left bg-slate-50 hover:bg-slate-100 rounded-xl p-4 transition-colors"
                    >
                      {r.image_url && (
                        <img src={r.image_url} alt={r.name} className="w-full h-32 object-cover rounded-lg mb-2" />
                      )}
                      <p className="font-medium text-slate-900 text-sm">{r.name}</p>
                      {r.description && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{r.description}</p>}
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                        <span>♥ {r.like_count}</span>
                        <span>💬 {r.comment_count}</span>
                        <span className="ml-auto">{timeAgo(r.created_at)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {viewingNestedUserId && (
        <UserProfileModal
          userId={viewingNestedUserId}
          user={user}
          onClose={() => setViewingNestedUserId(null)}
          onRequireAuth={onRequireAuth}
        />
      )}

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
