import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Mail, AlertOctagon, Sparkles, Lock, ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type StatusFilter = "all" | "unread" | "read" | "processing" | "responded" | "archived";
type CategoryFilter = "all" | "support" | "farmer_onboarding" | "investor" | "partnership" | "spam" | "other";
type UrgencyFilter = "all" | "low" | "medium" | "high" | "critical";
type EmailStatus = "unread" | "read" | "processing" | "responded" | "archived";

const STATUS_LABELS: Record<EmailStatus, string> = {
  unread: "Unread",
  read: "Read",
  processing: "Processing",
  responded: "Responded",
  archived: "Archived",
};

const URGENCY_VARIANT: Record<string, "outline" | "destructive"> = {
  critical: "destructive",
  high: "destructive",
  medium: "outline",
  low: "outline",
};

export default function Support() {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [urgency, setUrgency] = useState<UrgencyFilter>("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.admin.listSupportEmails.useQuery({
    status,
    category,
    urgency,
    page,
    limit: 20,
  });
  const { data: detail } = trpc.admin.getSupportEmail.useQuery(
    { id: selected ?? -1 },
    { enabled: selected !== null },
  );

  const updateStatus = trpc.admin.updateSupportEmailStatus.useMutation({
    onSuccess: (res) => {
      toast.success(`Status: ${res.oldStatus} → ${res.newStatus}`);
      void utils.admin.listSupportEmails.invalidate();
      void utils.admin.getSupportEmail.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const closeDetail = () => setSelected(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Support — Inbox</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Inbound support emails parsed from Gmail. View AI classification, change status, and
          archive. SMTP reply and AI draft approval are managed in the main app.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inbox</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            <Select value={status} onValueChange={(v) => { setStatus(v as StatusFilter); setPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="unread">Unread</SelectItem>
                <SelectItem value="read">Read</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="responded">Responded</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={category} onValueChange={(v) => { setCategory(v as CategoryFilter); setPage(1); }}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                <SelectItem value="support">Support</SelectItem>
                <SelectItem value="farmer_onboarding">Farmer onboarding</SelectItem>
                <SelectItem value="investor">Investor</SelectItem>
                <SelectItem value="partnership">Partnership</SelectItem>
                <SelectItem value="spam">Spam</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={urgency} onValueChange={(v) => { setUrgency(v as UrgencyFilter); setPage(1); }}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Urgency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All urgency</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded" />
              ))}
            </div>
          )}

          {!isLoading && (data?.emails.length ?? 0) === 0 && (
            <p className="text-center text-muted-foreground py-8">No emails match these filters.</p>
          )}

          <div className="space-y-2">
            {data?.emails.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => setSelected(e.id)}
                className="w-full text-left flex items-start justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                    <Mail className="w-4 h-4 text-orange-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{e.subject}</span>
                      {e.aiEscalationFlag && (
                        <Badge variant="destructive" className="text-xs">
                          <ShieldAlert className="w-3 h-3 mr-1" />
                          escalate
                        </Badge>
                      )}
                      {e.isSensitive && (
                        <Badge variant="outline" className="text-xs">
                          <Lock className="w-3 h-3 mr-1" />
                          sensitive
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {e.fromName ? `${e.fromName} · ` : ""}{e.fromEmail}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {e.body.replace(/\s+/g, " ").trim().slice(0, 140)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2 flex-wrap justify-end">
                  {e.urgency && (
                    <Badge variant={URGENCY_VARIANT[e.urgency] ?? "outline"} className="text-xs">
                      {e.urgency}
                    </Badge>
                  )}
                  {e.category && (
                    <Badge variant="outline" className="text-xs">{e.category}</Badge>
                  )}
                  <Badge variant={e.status === "unread" ? "destructive" : "outline"} className="text-xs">
                    {STATUS_LABELS[e.status]}
                  </Badge>
                  <span className="text-xs text-muted-foreground hidden md:inline">
                    {formatDistanceToNow(new Date(e.receivedAt))} ago
                  </span>
                </div>
              </button>
            ))}
          </div>

          {data && data.total > 20 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">
                Page {page} of {Math.ceil(data.total / 20)} · {data.total} emails
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * 20 >= data.total}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {detail ? detail.subject : "Loading…"}
            </DialogTitle>
          </DialogHeader>

          {detail && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                {detail.urgency && (
                  <Badge variant={URGENCY_VARIANT[detail.urgency] ?? "outline"}>
                    urgency: {detail.urgency}
                  </Badge>
                )}
                {detail.category && <Badge variant="outline">category: {detail.category}</Badge>}
                {detail.intent && <Badge variant="outline">intent: {detail.intent}</Badge>}
                {detail.isSensitive && (
                  <Badge variant="outline">
                    <Lock className="w-3 h-3 mr-1" />
                    sensitive
                  </Badge>
                )}
                <Badge variant={detail.status === "unread" ? "destructive" : "outline"}>
                  status: {STATUS_LABELS[detail.status]}
                </Badge>
              </div>

              <div className="text-xs text-muted-foreground">
                <p>
                  <strong>From:</strong> {detail.fromName ? `${detail.fromName} ` : ""}&lt;{detail.fromEmail}&gt;
                </p>
                <p>
                  <strong>Received:</strong>{" "}
                  {formatDistanceToNow(new Date(detail.receivedAt))} ago ·{" "}
                  {new Date(detail.receivedAt).toLocaleString()}
                </p>
                {detail.threadId && <p><strong>Thread:</strong> <code>{detail.threadId}</code></p>}
              </div>

              <div className="border border-border rounded-lg p-3 bg-muted/20">
                <p className="text-xs font-medium text-muted-foreground mb-2">Body</p>
                <pre className="whitespace-pre-wrap text-sm font-sans">{detail.body}</pre>
              </div>

              {detail.aiResponseGenerated && detail.aiResponseText && (
                <div className="border border-border rounded-lg p-3 bg-blue-50/30 dark:bg-blue-950/20">
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    AI draft response (read-only — approve via main app)
                    {detail.aiConfidenceScore !== null && (
                      <span className="ml-auto">confidence {detail.aiConfidenceScore}%</span>
                    )}
                  </p>
                  <pre className="whitespace-pre-wrap text-sm font-sans">{detail.aiResponseText}</pre>
                  {detail.aiAutoSendBlocked && (
                    <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                      <AlertOctagon className="w-3 h-3" />
                      Auto-send blocked: {detail.aiBlockReason || "safety rule"}
                    </p>
                  )}
                </div>
              )}

              {detail.manualResponseText && (
                <div className="border border-border rounded-lg p-3 bg-green-50/30 dark:bg-green-950/20">
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Sent reply
                    {detail.manualResponseSentAt && (
                      <span className="ml-2">
                        · {formatDistanceToNow(new Date(detail.manualResponseSentAt))} ago
                      </span>
                    )}
                  </p>
                  <pre className="whitespace-pre-wrap text-sm font-sans">{detail.manualResponseText}</pre>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium">Change status</p>
                <div className="flex flex-wrap gap-2">
                  {(["unread", "read", "processing", "responded", "archived"] as const).map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={detail.status === s ? "default" : "outline"}
                      disabled={updateStatus.isPending || detail.status === s}
                      onClick={() => updateStatus.mutate({ id: detail.id, status: s })}
                    >
                      {STATUS_LABELS[s]}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Status changes are audit-logged.
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDetail}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
