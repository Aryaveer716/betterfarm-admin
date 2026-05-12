import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Bug, CheckCircle, XCircle, RotateCcw, MapPin, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type StatusFilter = "all" | "active" | "resolved" | "ignored";
type SeverityFilter = "all" | "low" | "medium" | "high";
type Action =
  | { id: number; status: "resolved" | "ignored" | "active"; disease: string }
  | null;

const SEVERITY_VARIANT: Record<string, "outline" | "destructive"> = {
  high: "destructive",
  medium: "outline",
  low: "outline",
};
const STATUS_VARIANT: Record<string, "destructive" | "default" | "outline"> = {
  active: "destructive",
  resolved: "default",
  ignored: "outline",
};

export default function DiseaseDetection() {
  const [status, setStatus] = useState<StatusFilter>("active");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [cropSearch, setCropSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [reviewNote, setReviewNote] = useState("");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.listDiseaseDetections.useQuery({
    status,
    severity,
    cropName: cropSearch || undefined,
    page,
    limit: 20,
  });
  const { data: detail } = trpc.admin.getDiseaseDetection.useQuery(
    { id: selected ?? -1 },
    { enabled: selected !== null },
  );

  const onSettled = () => {
    void utils.admin.listDiseaseDetections.invalidate();
    void utils.admin.getDiseaseDetection.invalidate();
    setAction(null);
    setReviewNote("");
  };

  const update = trpc.admin.updateDiseaseDetectionStatus.useMutation({
    onSuccess: (res) => { toast.success(`Status: ${res.oldStatus} → ${res.newStatus}`); onSettled(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Disease Detection</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review AI crop-disease scans submitted by farmers. Mark resolved / ignored. Every action audit-logged.
        </p>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search crop name…"
                value={cropSearch}
                onChange={(e) => { setCropSearch(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={(v) => { setStatus(v as StatusFilter); setPage(1); }}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="ignored">Ignored</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severity} onValueChange={(v) => { setSeverity(v as SeverityFilter); setPage(1); }}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severity</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded" />)}
            </div>
          )}

          {!isLoading && (data?.detections.length ?? 0) === 0 && (
            <div className="text-center py-12">
              <Bug className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No detections.</p>
            </div>
          )}

          <div className="space-y-2">
            {data?.detections.map((det) => (
              <button
                key={det.id}
                type="button"
                onClick={() => setSelected(det.id)}
                className="w-full text-left flex items-start justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-9 h-9 bg-rose-50 dark:bg-rose-950/30 rounded-lg flex items-center justify-center shrink-0">
                    <Bug className="w-4 h-4 text-rose-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{det.predictedDisease}</span>
                      {det.severity && (
                        <Badge variant={SEVERITY_VARIANT[det.severity] ?? "outline"} className="text-xs">
                          {det.severity}
                        </Badge>
                      )}
                      <Badge variant={STATUS_VARIANT[det.status] ?? "outline"} className="text-xs">
                        {det.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-muted-foreground">
                      <span>{det.cropName}</span>
                      <span>· {Number(det.confidence).toFixed(0)}% confidence</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {det.village ? `${det.village}, ` : ""}{det.district}, {det.state}
                      </span>
                      <span>· {formatDistanceToNow(new Date(det.createdAt))} ago</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {data && data.total > 20 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">
                Page {page} of {Math.ceil(data.total / 20)} · {data.total} detections
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page * 20 >= data.total}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail ? detail.predictedDisease : "Loading…"}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {detail.severity && (
                  <Badge variant={SEVERITY_VARIANT[detail.severity] ?? "outline"}>
                    severity: {detail.severity}
                  </Badge>
                )}
                <Badge variant={STATUS_VARIANT[detail.status] ?? "outline"}>status: {detail.status}</Badge>
                <Badge variant="outline">{Number(detail.confidence).toFixed(1)}% confidence</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Crop</Label>
                  <p>{detail.cropName}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Location</Label>
                  <p>{detail.village ? `${detail.village}, ` : ""}{detail.district}, {detail.state}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">User</Label>
                  <p>#{detail.userId ?? "anonymous"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Submitted</Label>
                  <p>{formatDistanceToNow(new Date(detail.createdAt))} ago</p>
                </div>
              </div>

              {detail.imageUrl && (
                <div>
                  <Label className="text-xs text-muted-foreground mb-2 block">Scan image</Label>
                  <img
                    src={detail.imageUrl}
                    alt={detail.predictedDisease}
                    className="rounded-lg border border-border max-h-96 object-contain w-full bg-muted/20"
                  />
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                {detail.status !== "resolved" && (
                  <Button
                    onClick={() => setAction({ id: detail.id, status: "resolved", disease: detail.predictedDisease })}
                    disabled={update.isPending}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />Mark resolved
                  </Button>
                )}
                {detail.status !== "ignored" && (
                  <Button
                    variant="outline"
                    onClick={() => setAction({ id: detail.id, status: "ignored", disease: detail.predictedDisease })}
                    disabled={update.isPending}
                  >
                    <XCircle className="w-4 h-4 mr-1" />Ignore
                  </Button>
                )}
                {detail.status !== "active" && (
                  <Button
                    variant="outline"
                    onClick={() => setAction({ id: detail.id, status: "active", disease: detail.predictedDisease })}
                    disabled={update.isPending}
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />Reopen
                  </Button>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={action !== null} onOpenChange={(open) => !open && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.status === "resolved" && `Resolve "${action.disease}"`}
              {action?.status === "ignored" && `Ignore "${action.disease}"`}
              {action?.status === "active" && `Reopen "${action.disease}"`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Review note (optional)</Label>
            <Textarea
              placeholder="Context (audit-logged)"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAction(null); setReviewNote(""); }}>Cancel</Button>
            <Button
              variant={action?.status === "ignored" ? "outline" : "default"}
              className={action?.status === "resolved" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
              disabled={update.isPending}
              onClick={() => {
                if (!action) return;
                update.mutate({ id: action.id, status: action.status, reviewNote: reviewNote.trim() || null });
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
