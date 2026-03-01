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

  const isOwnRecipe = user?.id === recipe.user_id;
  const isAdmin = user?.id === ADMIN_ID;
  const canFollow = !!user && !isOwnRecipe;

  useEffect(() => {
    async function load() {
      setCommentsLoading(true);
      const { data } = await supabase
        .from("recipe_comments")
        .select("*")
        .eq("recipe_id", recipe.id)
        .order("created_at", { ascending: true });
      setComments(data ?? []);
      setCommentsLoading(false);

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
    }
    setFollowLoading(false);
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
          {recipe.description && <p className="text-slate-500 text-sm">{recipe.description}</p>}

          {/* Author + meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <AvatarCircle name={recipe.author_name} url={recipe.author_avatar_url} size={6} />
              <span className="text-xs text-slate-500">{recipe.author_name ?? "Anonymous"}</span>
            </div>
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
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">{c.author_name ?? "Anonymous"}</p>
                      <p className="text-sm text-slate-700">{c.content}</p>
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
