import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Bug } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const severityColor = (s: string | null) => {
  if (s === "critical") return "bg-red-100 text-red-700";
  if (s === "high") return "bg-orange-100 text-orange-700";
  if (s === "medium") return "bg-yellow-100 text-yellow-700";
  return "bg-green-100 text-green-700";
};

const statusColor = (s: string) => {
  if (s === "pending") return "bg-yellow-100 text-yellow-700";
  if (s === "reviewed") return "bg-blue-100 text-blue-700";
  return "bg-green-100 text-green-700";
};

export default function DiseaseDetection() {
  const [status, setStatus] = useState<"all" | "pending" | "reviewed" | "resolved">("all");
  const [page, setPage] = useState(1);
  const [resolveId, setResolveId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.getDetections.useQuery({ status, page, limit: 20 });

  const resolve = trpc.admin.resolveDetection.useMutation({
    onSuccess: () => { toast.success("Detection resolved"); setResolveId(null); setNotes(""); utils.admin.getDetections.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Disease Detection</h1>
        <p className="text-muted-foreground text-sm mt-1">Review AI-powered crop disease scan results</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{data?.total ?? 0} total detections</p>
            <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded" />)}</div>
          ) : data?.detections?.length === 0 ? (
            <div className="text-center py-12">
              <Bug className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No disease detections recorded yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {data?.detections?.map((det) => (
                <div key={det.id} className="flex items-start justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 bg-rose-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <Bug className="w-4 h-4 text-rose-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{det.diseaseName ?? "Unknown Disease"}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {det.cropType && <span className="text-xs text-muted-foreground">{det.cropType}</span>}
                        {det.confidence && <span className="text-xs text-muted-foreground">· {(det.confidence * 100).toFixed(0)}% confidence</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {det.severity && <span className={`text-xs px-1.5 py-0.5 rounded-full ${severityColor(det.severity)}`}>{det.severity}</span>}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusColor(det.status)}`}>{det.status}</span>
                        <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(det.createdAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </div>
                  {det.status !== "resolved" && (
                    <Button size="sm" variant="outline" className="shrink-0 ml-2 h-7 text-xs"
                      onClick={() => setResolveId(det.id)}>
                      Resolve
                    </Button>
                  )}
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

      <Dialog open={resolveId !== null} onOpenChange={() => { setResolveId(null); setNotes(""); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve Detection</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Add review notes before resolving this detection.</p>
            <Input placeholder="Review notes..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResolveId(null); setNotes(""); }}>Cancel</Button>
            <Button onClick={() => resolveId && resolve.mutate({ detectionId: resolveId, notes })} disabled={resolve.isPending || !notes.trim()}>
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
