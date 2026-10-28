import { useState, useRef, useEffect } from "react";
import { Bell, Check, CheckCheck, Clock, ExternalLink, ShieldCheck, UserCheck, UserPlus, UserX, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const utils = trpc.useUtils();
  const { data: unreadData } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 10000,
  });
  const { data: notifications = [], isLoading } = trpc.notifications.list.useQuery(
    { limit: 25 },
    { enabled: open, refetchInterval: open ? 5000 : false }
  );

  const markReadMutation = trpc.notifications.markAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
    },
  });

  const markAllReadMutation = trpc.notifications.markAllAsRead.useMutation({
    onSuccess: () => {
      utils.notifications.unreadCount.invalidate();
      utils.notifications.list.invalidate();
      toast.success("All notifications marked as read");
    },
  });

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const unreadCount = unreadData?.count ?? 0;

  const handleMarkAsRead = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    markReadMutation.mutate({ id });
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "JOIN_REQUEST_SUBMITTED":
        return <UserPlus size={16} className="text-sky-400" />;
      case "JOIN_REQUEST_APPROVED":
        return <UserCheck size={16} className="text-emerald-400" />;
      case "JOIN_REQUEST_REJECTED":
        return <UserX size={16} className="text-rose-400" />;
      default:
        return <Bell size={16} className="text-amber-400" />;
    }
  };

  const formatTime = (isoString: string | Date) => {
    try {
      const d = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return "just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return d.toLocaleDateString();
    } catch {
      return "";
    }
  };

  return (
    <div className="relative notification-control" ref={containerRef}>
      <button
        type="button"
        className="icon-button notification-button relative"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={open}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm"
            style={{ fontSize: "10px", lineHeight: 1 }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          className="floating-menu notification-menu fixed sm:absolute right-2 sm:right-0 mt-2 w-[340px] sm:w-[380px] max-h-[480px] rounded-2xl border border-slate-200 bg-white shadow-2xl z-50 flex flex-col overflow-hidden text-slate-900"
          style={{ top: "100%", boxShadow: "0 20px 45px -10px rgba(15, 23, 42, 0.15), 0 1px 3px rgba(15, 23, 42, 0.05)" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/80">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-900">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold transition-colors"
              >
                <CheckCheck size={14} />
                <span>Mark all read</span>
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 max-h-[380px]">
            {isLoading ? (
              <div className="py-8 text-center text-xs text-slate-500">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Bell size={18} />
                </div>
                <p className="text-xs font-semibold text-slate-700">No notifications yet</p>
                <p className="text-[11px] text-slate-500 mt-1">Updates on requests will appear here</p>
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`p-3.5 transition-colors flex items-start gap-3 hover:bg-slate-50/80 cursor-pointer ${
                    !item.read ? "bg-blue-50/30" : ""
                  }`}
                  onClick={(e) => {
                    if (!item.read) handleMarkAsRead(item.id, e);
                  }}
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 border border-slate-200/80">
                    {getIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <h4 className={`text-xs font-bold truncate ${!item.read ? "text-slate-900" : "text-slate-600"}`}>
                        {item.title}
                      </h4>
                      <span className="text-[10px] text-slate-400 shrink-0 flex items-center gap-1">
                        <Clock size={10} />
                        {formatTime(item.createdAt)}
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-600 line-clamp-2 leading-relaxed">{item.message}</p>
                  </div>
                  {!item.read && (
                    <button
                      type="button"
                      title="Mark as read"
                      onClick={(e) => handleMarkAsRead(item.id, e)}
                      className="mt-1 h-2 w-2 rounded-full bg-blue-600 shrink-0 hover:scale-125 transition-transform"
                    />
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
