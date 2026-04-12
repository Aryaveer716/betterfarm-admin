import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Search, Trash2, RotateCcw, MessageSquare, ShoppingCart } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Moderation() {
  const [tab, setTab] = useState<"posts" | "listings">("posts");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [removeId, setRemoveId] = useState<number | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const utils = trpc.useUtils();

  const { data: postsData, isLoading: postsLoading } = trpc.admin.getPosts.useQuery(
    { search, isRemoved: undefined, page, limit: 20 },
    { enabled: tab === "posts" }
  );

  const { data: listingsData, isLoading: listingsLoading } = trpc.admin.getListings.useQuery(
    { search, status: "all", page, limit: 20 },
    { enabled: tab === "listings" }
  );

  const removePost = trpc.admin.removePost.useMutation({
    onSuccess: () => { toast.success("Post removed"); setRemoveId(null); setRemoveReason(""); utils.admin.getPosts.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const restorePost = trpc.admin.restorePost.useMutation({
    onSuccess: () => { toast.success("Post restored"); utils.admin.getPosts.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const removeListing = trpc.admin.removeListing.useMutation({
    onSuccess: () => { toast.success("Listing removed"); setRemoveId(null); setRemoveReason(""); utils.admin.getListings.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const restoreListing = trpc.admin.restoreListing.useMutation({
    onSuccess: () => { toast.success("Listing restored"); utils.admin.getListings.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const handleRemove = () => {
    if (!removeId || !removeReason.trim()) return;
    if (tab === "posts") removePost.mutate({ postId: removeId, reason: removeReason });
    else removeListing.mutate({ listingId: removeId, reason: removeReason });
  };

  const isPending = removePost.isPending || removeListing.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Moderation</h1>
        <p className="text-muted-foreground text-sm mt-1">Review and moderate platform content</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => { setTab(v as any); setPage(1); setSearch(""); }}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="posts">Forum Posts</TabsTrigger>
            <TabsTrigger value="listings">Marketplace</TabsTrigger>
          </TabsList>
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search content..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
          </div>
        </div>

        <TabsContent value="posts">
          <Card>
            <CardContent className="pt-4">
              {postsLoading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded" />)}</div>
              ) : (postsData?.posts?.length ?? 0) === 0 ? (
                <p className="text-center text-muted-foreground py-8">No posts found</p>
              ) : (
                <div className="space-y-2">
                  {postsData?.posts?.map((post) => (
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
                            {post.isRemoved && <span className="text-xs text-red-600 font-medium">Removed</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {post.isRemoved ? (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-green-600 hover:bg-green-50"
                            onClick={() => restorePost.mutate({ postId: post.id })} disabled={restorePost.isPending}>
                            <RotateCcw className="w-3 h-3" /><span className="ml-1 hidden sm:inline text-xs">Restore</span>
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:bg-destructive/10"
                            onClick={() => setRemoveId(post.id)}>
                            <Trash2 className="w-3 h-3" /><span className="ml-1 hidden sm:inline text-xs">Remove</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="listings">
          <Card>
            <CardContent className="pt-4">
              {listingsLoading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded" />)}</div>
              ) : (listingsData?.listings?.length ?? 0) === 0 ? (
                <p className="text-center text-muted-foreground py-8">No listings found</p>
              ) : (
                <div className="space-y-2">
                  {listingsData?.listings?.map((listing) => (
                    <div key={listing.id} className={`flex items-start justify-between p-3 rounded-lg border transition-colors ${listing.isRemoved ? "border-red-200 bg-red-50/30" : "border-border hover:bg-muted/30"}`}>
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                          <ShoppingCart className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{listing.title}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {listing.price && <span className="text-xs font-medium text-green-700">₱{listing.price.toLocaleString()}</span>}
                            {listing.category && <span className="text-xs text-muted-foreground">· {listing.category}</span>}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(listing.createdAt), { addSuffix: true })}</span>
                            {listing.isRemoved && <span className="text-xs text-red-600 font-medium">Removed</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {listing.isRemoved ? (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-green-600 hover:bg-green-50"
                            onClick={() => restoreListing.mutate({ listingId: listing.id })} disabled={restoreListing.isPending}>
                            <RotateCcw className="w-3 h-3" /><span className="ml-1 hidden sm:inline text-xs">Restore</span>
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:bg-destructive/10"
                            onClick={() => setRemoveId(listing.id)}>
                            <Trash2 className="w-3 h-3" /><span className="ml-1 hidden sm:inline text-xs">Remove</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={removeId !== null} onOpenChange={() => { setRemoveId(null); setRemoveReason(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove {tab === "posts" ? "Post" : "Listing"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Provide a reason for removing this content.</p>
            <Input placeholder="Reason for removal..." value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRemoveId(null); setRemoveReason(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={isPending || !removeReason.trim()}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
