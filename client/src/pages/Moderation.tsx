import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Search,
  Trash2,
  RotateCcw,
  MessageSquare,
  Flag,
  ShieldOff,
  ImageIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type ActionKind =
  | { kind: "remove-post"; id: number; title: string }
  | { kind: "flag-post"; id: number; title: string }
  | null;

export default function Moderation() {
  const [tab, setTab] = useState<"posts" | "flagged">("flagged");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<ActionKind>(null);
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();

  const { data: flaggedData, isLoading: flaggedLoading } = trpc.admin.getFlaggedPosts.useQuery(
    { page, limit: 20 },
    { enabled: tab === "flagged" },
  );
  const { data: postsData, isLoading: postsLoading } = trpc.admin.getPosts.useQuery(
    { search, page, limit: 20 },
    { enabled: tab === "posts" },
  );

  const closeAction = () => {
    setAction(null);
    setReason("");
  };
  const onSettled = () => {
    void utils.admin.getPosts.invalidate();
    void utils.admin.getFlaggedPosts.invalidate();
    closeAction();
  };

  const removePost = trpc.admin.removePost.useMutation({
    onSuccess: () => { toast.success("Post removed"); onSettled(); },
    onError: (e) => toast.error(e.message),
  });
  const restorePost = trpc.admin.restorePost.useMutation({
    onSuccess: () => { toast.success("Post restored"); onSettled(); },
    onError: (e) => toast.error(e.message),
  });
  const flagPost = trpc.admin.flagPost.useMutation({
    onSuccess: () => { toast.success("Post flagged"); onSettled(); },
    onError: (e) => toast.error(e.message),
  });
  const unflagPost = trpc.admin.unflagPost.useMutation({
    onSuccess: () => { toast.success("Flag cleared"); onSettled(); },
    onError: (e) => toast.error(e.message),
  });

  const isPending =
    removePost.isPending || restorePost.isPending || flagPost.isPending || unflagPost.isPending;

  const flaggedQueue = flaggedData?.posts ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Moderation</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Triage flagged forum content. Every action audit-logged.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as "posts" | "flagged");
          setPage(1);
          setSearch("");
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="flagged">
              Flagged queue
              {(flaggedData?.total ?? 0) > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">{flaggedData?.total}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="posts">All posts</TabsTrigger>
          </TabsList>
          {tab !== "flagged" && (
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
          )}
        </div>

        <TabsContent value="flagged">
          <Card>
            <CardContent className="pt-4">
              {flaggedLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded" />)}
                </div>
              )}
              {!flaggedLoading && flaggedQueue.length === 0 && (
                <p className="text-center text-muted-foreground py-8">No flagged posts in queue.</p>
              )}
              <div className="space-y-2">
                {flaggedQueue.map((post) => (
                  <PostRow
                    key={post.id}
                    post={post}
                    isPending={isPending}
                    onRemove={() => setAction({ kind: "remove-post", id: post.id, title: post.title || "post" })}
                    onRestore={() => restorePost.mutate({ postId: post.id })}
                    onFlag={() => setAction({ kind: "flag-post", id: post.id, title: post.title || "post" })}
                    onUnflag={() => unflagPost.mutate({ postId: post.id })}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="posts">
          <Card>
            <CardContent className="pt-4">
              {postsLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded" />)}
                </div>
              )}
              {!postsLoading && (postsData?.posts.length ?? 0) === 0 && (
                <p className="text-center text-muted-foreground py-8">No posts match.</p>
              )}
              <div className="space-y-2">
                {postsData?.posts.map((post) => (
                  <PostRow
                    key={post.id}
                    post={post}
                    isPending={isPending}
                    onRemove={() => setAction({ kind: "remove-post", id: post.id, title: post.title || "post" })}
                    onRestore={() => restorePost.mutate({ postId: post.id })}
                    onFlag={() => setAction({ kind: "flag-post", id: post.id, title: post.title || "post" })}
                    onUnflag={() => unflagPost.mutate({ postId: post.id })}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={action !== null} onOpenChange={(open) => !open && closeAction()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.kind === "remove-post" && `Remove "${action.title}"`}
              {action?.kind === "flag-post" && `Flag "${action.title}"`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Reason</Label>
            <Input
              placeholder="Reason (audit-logged)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAction}>Cancel</Button>
            <Button
              variant={action?.kind === "flag-post" ? "default" : "destructive"}
              disabled={isPending || reason.trim() === ""}
              onClick={() => {
                if (!action) return;
                if (action.kind === "remove-post") {
                  removePost.mutate({ postId: action.id, reason: reason.trim() });
                } else if (action.kind === "flag-post") {
                  flagPost.mutate({ postId: action.id, reason: reason.trim() });
                }
              }}
            >
              {action?.kind === "flag-post" ? "Flag" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface PostRowProps {
  post: {
    id: number;
    title: string;
    content: string;
    authorName: string | null;
    cropTag: string | null;
    location: string | null;
    imageCount: number;
    isAlert: boolean;
    isFlagged: boolean;
    isRemoved: boolean;
    flagCount: number;
    helpfulCount: number;
    commentCount: number;
    createdAt: Date;
    removedReason: string | null;
  };
  isPending: boolean;
  onRemove: () => void;
  onRestore: () => void;
  onFlag: () => void;
  onUnflag: () => void;
}

function PostRow({ post, isPending, onRemove, onRestore, onFlag, onUnflag }: PostRowProps) {
  return (
    <div
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
          <div className="w-8 h-8 bg-purple-50 dark:bg-purple-950/30 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
            <MessageSquare className="w-4 h-4 text-purple-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-medium text-sm truncate">{post.title || "Untitled"}</p>
              {post.isAlert && <Badge variant="destructive" className="text-xs">alert</Badge>}
              {post.isRemoved && <Badge variant="destructive" className="text-xs">Removed</Badge>}
              {post.isFlagged && !post.isRemoved && (
                <Badge variant="outline" className="text-xs">
                  <Flag className="w-3 h-3 mr-1" />Flagged{post.flagCount > 1 ? ` (${post.flagCount})` : ""}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{post.content}</p>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
              {post.authorName && <span>by {post.authorName}</span>}
              {post.cropTag && <Badge variant="outline" className="text-xs">{post.cropTag}</Badge>}
              {post.imageCount > 0 && (
                <span className="flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" />{post.imageCount}
                </span>
              )}
              <span>{post.helpfulCount} helpful</span>
              <span>{formatDistanceToNow(new Date(post.createdAt))} ago</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {post.isRemoved ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-950/30"
              onClick={onRestore}
              disabled={isPending}
            >
              <RotateCcw className="w-3 h-3" />
              <span className="ml-1 hidden sm:inline text-xs">Restore</span>
            </Button>
          ) : (
            <>
              {post.isFlagged ? (
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={onUnflag} disabled={isPending}>
                  <ShieldOff className="w-3 h-3" />
                  <span className="ml-1 hidden sm:inline text-xs">Unflag</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-yellow-700 hover:bg-yellow-50 dark:hover:bg-yellow-950/30"
                  onClick={onFlag}
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
                onClick={onRemove}
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
  );
}
