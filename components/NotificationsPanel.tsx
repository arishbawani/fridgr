"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import { AvatarCircle } from "./CommunityRecipeCard";

type Notification = {
  id: string;
  actor_name: string | null;
  actor_avatar_url: string | null;
  type: "like" | "comment" | "follow";
  recipe_name: string | null;
  comment_preview: string | null;
  read: boolean;
  created_at: string;
};

type Props = {
  user: User;
  onClose: () => void;
  onMarkRead: () => void;
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationsPanel({ user, onClose, onMarkRead }: Props) {
  const supabase = createClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setNotifications((data ?? []) as Notification[]);
      setLoading(false);

      // Mark all as read
      supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", user.id)
        .eq("read", false)
        .then(() => onMarkRead());
    }
    load();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Notifications</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-slate-200 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-slate-200 rounded w-3/4" />
                    <div className="h-3 bg-slate-100 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-2xl mb-2">🔔</p>
              <p className="text-slate-400 text-sm">No notifications yet.</p>
              <p className="text-slate-300 text-xs mt-1">When someone likes, comments, or follows you, you&apos;ll see it here.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`flex gap-3 items-start p-3 rounded-xl transition-colors ${!n.read ? "bg-green-50" : ""}`}
                >
                  <AvatarCircle name={n.actor_name} url={n.actor_avatar_url} size={9} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700 leading-snug">
                      <span className="font-medium">{n.actor_name ?? "Someone"}</span>
                      {n.type === "like"
                        ? <> liked your recipe <span className="font-medium">&ldquo;{n.recipe_name}&rdquo;</span></>
                        : n.type === "follow"
                        ? <> started following you</>
                        : <> commented on <span className="font-medium">&ldquo;{n.recipe_name}&rdquo;</span>{n.comment_preview ? `: "${n.comment_preview}"` : ""}</>
                      }
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-green-500 shrink-0 mt-1.5" />}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
