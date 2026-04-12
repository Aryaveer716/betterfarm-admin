import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, CheckCircle, XCircle, MapPin, Sprout } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Farms() {
  const [search, setSearch] = useState("");
  const [verificationStatus, setVerificationStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [page, setPage] = useState(1);
  const [actionFarm, setActionFarm] = useState<{ id: number; action: "approved" | "rejected" } | null>(null);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.getFarms.useQuery({ search, verificationStatus, page, limit: 20 });

  const updateVerification = trpc.admin.updateVerification.useMutation({
    onSuccess: () => { toast.success("Verification updated"); setActionFarm(null); utils.admin.getFarms.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const statusColor = (s: string | null) => {
    if (s === "approved") return "bg-green-100 text-green-700";
    if (s === "rejected") return "bg-red-100 text-red-700";
    return "bg-yellow-100 text-yellow-700";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Farms</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage farmer profiles and verification</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search farms..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={verificationStatus} onValueChange={(v) => { setVerificationStatus(v as any); setPage(1); }}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded" />)}</div>
          ) : data?.farms?.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No farms found</p>
          ) : (
            <div className="space-y-2">
              {data?.farms?.map((farm) => (
                <div key={farm.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
                      <Sprout className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{farm.farmName ?? "Unnamed Farm"}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {farm.location && <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{farm.location}</span>}
                        {farm.primaryCrop && <span className="text-xs text-muted-foreground">· {farm.primaryCrop}</span>}
                        {farm.farmSizeHectares && <span className="text-xs text-muted-foreground">· {farm.farmSizeHectares} ha</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(farm.verificationStatus)}`}>
                      {farm.verificationStatus ?? "pending"}
                    </span>
                    <span className="text-xs text-muted-foreground hidden sm:block">
                      {formatDistanceToNow(new Date(farm.createdAt), { addSuffix: true })}
                    </span>
                    {farm.verificationStatus === "pending" && (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => setActionFarm({ id: farm.id, action: "approved" })}>
                          <CheckCircle className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => setActionFarm({ id: farm.id, action: "rejected" })}>
                          <XCircle className="w-3 h-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {(data?.total ?? 0) > 20 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">{data?.total} total farms</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={page * 20 >= (data?.total ?? 0)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={actionFarm !== null} onOpenChange={() => setActionFarm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionFarm?.action === "approved" ? "Approve" : "Reject"} Farm Verification</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to {actionFarm?.action === "approved" ? "approve" : "reject"} this farm's verification?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionFarm(null)}>Cancel</Button>
            <Button
              variant={actionFarm?.action === "approved" ? "default" : "destructive"}
              onClick={() => actionFarm && updateVerification.mutate({ farmId: actionFarm.id, status: actionFarm.action })}
              disabled={updateVerification.isPending}
            >
              {actionFarm?.action === "approved" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
