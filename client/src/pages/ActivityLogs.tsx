import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const ACTION_VARIANT = (action: string): "destructive" | "default" | "outline" => {
  const a = action.toLowerCase();
  if (a.includes("delete") || a.includes("remove") || a.includes("ban") || a.includes("reject")) return "destructive";
  if (a.includes("approve") || a.includes("restore") || a.includes("resolve") || a.includes("verified")) return "default";
  return "outline";
};

function safeParseDetails(s: string | null): unknown {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

function summarizeDetails(details: unknown): string {
  if (!details) return "";
  if (typeof details === "string") return details;
  if (typeof details !== "object") return String(details);
  const entries = Object.entries(details as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return entries.join(" · ");
}

export default function ActivityLogs() {
  const [targetType, setTargetType] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [emailFilter, setEmailFilter] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.admin.listAdminAuditLogs.useQuery({
    targetType: targetType === "all" ? undefined : targetType,
    action: actionFilter || undefined,
    adminEmail: emailFilter || undefined,
    page,
    limit: 30,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activity Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Canonical admin audit trail. Every mutation in Phases 1–3 writes a row here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit log ({data?.total ?? 0})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Filter by admin email…"
                value={emailFilter}
                onChange={(e) => { setEmailFilter(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>
            <Input
              placeholder="Filter by action…"
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="w-48"
            />
            <Select value={targetType} onValueChange={(v) => { setTargetType(v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All target types</SelectItem>
                <SelectItem value="user">user</SelectItem>
                <SelectItem value="feature_flag">feature_flag</SelectItem>
                <SelectItem value="operator_tunable">operator_tunable</SelectItem>
                <SelectItem value="forum_post">forum_post</SelectItem>
                <SelectItem value="content_report">content_report</SelectItem>
                <SelectItem value="message_report">message_report</SelectItem>
                <SelectItem value="support_email">support_email</SelectItem>
                <SelectItem value="verification_request">verification_request</SelectItem>
                <SelectItem value="disease_detection">disease_detection</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded" />)}
            </div>
          )}

          {!isLoading && (data?.logs.length ?? 0) === 0 && (
            <div className="text-center py-12">
              <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No audit entries match.</p>
            </div>
          )}

          <div className="space-y-2">
            {data?.logs.map((log) => {
              const details = safeParseDetails(log.details);
              const detailsText = summarizeDetails(details);
              return (
                <div
                  key={log.id}
                  className="p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 bg-slate-50 dark:bg-slate-900/50 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                        <Activity className="w-4 h-4 text-slate-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={ACTION_VARIANT(log.action)} className="text-xs">
                            {log.action}
                          </Badge>
                          {log.targetType && (
                            <Badge variant="outline" className="text-xs">
                              {log.targetType}
                              {log.targetId !== null ? ` #${log.targetId}` : ""}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(log.createdAt))} ago
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          by <code>{log.adminEmail}</code>
                          {log.ipAddress && <span> · from {log.ipAddress}</span>}
                        </p>
                        {detailsText && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2 font-mono">
                            {detailsText}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {data && data.total > 30 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-muted-foreground">
                Page {page} of {Math.ceil(data.total / 30)} · {data.total} entries
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={page * 30 >= data.total}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
