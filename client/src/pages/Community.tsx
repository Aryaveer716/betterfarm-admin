import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search,
  Trash2,
  RotateCcw,
  MessageSquare,
  Flag,
  ShieldOff,
  MapPin,
  ImageIcon,
  AlertTriangle,
  ThumbsUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Filter = "all" | "active" | "removed" | "flagged";
type ActionKind =
  | { kind: "remove"; postId: number; title: string }
  | { kind: "flag"; postId: number; title: string }
  | null;

export default function Community() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<ActionKind>(null);
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();

  const isRemoved = filter === "removed" ? true : filter === "active" || filter === "flagged" ? false : undefined;
  const isFlagged = filter === "flagged" ? true : undefined;

  const { data, isLoading } = trpc.admin.getPosts.useQuery({
    search,
    isRemoved,
    isFlagged,
    page,
    limit: 20,
  });

  const closeAction = () => {
    setAction(null);
    setReason("");
  };

  const onSettled = () => {
    void utils.admin.getPosts.invalidate();
    closeAction();
  };

  const remove = trpc.admin.removePost.useMutation({
    onSuccess: () => { toast.success("Post removed"); onSettled(); },
    onError: (e) => toast.error(e.message),
  });
  const restore = trpc.admin.restorePost.useMutation({
    onSuccess: () => { toast.success("Post restored"); onSettled(); },
    onError: (e) => toast.error(e.message),
  });
  const flag = trpc.admin.flagPost.useMutation({
    onSuccess: () => { toast.success("Post flagged"); onSettled(); },
    onError: (e) => toast.error(e.message),
  });
  const unflag = trpc.admin.unflagPost.useMutation({
    onSuccess: () => { toast.success("Flag cleared"); onSettled(); },
    onError: (e) => toast.error(e.message),
  });

  const isPending = remove.isPending || restore.isPending || flag.isPending || unflag.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Community</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage forum posts. Flag posts for review, remove violations, restore mistakes. Every action audit-logged.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search title or content…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={filter} onValueChange={(v) => { setFilter(v as Filter); setPage(1); }}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All posts</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
                <SelectItem value="removed">Removed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 bg-muted animate-pulse rounded" />
              ))}
            </div>
          )}

          {!isLoading && (data?.posts.length ?? 0) === 0 && (
            <p className="text-center text-muted-foreground py-8">No posts match.</p>
          )}

          <div className="space-y-2">
            {data?.posts.map((post) => (
              <div
                key={post.id}
                className={`p-3 rounded-lg border transition-colors ${
                  post.isRemoved
                    ? "border-red-200 bg-red-50/30 dark:bg-red-950/20"
                    : post.isFlagged
                    ? "border-yellow-300 bg-yellow-50/30 dark:bg-yellow-950/20"
                    : "border-border hover:bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 bg-purple-50 dark:bg-purple-950/30 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <MessageSquare className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm truncate">{post.title || "Untitled"}</p>
                        {post.isAlert && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertTriangle className="w-3 h-3 mr-1" />alert
                          </Badge>
                        )}
                        {post.verified && (
                          <Badge variant="outline" className="text-xs">verified</Badge>
                        )}
                        {post.isRemoved && (
                          <Badge variant="destructive" className="text-xs">Removed</Badge>
                        )}
                        {post.isFlagged && !post.isRemoved && (
                          <Badge variant="outline" className="text-xs">
                            <Flag className="w-3 h-3 mr-1" />Flagged{post.flagCount > 1 ? ` (${post.flagCount})` : ""}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {post.content}
                      </p>
                      <div className="flex items-center gap-3 flex-wrap mt-1.5 text-xs text-muted-foreground">
                        {post.authorName && <span>by {post.authorName}</span>}
                        {post.cropTag && <Badge variant="outline" className="text-xs">{post.cropTag}</Badge>}
                        {post.location && (
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{post.location}</span>
                        )}
                        {post.imageCount > 0 && (
                          <span className="flex items-center gap-1"><ImageIcon className="w-3 h-3" />{post.imageCount}</span>
                        )}
                        <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{post.helpfulCount}</span>
                        <span>{post.commentCount} comments</span>
                        <span>{formatDistanceToNow(new Date(post.createdAt))} ago</span>
                      </div>
                      {post.isRemoved && post.removedReason && (
                        <p className="text-xs text-red-600 mt-1">Removed: {post.removedReason}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {post.isRemoved ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30"
                        onClick={() => restore.mutate({ postId: post.id })}
                        disabled={isPending}
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span className="ml-1 hidden sm:inline text-xs">Restore</span>
                      </Button>
                    ) : (
                      <>
                        {post.isFlagged ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            onClick={() => unflag.mutate({ postId: post.id })}
                            disabled={isPending}
                          >
                            <ShieldOff className="w-3 h-3" />
                            <span className="ml-1 hidden sm:inline text-xs">Unflag</span>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-950/30"
                            onClick={() => setAction({ kind: "flag", postId: post.id, title: post.title || "post" })}
                            disabled={isPending}
                          >
                            <Flag className="w-3 h-3" />
                            <span className="ml-1 hidden sm:inline text-xs">Flag</span>
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive hover:bg-destructive/10"
                          onClick={() => setAction({ kind: "remove", postId: post.id, title: post.title || "post" })}
                          disabled={isPending}
                        >
                          <Trash2 className="w-3 h-3" />
                          <span className="ml-1 hidden sm:inline text-xs">Remove</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {data && data.total > 20 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">
                Page {page} of {Math.ceil(data.total / 20)} · {data.total} posts
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page * 20 >= data.total}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={action !== null} onOpenChange={(open) => !open && closeAction()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.kind === "remove" && `Remove "${action.title}"`}
              {action?.kind === "flag" && `Flag "${action.title}"`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Reason</Label>
            <Input
              placeholder={
                action?.kind === "remove"
                  ? "Reason for removal (visible in audit log)"
                  : "Why is this flagged for review?"
              }
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAction}>Cancel</Button>
            <Button
              variant={action?.kind === "remove" ? "destructive" : "default"}
              disabled={isPending || reason.trim() === ""}
              onClick={() => {
                if (!action) return;
                if (action.kind === "remove") {
                  remove.mutate({ postId: action.postId, reason: reason.trim() });
                } else if (action.kind === "flag") {
                  flag.mutate({ postId: action.postId, reason: reason.trim() });
                }
              }}
            >
              {action?.kind === "remove" ? "Remove" : "Flag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
