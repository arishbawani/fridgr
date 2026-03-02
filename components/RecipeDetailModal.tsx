"use client";
import { useState, useEffect, KeyboardEvent } from "react";
import { createClient } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import { CommunityRecipe, AvatarCircle } from "./CommunityRecipeCard";

const ADMIN_ID = "a1c54fac-7593-40cf-901b-b5756c3f68e8";

type Comment = {
  id: string;
  content: string;
  created_at: string;
  author_name: string | null;
  author_avatar_url: string | null;
  like_count: number;
  user_liked: boolean;
};

type Props = {
  recipe: CommunityRecipe;
  user: User | null;
  onClose: () => void;
  onLike: (id: string, liked: boolean) => void;
  onSave: (id: string, saved: boolean) => void;
  onRequireAuth: () => void;
  userAvatarUrl?: string | null;
  onEdit?: (recipe: CommunityRecipe) => void;
  onDelete?: (id: string) => void;
  onAuthorClick?: (userId: string) => void;
};

export default function RecipeDetailModal({
  recipe,
  user,
  onClose,
  onLike,
  onSave,
  onRequireAuth,
  userAvatarUrl,
  onEdit,
  onDelete,
  onAuthorClick,
}: Props) {
  const supabase = createClient();
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [commentText, setCommentText] = useState("");
  const [liked, setLiked] = useState(recipe.user_liked);
  const [likeCount, setLikeCount] = useState(recipe.like_count);
  const [saved, setSaved] = useState(recipe.user_saved);
  const [following, setFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [userRating, setUserRating] = useState<number | null>(recipe.user_rating ?? null);
  const [hoverRating, setHoverRating] = useState(0);
  const [avgRating, setAvgRating] = useState<number | null>(recipe.avg_rating ?? null);
  const [ratingCount, setRatingCount] = useState(recipe.rating_count ?? 0);

  const isOwnRecipe = user?.id === recipe.user_id;
  const isAdmin = user?.id === ADMIN_ID;
  const canFollow = !!user && !isOwnRecipe;

  useEffect(() => {
    async function load() {
      setCommentsLoading(true);
      const { data: rawComments } = await supabase
        .from("recipe_comments")
        .select("*")
        .eq("recipe_id", recipe.id)
        .order("created_at", { ascending: true });
      const raw = rawComments ?? [];
      if (raw.length === 0) {
        setComments([]);
        setCommentsLoading(false);
      } else {
        const ids = raw.map((c) => c.id);
        const [likeCountsRes, userLikesRes] = await Promise.all([
          supabase.from("comment_likes").select("comment_id").in("comment_id", ids),
          user ? supabase.from("comment_likes").select("comment_id").eq("user_id", user.id).in("comment_id", ids) : Promise.resolve({ data: [] }),
        ]);
        const likeCounts = (likeCountsRes.data ?? []).reduce((acc: Record<string, number>, l: { comment_id: string }) => {
          acc[l.comment_id] = (acc[l.comment_id] || 0) + 1; return acc;
        }, {});
        const userLikedSet = new Set((userLikesRes.data ?? []).map((l: { comment_id: string }) => l.comment_id));
        setComments(raw.map((c) => ({
          ...c,
          like_count: likeCounts[c.id] || 0,
          user_liked: userLikedSet.has(c.id),
        })));
        setCommentsLoading(false);
      }

      if (canFollow) {
        const { data: followData } = await supabase
          .from("follows")
          .select("follower_id")
          .eq("follower_id", user!.id)
          .eq("following_id", recipe.user_id)
          .maybeSingle();
        setFollowing(!!followData);
      }
    }
    load();
  }, [recipe.id]);

  async function postComment() {
    if (!user || !commentText.trim()) return;
    const content = commentText.trim();
    setCommentText("");
    const authorName = user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
    const { data } = await supabase
      .from("recipe_comments")
      .insert({ user_id: user.id, recipe_id: recipe.id, content, author_name: authorName, author_avatar_url: userAvatarUrl ?? null })
      .select("*")
      .single();
    if (data) setComments((prev) => [...prev, data]);

    // Notify recipe owner (not yourself)
    if (recipe.user_id !== user.id) {
      supabase.from("notifications").insert({
        user_id: recipe.user_id,
        actor_id: user.id,
        actor_name: authorName,
        actor_avatar_url: userAvatarUrl ?? null,
        type: "comment",
        recipe_id: recipe.id,
        recipe_name: recipe.name,
        comment_preview: content.slice(0, 80),
      });
    }
  }

  function handleLike() {
    if (!user) { onRequireAuth(); return; }
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    onLike(recipe.id, next);
  }

  function handleSave() {
    if (!user) { onRequireAuth(); return; }
    const next = !saved;
    setSaved(next);
    onSave(recipe.id, next);
  }

  async function handleFollow() {
    if (!user) { onRequireAuth(); return; }
    setFollowLoading(true);
    if (following) {
      await supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", recipe.user_id);
      setFollowing(false);
    } else {
      await supabase.from("follows").insert({ follower_id: user.id, following_id: recipe.user_id });
      setFollowing(true);
      // Rate limit: only notify once per 24h per actor→target pair
      const notifKey = `fridgr_follow_notif_${user.id}_${recipe.user_id}`;
      const lastNotified = localStorage.getItem(notifKey);
      if (!lastNotified || Date.now() - parseInt(lastNotified) > 24 * 60 * 60 * 1000) {
        const { data: actorProfile } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).single();
        const { error } = await supabase.from("notifications").insert({
          user_id: recipe.user_id,
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

  async function handleCommentLike(commentId: string) {
    if (!user) { onRequireAuth(); return; }
    const comment = comments.find((c) => c.id === commentId);
    if (!comment) return;
    const next = !comment.user_liked;
    setComments((prev) => prev.map((c) =>
      c.id === commentId ? { ...c, user_liked: next, like_count: c.like_count + (next ? 1 : -1) } : c
    ));
    if (next) {
      await supabase.from("comment_likes").insert({ user_id: user.id, comment_id: commentId });
    } else {
      await supabase.from("comment_likes").delete().eq("user_id", user.id).eq("comment_id", commentId);
    }
  }

  async function handleRate(stars: number) {
    if (!user) { onRequireAuth(); return; }
    const prev = userRating;
    setUserRating(stars);
    // Optimistic avg update
    if (prev === null) {
      const newCount = ratingCount + 1;
      setAvgRating(((avgRating ?? 0) * ratingCount + stars) / newCount);
      setRatingCount(newCount);
    } else {
      setAvgRating(((avgRating ?? 0) * ratingCount - prev + stars) / ratingCount);
    }
    await supabase.from("recipe_ratings").upsert(
      { user_id: user.id, recipe_id: recipe.id, rating: stars },
      { onConflict: "user_id,recipe_id" }
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900 truncate pr-4">{recipe.name}</h2>
          <div className="flex items-center gap-2 shrink-0">
            {isOwnRecipe && onEdit && (
              <button onClick={() => onEdit(recipe)} className="text-xs text-slate-400 hover:text-green-600 transition-colors font-medium">Edit</button>
            )}
            {(isOwnRecipe || isAdmin) && onDelete && (
              <button onClick={() => onDelete(recipe.id)} className="text-xs text-slate-400 hover:text-red-500 transition-colors font-medium">Delete</button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl ml-1">×</button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {recipe.image_url && (
            <img src={recipe.image_url} alt={recipe.name} className="w-full h-52 object-cover rounded-xl" />
          )}

          {recipe.description && <p className="text-slate-500 text-sm">{recipe.description}</p>}

          {/* Author + meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <button
              className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
              onClick={() => onAuthorClick?.(recipe.user_id)}
            >
              <AvatarCircle name={recipe.author_name} url={recipe.author_avatar_url} size={6} />
              <div className="text-xs leading-tight text-left">
                <p className="text-slate-500">{recipe.author_name ?? "Anonymous"}</p>
                {recipe.author_handle && <p className="text-slate-400">@{recipe.author_handle}</p>}
              </div>
            </button>
            {recipe.prep_time && <span className="text-xs text-slate-400">⏱ {recipe.prep_time}</span>}
            {recipe.servings && <span className="text-xs text-slate-400">🍽 {recipe.servings} servings</span>}
            {canFollow && (
              <button
                onClick={handleFollow}
                disabled={followLoading}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                  following
                    ? "border-slate-300 text-slate-500 hover:border-red-300 hover:text-red-400"
                    : "border-green-500 text-green-600 hover:bg-green-50"
                }`}
              >
                {following ? "Following" : "Follow"}
              </button>
            )}
          </div>

          {/* Like / Save */}
          <div className="flex items-center gap-4">
            <button
              onClick={handleLike}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${liked ? "text-red-500" : "text-slate-400 hover:text-red-400"}`}
            >
              <span>{liked ? "♥" : "♡"}</span>
              <span>{likeCount}</span>
            </button>
            <button
              onClick={handleSave}
              className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${saved ? "text-green-600" : "text-slate-400 hover:text-green-500"}`}
            >
              <span>{saved ? "★" : "☆"}</span>
              <span>{saved ? "Saved" : "Save"}</span>
            </button>
          </div>

          {/* Star Rating */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-400 mr-0.5">Rate:</span>
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => handleRate(star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className={`text-xl leading-none transition-colors ${
                  star <= (hoverRating || userRating || 0)
                    ? "text-amber-400"
                    : "text-slate-200 hover:text-amber-300"
                }`}
              >
                ★
              </button>
            ))}
            {ratingCount > 0 && (
              <span className="text-xs text-slate-400 ml-1.5">
                {avgRating?.toFixed(1)} avg · {ratingCount} {ratingCount === 1 ? "rating" : "ratings"}
              </span>
            )}
          </div>

          {/* Macros */}
          {recipe.macros && (
            <div className="grid grid-cols-5 gap-2">
              {recipe.macros.calories != null && <div className="bg-orange-50 rounded-xl p-2 text-center"><div className="font-semibold text-sm text-orange-700">{recipe.macros.calories}</div><div className="text-xs text-orange-600 opacity-70">cal</div></div>}
              {recipe.macros.protein != null && <div className="bg-green-50 rounded-xl p-2 text-center"><div className="font-semibold text-sm text-green-700">{recipe.macros.protein}g</div><div className="text-xs text-green-600 opacity-70">protein</div></div>}
              {recipe.macros.carbs != null && <div className="bg-blue-50 rounded-xl p-2 text-center"><div className="font-semibold text-sm text-blue-700">{recipe.macros.carbs}g</div><div className="text-xs text-blue-600 opacity-70">carbs</div></div>}
              {recipe.macros.fat != null && <div className="bg-purple-50 rounded-xl p-2 text-center"><div className="font-semibold text-sm text-purple-700">{recipe.macros.fat}g</div><div className="text-xs text-purple-600 opacity-70">fat</div></div>}
              {recipe.macros.fiber != null && <div className="bg-yellow-50 rounded-xl p-2 text-center"><div className="font-semibold text-sm text-yellow-700">{recipe.macros.fiber}g</div><div className="text-xs text-yellow-600 opacity-70">fiber</div></div>}
            </div>
          )}

          {/* Ingredients */}
          {recipe.ingredients && recipe.ingredients.length > 0 && (
            <div>
              <h3 className="font-medium text-slate-900 text-sm mb-2">Ingredients</h3>
              <div className="flex flex-wrap gap-1.5">
                {recipe.ingredients.map((item) => (
                  <span key={item} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">{item}</span>
                ))}
              </div>
            </div>
          )}

          {/* Steps */}
          {recipe.steps && recipe.steps.length > 0 && (
            <div>
              <h3 className="font-medium text-slate-900 text-sm mb-2">Steps</h3>
              <ol className="space-y-2">
                {recipe.steps.map((step, i) => (
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
                  <div key={c.id} className="flex gap-2.5">
                    <AvatarCircle name={c.author_name} url={c.author_avatar_url} size={7} />
                    <div className="flex-1">
                      <p className="text-xs text-slate-400 mb-0.5">{c.author_name ?? "Anonymous"}</p>
                      <p className="text-sm text-slate-700">{c.content}</p>
                      <button
                        onClick={() => handleCommentLike(c.id)}
                        className={`flex items-center gap-1 mt-1 text-xs transition-colors ${
                          c.user_liked ? "text-red-500" : "text-slate-300 hover:text-red-400"
                        }`}
                      >
                        <span>{c.user_liked ? "♥" : "♡"}</span>
                        {c.like_count > 0 && <span>{c.like_count}</span>}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {user ? (
              <div className="flex gap-2 mt-3">
                <AvatarCircle name={user.user_metadata?.full_name || user.email} url={userAvatarUrl ?? null} size={7} />
                <div className="flex flex-1 gap-2">
                  <input
                    placeholder="Add a comment..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && postComment()}
                    className="flex-1 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    onClick={postComment}
                    disabled={!commentText.trim()}
                    className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60"
                  >
                    Post
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { onClose(); onRequireAuth(); }}
                className="text-sm text-green-600 font-medium hover:underline mt-2"
              >
                Sign in to comment
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
