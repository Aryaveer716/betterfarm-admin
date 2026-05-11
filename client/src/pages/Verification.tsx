import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  CheckCircle,
  XCircle,
  BadgeCheck,
  MapPin,
  Sprout,
  FileText,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type StatusFilter =
  | "all"
  | "not_verified"
  | "pending_review"
  | "more_info_required"
  | "better_farm_verified"
  | "organic_verified"
  | "government_verified"
  | "claim_unverified"
  | "rejected";

type ActionKind =
  | { kind: "approve"; id: number; farmName: string }
  | { kind: "reject"; id: number; farmName: string }
  | { kind: "more_info"; id: number; farmName: string }
  | null;

const STATUS_VARIANT: Record<string, "outline" | "destructive" | "default"> = {
  pending_review: "outline",
  more_info_required: "outline",
  better_farm_verified: "default",
  organic_verified: "default",
  government_verified: "default",
  rejected: "destructive",
  claim_unverified: "destructive",
  not_verified: "outline",
};

function parseJsonArray(s: string | null): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export default function Verification() {
  const [status, setStatus] = useState<StatusFilter>("pending_review");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [action, setAction] = useState<ActionKind>(null);
  const [actionText, setActionText] = useState("");
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.listVerificationRequests.useQuery({
    status,
    page,
    limit: 20,
  });
  const { data: detail } = trpc.admin.getVerificationRequest.useQuery(
    { id: selected ?? -1 },
    { enabled: selected !== null },
  );

  const onSettled = () => {
    void utils.admin.listVerificationRequests.invalidate();
    void utils.admin.getVerificationRequest.invalidate();
    setAction(null);
    setActionText("");
  };

  const approve = trpc.admin.approveVerificationRequest.useMutation({
    onSuccess: () => { toast.success("Verification approved"); onSettled(); },
    onError: (e) => toast.error(e.message),
  });
  const reject = trpc.admin.rejectVerificationRequest.useMutation({
    onSuccess: () => { toast.success("Verification rejected"); onSettled(); },
    onError: (e) => toast.error(e.message),
  });
  const requestMoreInfo = trpc.admin.requestMoreInfoOnVerification.useMutation({
    onSuccess: () => { toast.success("More-info request sent"); onSettled(); },
    onError: (e) => toast.error(e.message),
  });

  const isPending = approve.isPending || reject.isPending || requestMoreInfo.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Verification</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review farmer verification requests. Approve / reject / request more info — every action audit-logged.
          You cannot act on your own request (self-approval blocked).
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{data?.total ?? 0} request{data?.total === 1 ? "" : "s"}</CardTitle>
            <Select value={status} onValueChange={(v) => { setStatus(v as StatusFilter); setPage(1); }}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending_review">Pending review</SelectItem>
                <SelectItem value="more_info_required">More info required</SelectItem>
                <SelectItem value="better_farm_verified">BetterFarm verified</SelectItem>
                <SelectItem value="organic_verified">Organic verified</SelectItem>
                <SelectItem value="government_verified">Gov verified</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="claim_unverified">Claim unverified</SelectItem>
                <SelectItem value="not_verified">Not verified</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-24 bg-muted animate-pulse rounded" />
              ))}
            </div>
          )}

          {!isLoading && (data?.requests.length ?? 0) === 0 && (
            <div className="text-center py-12">
              <BadgeCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No requests for this filter.</p>
            </div>
          )}

          <div className="space-y-3">
            {data?.requests.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r.id)}
                className="w-full text-left p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center shrink-0">
                      <Sprout className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{r.farmName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        Owner: {r.ownerName}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {r.village ? `${r.village}, ` : ""}{r.district}, {r.state}
                        </span>
                        {r.farmType && <span className="text-xs text-muted-foreground">Type: {r.farmType}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant={STATUS_VARIANT[r.badgeStatus] ?? "outline"} className="text-xs">
                          {r.badgeStatus.replace(/_/g, " ")}
                        </Badge>
                        {r.trustScore > 0 && (
                          <Badge variant="outline" className="text-xs">trust {r.trustScore}</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          submitted {formatDistanceToNow(new Date(r.createdAt))} ago
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {data && data.total > 20 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">
                Page {page} of {Math.ceil(data.total / 20)} · {data.total} total
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

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail ? detail.farmName : "Loading…"}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant={STATUS_VARIANT[detail.badgeStatus] ?? "outline"}>
                  {detail.badgeStatus.replace(/_/g, " ")}
                </Badge>
                {detail.trustScore > 0 && (
                  <Badge variant="outline">trust score {detail.trustScore}/100</Badge>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Owner</Label>
                  <p>{detail.ownerName}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Contact</Label>
                  <p>{detail.contactNumber || "—"} · {detail.email || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Location</Label>
                  <p>{detail.village ? `${detail.village}, ` : ""}{detail.district}, {detail.state}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Farm type</Label>
                  <p>{detail.farmType || "—"}</p>
                </div>
                {detail.address && (
                  <div className="md:col-span-2">
                    <Label className="text-xs text-muted-foreground">Address</Label>
                    <p>{detail.address}</p>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Products grown</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {parseJsonArray(detail.productsGrown).map((p) => (
                    <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
                  ))}
                  {parseJsonArray(detail.productsGrown).length === 0 && (
                    <span className="text-xs text-muted-foreground">none listed</span>
                  )}
                </div>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground">Claims selected for verification</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {parseJsonArray(detail.selectedClaims).map((c) => (
                    <Badge key={c} variant="outline" className="text-xs">
                      <BadgeCheck className="w-3 h-3 mr-1" />{c}
                    </Badge>
                  ))}
                  {parseJsonArray(detail.selectedClaims).length === 0 && (
                    <span className="text-xs text-muted-foreground">none</span>
                  )}
                </div>
              </div>

              <div className="border border-border rounded-lg p-3 bg-muted/20">
                <Label className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                  <FileText className="w-3 h-3" />
                  Documents & registrations
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  {detail.fssaiNumber && <div><strong>FSSAI:</strong> {detail.fssaiNumber}</div>}
                  {detail.panGstNumber && <div><strong>PAN/GST:</strong> {detail.panGstNumber}</div>}
                  {detail.fpoMembershipNumber && <div><strong>FPO #:</strong> {detail.fpoMembershipNumber}</div>}
                  {detail.apedaCertNumber && <div><strong>APEDA cert:</strong> {detail.apedaCertNumber}</div>}
                  {detail.pgsIndiaNumber && <div><strong>PGS India:</strong> {detail.pgsIndiaNumber}</div>}
                  {detail.jaivikBharatNumber && <div><strong>Jaivik Bharat:</strong> {detail.jaivikBharatNumber}</div>}
                  {detail.stateAgriRegNumber && <div><strong>State Agri reg:</strong> {detail.stateAgriRegNumber}</div>}
                  {detail.websiteUrl && <div><strong>Website:</strong> {detail.websiteUrl}</div>}
                </div>
                {parseJsonArray(detail.photoUrls).length > 0 && (
                  <p className="text-xs mt-2"><strong>{parseJsonArray(detail.photoUrls).length}</strong> photos uploaded</p>
                )}
                {parseJsonArray(detail.documentUrls).length > 0 && (
                  <p className="text-xs"><strong>{parseJsonArray(detail.documentUrls).length}</strong> documents uploaded</p>
                )}
              </div>

              {detail.adminNotes && (
                <div className="border border-border rounded-lg p-3 bg-blue-50/30 dark:bg-blue-950/20">
                  <Label className="text-xs text-muted-foreground mb-1 block">Admin notes</Label>
                  <p className="text-sm whitespace-pre-wrap">{detail.adminNotes}</p>
                </div>
              )}

              {detail.moreInfoRequested && (
                <div className="border border-border rounded-lg p-3 bg-yellow-50/30 dark:bg-yellow-950/20">
                  <Label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                    <HelpCircle className="w-3 h-3" />
                    More info requested
                  </Label>
                  <p className="text-sm whitespace-pre-wrap">{detail.moreInfoRequested}</p>
                </div>
              )}

              {detail.rejectionReason && (
                <div className="border border-border rounded-lg p-3 bg-red-50/30 dark:bg-red-950/20">
                  <Label className="text-xs text-muted-foreground mb-1 block flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Rejection reason
                  </Label>
                  <p className="text-sm whitespace-pre-wrap">{detail.rejectionReason}</p>
                </div>
              )}

              {detail.badgeStatus !== "rejected" && detail.badgeStatus !== "better_farm_verified" && detail.badgeStatus !== "organic_verified" && detail.badgeStatus !== "government_verified" && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  <Button
                    onClick={() => setAction({ kind: "approve", id: detail.id, farmName: detail.farmName })}
                    disabled={isPending}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setAction({ kind: "more_info", id: detail.id, farmName: detail.farmName })}
                    disabled={isPending}
                  >
                    <HelpCircle className="w-4 h-4 mr-1" />
                    Request more info
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setAction({ kind: "reject", id: detail.id, farmName: detail.farmName })}
                    disabled={isPending}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                </div>
              )}
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
              {action?.kind === "approve" && `Approve ${action.farmName}`}
              {action?.kind === "reject" && `Reject ${action.farmName}`}
              {action?.kind === "more_info" && `Request more info from ${action.farmName}`}
            </DialogTitle>
          </DialogHeader>
          {action?.kind === "approve" && (
            <div className="space-y-2">
              <Label className="text-sm">Notes (optional)</Label>
              <Textarea
                placeholder="Internal notes about this approval"
                value={actionText}
                onChange={(e) => setActionText(e.target.value)}
                rows={3}
                maxLength={2000}
              />
            </div>
          )}
          {action?.kind === "reject" && (
            <div className="space-y-2">
              <Label className="text-sm">Rejection reason</Label>
              <Textarea
                placeholder="Reason visible to the farmer (required)"
                value={actionText}
                onChange={(e) => setActionText(e.target.value)}
                rows={3}
                maxLength={2000}
              />
            </div>
          )}
          {action?.kind === "more_info" && (
            <div className="space-y-2">
              <Label className="text-sm">Information needed</Label>
              <Textarea
                placeholder="Specific docs/details needed (visible to farmer; required)"
                value={actionText}
                onChange={(e) => setActionText(e.target.value)}
                rows={4}
                maxLength={2000}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAction(null); setActionText(""); }}>
              Cancel
            </Button>
            <Button
              variant={action?.kind === "reject" ? "destructive" : "default"}
              className={action?.kind === "approve" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
              disabled={
                isPending ||
                (action?.kind !== "approve" && actionText.trim() === "")
              }
              onClick={() => {
                if (!action) return;
                if (action.kind === "approve") {
                  approve.mutate({ id: action.id, notes: actionText.trim() || null });
                  return;
                }
                if (action.kind === "reject") {
                  reject.mutate({ id: action.id, reason: actionText.trim() });
                  return;
                }
                if (action.kind === "more_info") {
                  requestMoreInfo.mutate({ id: action.id, moreInfoRequested: actionText.trim() });
                  return;
                }
              }}
            >
              {action?.kind === "approve" ? "Approve" : action?.kind === "reject" ? "Reject" : "Send request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
