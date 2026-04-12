import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Trash2, RotateCcw, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Community() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "removed">("all");
  const [page, setPage] = useState(1);
  const [removePost, setRemovePost] = useState<number | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const utils = trpc.useUtils();

  const isRemoved = filter === "all" ? undefined : filter === "removed";
  const { data, isLoading } = trpc.admin.getPosts.useQuery({ search, isRemoved, page, limit: 20 });

  const remove = trpc.admin.removePost.useMutation({
    onSuccess: () => { toast.success("Post removed"); setRemovePost(null); setRemoveReason(""); utils.admin.getPosts.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const restore = trpc.admin.restorePost.useMutation({
    onSuccess: () => { toast.success("Post restored"); utils.admin.getPosts.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Community</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage forum posts and community content</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search posts..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={filter} onValueChange={(v) => { setFilter(v as any); setPage(1); }}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Posts</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="removed">Removed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded" />)}</div>
          ) : data?.posts?.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No posts found</p>
          ) : (
            <div className="space-y-2">
              {data?.posts?.map((post) => (
                <div key={post.id} className={`flex items-start justify-between p-3 rounded-lg border transition-colors ${post.isRemoved ? "border-red-200 bg-red-50/30" : "border-border hover:bg-muted/30"}`}>
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <MessageSquare className="w-4 h-4 text-purple-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{post.title ?? "Untitled"}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{post.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {post.category && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{post.category}</span>}
                        <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}</span>
                        {post.isRemoved && <span className="text-xs text-red-600">Removed</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {post.isRemoved ? (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-green-600 hover:bg-green-50"
                        onClick={() => restore.mutate({ postId: post.id })} disabled={restore.isPending}>
                        <RotateCcw className="w-3 h-3" />
                        <span className="ml-1 hidden sm:inline text-xs">Restore</span>
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:bg-destructive/10"
                        onClick={() => setRemovePost(post.id)}>
                        <Trash2 className="w-3 h-3" />
                        <span className="ml-1 hidden sm:inline text-xs">Remove</span>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {(data?.total ?? 0) > 20 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">{data?.total} total posts</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={page * 20 >= (data?.total ?? 0)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={removePost !== null} onOpenChange={() => { setRemovePost(null); setRemoveReason(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove Post</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Provide a reason for removing this post.</p>
            <Input placeholder="Reason for removal..." value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRemovePost(null); setRemoveReason(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => removePost && remove.mutate({ postId: removePost, reason: removeReason })}
              disabled={remove.isPending || !removeReason.trim()}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
