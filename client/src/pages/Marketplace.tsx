import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Trash2, RotateCcw, ShoppingCart } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const statusColor = (s: string | null) => {
  if (s === "active") return "bg-green-100 text-green-700";
  if (s === "sold") return "bg-blue-100 text-blue-700";
  if (s === "removed") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-700";
};

export default function Marketplace() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "sold" | "removed" | "pending">("all");
  const [page, setPage] = useState(1);
  const [removeId, setRemoveId] = useState<number | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.getListings.useQuery({ search, status, page, limit: 20 });

  const remove = trpc.admin.removeListing.useMutation({
    onSuccess: () => { toast.success("Listing removed"); setRemoveId(null); setRemoveReason(""); utils.admin.getListings.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const restore = trpc.admin.restoreListing.useMutation({
    onSuccess: () => { toast.success("Listing restored"); utils.admin.getListings.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Marketplace</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage produce listings and marketplace content</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search listings..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(1); }}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="sold">Sold</SelectItem>
                <SelectItem value="removed">Removed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded" />)}</div>
          ) : data?.listings?.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No listings found</p>
          ) : (
            <div className="space-y-2">
              {data?.listings?.map((listing) => (
                <div key={listing.id} className={`flex items-start justify-between p-3 rounded-lg border transition-colors ${listing.isRemoved ? "border-red-200 bg-red-50/30" : "border-border hover:bg-muted/30"}`}>
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <ShoppingCart className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{listing.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {listing.price && <span className="text-xs font-medium text-green-700">₱{listing.price.toLocaleString()}{listing.unit ? `/${listing.unit}` : ""}</span>}
                        {listing.category && <span className="text-xs text-muted-foreground">· {listing.category}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusColor(listing.status)}`}>{listing.status}</span>
                        <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(listing.createdAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {listing.isRemoved ? (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-green-600 hover:bg-green-50"
                        onClick={() => restore.mutate({ listingId: listing.id })} disabled={restore.isPending}>
                        <RotateCcw className="w-3 h-3" />
                        <span className="ml-1 hidden sm:inline text-xs">Restore</span>
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:bg-destructive/10"
                        onClick={() => setRemoveId(listing.id)}>
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
              <p className="text-sm text-muted-foreground">{data?.total} total listings</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={page * 20 >= (data?.total ?? 0)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={removeId !== null} onOpenChange={() => { setRemoveId(null); setRemoveReason(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remove Listing</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Provide a reason for removing this listing.</p>
            <Input placeholder="Reason for removal..." value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRemoveId(null); setRemoveReason(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => removeId && remove.mutate({ listingId: removeId, reason: removeReason })}
              disabled={remove.isPending || !removeReason.trim()}>Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
