import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle, XCircle, BadgeCheck, MapPin, Sprout } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const statusColor = (s: string | null) => {
  if (s === "approved") return "bg-green-100 text-green-700";
  if (s === "rejected") return "bg-red-100 text-red-700";
  return "bg-yellow-100 text-yellow-700";
};

export default function Verification() {
  const [status, setStatus] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [page, setPage] = useState(1);
  const [actionFarm, setActionFarm] = useState<{ id: number; action: "approved" | "rejected" } | null>(null);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.getFarms.useQuery({ verificationStatus: status, page, limit: 20 });

  const updateVerification = trpc.admin.updateVerification.useMutation({
    onSuccess: () => { toast.success("Verification updated"); setActionFarm(null); utils.admin.getFarms.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Verification</h1>
        <p className="text-muted-foreground text-sm mt-1">Review and approve farmer verification requests</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{data?.total ?? 0} requests</p>
            <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded" />)}</div>
          ) : data?.farms?.length === 0 ? (
            <div className="text-center py-12">
              <BadgeCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No {status === "all" ? "" : status} verification requests</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data?.farms?.map((farm) => (
                <div key={farm.id} className="p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
                        <Sprout className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium">{farm.farmName ?? "Unnamed Farm"}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                          {farm.location && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <MapPin className="w-3 h-3" />{farm.location}
                            </span>
                          )}
                          {farm.primaryCrop && <span className="text-xs text-muted-foreground">Crop: {farm.primaryCrop}</span>}
                          {farm.farmSizeHectares && <span className="text-xs text-muted-foreground">Size: {farm.farmSizeHectares} ha</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(farm.verificationStatus)}`}>
                            {farm.verificationStatus ?? "pending"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(farm.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </div>
                    {farm.verificationStatus === "pending" && (
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => setActionFarm({ id: farm.id, action: "approved" })}>
                          <CheckCircle className="w-3 h-3 mr-1" />Approve
                        </Button>
                        <Button size="sm" variant="outline" className="h-8 text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => setActionFarm({ id: farm.id, action: "rejected" })}>
                          <XCircle className="w-3 h-3 mr-1" />Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {(data?.total ?? 0) > 20 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">{data?.total} total</p>
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
            <DialogTitle>{actionFarm?.action === "approved" ? "Approve" : "Reject"} Verification</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to {actionFarm?.action === "approved" ? "approve" : "reject"} this farmer's verification request?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionFarm(null)}>Cancel</Button>
            <Button
              variant={actionFarm?.action === "approved" ? "default" : "destructive"}
              className={actionFarm?.action === "approved" ? "bg-green-600 hover:bg-green-700" : ""}
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
