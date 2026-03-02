"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase";

export type CommunityRecipe = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  prep_time: string | null;
  servings: number | null;
  macros: { calories?: number; protein?: number; carbs?: number; fat?: number; fiber?: number } | null;
  ingredients: string[] | null;
  steps: string[] | null;
  created_at: string;
  author_name: string | null;
  author_handle: string | null;
  author_avatar_url: string | null;
  image_url: string | null;
  like_count: number;
  comment_count: number;
  user_liked: boolean;
  user_saved: boolean;
  avg_rating: number | null;
  rating_count: number;
  user_rating: number | null;
};

type Props = {
  recipe: CommunityRecipe;
  onLike: (id: string, liked: boolean) => void;
  onSave: (id: string, saved: boolean) => void;
  onOpen: (recipe: CommunityRecipe) => void;
  requireAuth: () => boolean;
  onAuthorClick?: (userId: string) => void;
};

function AvatarCircle({ name, url, size = 6 }: { name: string | null; url: string | null; size?: number }) {
  const initial = (name ?? "?").slice(0, 1).toUpperCase();
  const px = size * 4;
  return (
    <div
      className="rounded-full overflow-hidden bg-green-100 text-green-700 font-bold text-xs flex items-center justify-center shrink-0"
      style={{ width: px, height: px, minWidth: px }}
    >
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : initial}
    </div>
  );
}

export { AvatarCircle };

type LikerUser = {
  id: string;
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
};

export default function CommunityRecipeCard({ recipe, onLike, onSave, onOpen, requireAuth, onAuthorClick }: Props) {
  const supabase = createClient();
  const [liked, setLiked] = useState(recipe.user_liked);
  const [likeCount, setLikeCount] = useState(recipe.like_count);
  const [saved, setSaved] = useState(recipe.user_saved);
  const [likersOpen, setLikersOpen] = useState(false);
  const [likers, setLikers] = useState<LikerUser[]>([]);
  const [likersLoading, setLikersLoading] = useState(false);

  function handleLike() {
    if (!requireAuth()) return;
    const next = !liked;
    setLiked(next);
    setLikeCount((c) => c + (next ? 1 : -1));
    onLike(recipe.id, next);
  }

  async function loadLikers() {
    setLikersLoading(true);
    setLikers([]);
    setLikersOpen(true);
    const { data } = await supabase.from("recipe_likes").select("user_id").eq("recipe_id", recipe.id);
    const ids = (data ?? []).map((r: { user_id: string }) => r.user_id);
    if (ids.length > 0) {
      const { data: profiles } = await supabase.from("profiles").select("id, display_name, handle, avatar_url").in("id", ids);
      setLikers((profiles ?? []) as LikerUser[]);
    }
    setLikersLoading(false);
  }

  function handleSave() {
    if (!requireAuth()) return;
    const next = !saved;
    setSaved(next);
    onSave(recipe.id, next);
  }

  const timeAgo = (() => {
    const diff = Date.now() - new Date(recipe.created_at).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  })();

  return (
    <>
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <button className="w-full text-left p-5" onClick={() => onOpen(recipe)}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="font-semibold text-slate-900 text-base leading-tight">{recipe.name}</h3>
          {recipe.prep_time && (
            <span className="text-xs text-slate-400 shrink-0 mt-0.5">{recipe.prep_time}</span>
          )}
        </div>

        {recipe.image_url && (
          <img
            src={recipe.image_url}
            alt={recipe.name}
            className="w-full h-44 object-cover rounded-xl mb-3"
          />
        )}

        <button
          className="flex items-center gap-1.5 mb-2 hover:opacity-70 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onAuthorClick?.(recipe.user_id); }}
        >
          <AvatarCircle name={recipe.author_name} url={recipe.author_avatar_url} size={6} />
          <div className="text-xs leading-tight text-left">
            <p className="text-slate-600">{recipe.author_name ?? "Anonymous"} · {timeAgo}</p>
            {recipe.author_handle && <p className="text-slate-400">@{recipe.author_handle}</p>}
          </div>
        </button>

        {recipe.description && (
          <p className="text-sm text-slate-500 mb-3 line-clamp-2">{recipe.description}</p>
        )}

        {recipe.ingredients && recipe.ingredients.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {recipe.ingredients.slice(0, 6).map((item) => (
              <span key={item} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                {item}
              </span>
            ))}
            {recipe.ingredients.length > 6 && (
              <span className="text-xs text-slate-400 px-2 py-1">+{recipe.ingredients.length - 6} more</span>
            )}
          </div>
        )}

        {recipe.macros && (recipe.macros.calories || recipe.macros.protein) && (
          <div className="flex gap-3 text-xs text-slate-400">
            {recipe.macros.calories && <span>{recipe.macros.calories} cal</span>}
            {recipe.macros.protein && <span>{recipe.macros.protein}g protein</span>}
            {recipe.macros.carbs && <span>{recipe.macros.carbs}g carbs</span>}
          </div>
        )}

        {recipe.rating_count > 0 && (
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-amber-400 text-xs">{"★".repeat(Math.round(recipe.avg_rating ?? 0))}{"☆".repeat(5 - Math.round(recipe.avg_rating ?? 0))}</span>
            <span className="text-xs font-medium text-slate-600">{recipe.avg_rating?.toFixed(1)}</span>
            <span className="text-xs text-slate-400">({recipe.rating_count})</span>
          </div>
        )}
      </button>

      <div className="flex items-center gap-4 px-5 py-3 border-t border-slate-100">
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleLike}
            className={`text-sm font-medium transition-colors ${liked ? "text-red-500" : "text-slate-400 hover:text-red-400"}`}
          >
            {liked ? "♥" : "♡"}
          </button>
          <button
            onClick={likeCount > 0 ? loadLikers : undefined}
            className={`text-sm font-medium transition-colors ${likeCount > 0 ? "text-slate-500 hover:text-slate-700" : "text-slate-400 cursor-default"}`}
          >
            {likeCount}
          </button>
        </div>

        <button
          onClick={handleSave}
          className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${
            saved ? "text-green-600" : "text-slate-400 hover:text-green-500"
          }`}
        >
          <span>{saved ? "★" : "☆"}</span>
          <span>{saved ? "Saved" : "Save"}</span>
        </button>

        <button
          onClick={() => onOpen(recipe)}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors ml-auto"
        >
          <span>💬</span>
          <span>{recipe.comment_count}</span>
        </button>
      </div>
    </div>

    {likersOpen && (
      <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
        <div className="bg-white rounded-2xl w-full max-w-sm max-h-[60vh] overflow-y-auto">
          <div className="sticky top-0 bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-semibold text-slate-900 text-sm">{likeCount} {likeCount === 1 ? "Like" : "Likes"}</h3>
            <button onClick={() => setLikersOpen(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
          </div>
          <div className="p-4">
            {likersLoading ? (
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
            ) : likers.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No likes yet.</p>
            ) : (
              <div className="space-y-1">
                {likers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => { setLikersOpen(false); onAuthorClick?.(u.id); }}
                    className="flex items-center gap-3 w-full p-3 hover:bg-slate-50 rounded-xl transition-colors text-left"
                  >
                    <AvatarCircle name={u.display_name} url={u.avatar_url} size={9} />
                    <div>
                      <p className="text-sm font-medium text-slate-900">{u.display_name ?? "User"}</p>
                      {u.handle && <p className="text-xs text-slate-400">@{u.handle}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
