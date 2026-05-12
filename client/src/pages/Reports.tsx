import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Flag, MessageSquare, MessageCircle, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type ReportStatus = "all" | "pending" | "reviewed" | "dismissed" | "action_taken";
type ContentType = "all" | "post" | "comment";
type ActionKind =
  | { kind: "content"; id: number; status: "reviewed" | "dismissed" | "action_taken" }
  | { kind: "message"; id: number; status: "reviewed" | "dismissed" | "action_taken" }
  | null;

const STATUS_VARIANT: Record<string, "outline" | "destructive" | "default"> = {
  pending: "destructive",
  reviewed: "default",
  action_taken: "default",
  dismissed: "outline",
};

export default function Reports() {
  const [tab, setTab] = useState<"content" | "messages">("content");
  const [status, setStatus] = useState<ReportStatus>("pending");
  const [contentType, setContentType] = useState<ContentType>("all");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<ActionKind>(null);
  const [reviewNote, setReviewNote] = useState("");
  const utils = trpc.useUtils();

  const { data: contentData, isLoading: contentLoading } = trpc.admin.listContentReports.useQuery(
    { status, contentType, page, limit: 20 },
    { enabled: tab === "content" },
  );
  const { data: messageData, isLoading: messageLoading } = trpc.admin.listMessageReports.useQuery(
    { status, page, limit: 20 },
    { enabled: tab === "messages" },
  );

  const closeAction = () => {
    setAction(null);
    setReviewNote("");
  };

  const onSettled = () => {
    void utils.admin.listContentReports.invalidate();
    void utils.admin.listMessageReports.invalidate();
    closeAction();
  };

  const updateContent = trpc.admin.updateContentReportStatus.useMutation({
    onSuccess: (res) => { toast.success(`Status: ${res.oldStatus} → ${res.newStatus}`); onSettled(); },
    onError: (e) => toast.error(e.message),
  });
  const updateMessage = trpc.admin.updateMessageReportStatus.useMutation({
    onSuccess: (res) => { toast.success(`Status: ${res.oldStatus} → ${res.newStatus}`); onSettled(); },
    onError: (e) => toast.error(e.message),
  });

  const isPending = updateContent.isPending || updateMessage.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Review user-submitted reports. Content reports = posts + comments. Message reports = DMs.
          Every status change is audit-logged.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as "content" | "messages");
          setPage(1);
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="content">
              Content
              {(contentData?.total ?? 0) > 0 && status === "pending" && (
                <Badge variant="destructive" className="ml-2 text-xs">{contentData?.total}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="messages">
              Messages
              {(messageData?.total ?? 0) > 0 && status === "pending" && (
                <Badge variant="destructive" className="ml-2 text-xs">{messageData?.total}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-2 sm:ml-auto">
            <Select value={status} onValueChange={(v) => { setStatus(v as ReportStatus); setPage(1); }}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="action_taken">Action taken</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
            {tab === "content" && (
              <Select value={contentType} onValueChange={(v) => { setContentType(v as ContentType); setPage(1); }}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any type</SelectItem>
                  <SelectItem value="post">Posts</SelectItem>
                  <SelectItem value="comment">Comments</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <TabsContent value="content">
          <Card>
            <CardContent className="pt-4">
              {contentLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded" />)}
                </div>
              )}
              {!contentLoading && (contentData?.reports.length ?? 0) === 0 && (
                <div className="text-center py-12">
                  <Flag className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No content reports for this filter.</p>
                </div>
              )}
              <div className="space-y-2">
                {contentData?.reports.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 bg-red-50 dark:bg-red-950/30 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                          <Flag className="w-4 h-4 text-red-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{r.reason}</span>
                            <Badge variant="outline" className="text-xs">
                              <MessageSquare className="w-3 h-3 mr-1" />{r.contentType} #{r.contentId}
                            </Badge>
                            <Badge variant={STATUS_VARIANT[r.status] ?? "outline"} className="text-xs">
                              {r.status.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          {r.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>by {r.reporterName || `reporter #${r.reporterId}`}</span>
                            <span>· {formatDistanceToNow(new Date(r.createdAt))} ago</span>
                          </div>
                          {r.reviewNote && (
                            <p className="text-xs text-muted-foreground mt-1 italic">Note: {r.reviewNote}</p>
                          )}
                        </div>
                      </div>
                      {r.status === "pending" && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs bg-green-600 hover:bg-green-700"
                            onClick={() => setAction({ kind: "content", id: r.id, status: "action_taken" })}
                            disabled={isPending}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />Action taken
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setAction({ kind: "content", id: r.id, status: "reviewed" })}
                            disabled={isPending}
                          >
                            <AlertTriangle className="w-3 h-3 mr-1" />Reviewed
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => setAction({ kind: "content", id: r.id, status: "dismissed" })}
                            disabled={isPending}
                          >
                            <XCircle className="w-3 h-3 mr-1" />Dismiss
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {contentData && contentData.total > 20 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-muted-foreground">
                    Page {page} of {Math.ceil(contentData.total / 20)} · {contentData.total} reports
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                    <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page * 20 >= contentData.total}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages">
          <Card>
            <CardContent className="pt-4">
              {messageLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded" />)}
                </div>
              )}
              {!messageLoading && (messageData?.reports.length ?? 0) === 0 && (
                <div className="text-center py-12">
                  <MessageCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No message reports for this filter.</p>
                </div>
              )}
              <div className="space-y-2">
                {messageData?.reports.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 bg-blue-50 dark:bg-blue-950/30 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                          <MessageCircle className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{r.reason}</span>
                            <Badge variant="outline" className="text-xs">message #{r.messageId}</Badge>
                            <Badge variant={STATUS_VARIANT[r.status] ?? "outline"} className="text-xs">
                              {r.status.replace(/_/g, " ")}
                            </Badge>
                          </div>
                          {r.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <span>by reporter #{r.reporterId}</span>
                            <span>· {formatDistanceToNow(new Date(r.createdAt))} ago</span>
                          </div>
                        </div>
                      </div>
                      {r.status === "pending" && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs bg-green-600 hover:bg-green-700"
                            onClick={() => setAction({ kind: "message", id: r.id, status: "action_taken" })}
                            disabled={isPending}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />Action taken
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setAction({ kind: "message", id: r.id, status: "reviewed" })}
                            disabled={isPending}
                          >
                            <AlertTriangle className="w-3 h-3 mr-1" />Reviewed
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => setAction({ kind: "message", id: r.id, status: "dismissed" })}
                            disabled={isPending}
                          >
                            <XCircle className="w-3 h-3 mr-1" />Dismiss
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {messageData && messageData.total > 20 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-muted-foreground">
                    Page {page} of {Math.ceil(messageData.total / 20)} · {messageData.total} reports
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                    <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page * 20 >= messageData.total}>Next</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={action !== null} onOpenChange={(open) => !open && closeAction()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.status === "action_taken" && "Mark action taken"}
              {action?.status === "reviewed" && "Mark reviewed"}
              {action?.status === "dismissed" && "Dismiss report"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-sm">Review note (optional)</Label>
            <Textarea
              placeholder="What did you do? (audit-logged)"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAction}>Cancel</Button>
            <Button
              variant={action?.status === "dismissed" ? "outline" : "default"}
              className={action?.status === "action_taken" ? "bg-green-600 hover:bg-green-700" : ""}
              disabled={isPending}
              onClick={() => {
                if (!action) return;
                const note = reviewNote.trim() || null;
                if (action.kind === "content") {
                  updateContent.mutate({ id: action.id, status: action.status, reviewNote: note });
                } else {
                  updateMessage.mutate({ id: action.id, status: action.status, reviewNote: note });
                }
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
