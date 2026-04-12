import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const statusColor = (s: string) => {
  if (s === "pending") return "bg-yellow-100 text-yellow-700";
  if (s === "resolved") return "bg-green-100 text-green-700";
  return "bg-gray-100 text-gray-600";
};

export default function Reports() {
  const [status, setStatus] = useState<"all" | "pending" | "resolved" | "dismissed">("all");
  const [page, setPage] = useState(1);
  const [resolveId, setResolveId] = useState<number | null>(null);
  const [resolution, setResolution] = useState("");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.getReports.useQuery({ status, page, limit: 20 });

  const resolve = trpc.admin.resolveReport.useMutation({
    onSuccess: () => { toast.success("Report resolved"); setResolveId(null); setResolution(""); utils.admin.getReports.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const dismiss = trpc.admin.dismissReport.useMutation({
    onSuccess: () => { toast.success("Report dismissed"); utils.admin.getReports.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">Review and action user-submitted reports</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{data?.total ?? 0} total reports</p>
            <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded" />)}</div>
          ) : data?.reports?.length === 0 ? (
            <div className="text-center py-12">
              <Flag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No reports found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data?.reports?.map((report) => (
                <div key={report.id} className="flex items-start justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <Flag className="w-4 h-4 text-red-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{report.reason}</p>
                      {report.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{report.description}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        {report.targetUserId && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">User #{report.targetUserId}</span>}
                        {report.targetPostId && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Post #{report.targetPostId}</span>}
                        {report.targetListingId && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">Listing #{report.targetListingId}</span>}
                        <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor(report.status)}`}>{report.status}</span>
                    {report.status === "pending" && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => setResolveId(report.id)}>Resolve</Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                          onClick={() => dismiss.mutate({ reportId: report.id })} disabled={dismiss.isPending}>Dismiss</Button>
                      </>
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

      <Dialog open={resolveId !== null} onOpenChange={() => { setResolveId(null); setResolution(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve Report</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Describe the resolution taken for this report.</p>
            <Input placeholder="Resolution..." value={resolution} onChange={(e) => setResolution(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResolveId(null); setResolution(""); }}>Cancel</Button>
            <Button onClick={() => resolveId && resolve.mutate({ reportId: resolveId, resolution })} disabled={resolve.isPending || !resolution.trim()}>
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
