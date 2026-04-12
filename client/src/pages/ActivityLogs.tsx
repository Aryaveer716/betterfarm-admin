import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const actionColor = (action: string) => {
  if (action.toLowerCase().includes("delete") || action.toLowerCase().includes("remove") || action.toLowerCase().includes("ban")) return "bg-red-100 text-red-700";
  if (action.toLowerCase().includes("approve") || action.toLowerCase().includes("restore") || action.toLowerCase().includes("resolve")) return "bg-green-100 text-green-700";
  if (action.toLowerCase().includes("update") || action.toLowerCase().includes("set")) return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-600";
};

export default function ActivityLogs() {
  const [targetType, setTargetType] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data, isLoading } = trpc.admin.getActivityLogs.useQuery({
    page,
    limit: 30,
    targetType: targetType === "all" ? undefined : targetType,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activity Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">Complete audit trail of all admin actions</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{data?.total ?? 0} total actions logged</p>
            <Select value={targetType} onValueChange={(v) => { setTargetType(v); setPage(1); }}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="user">Users</SelectItem>
                <SelectItem value="farm">Farms</SelectItem>
                <SelectItem value="post">Posts</SelectItem>
                <SelectItem value="listing">Listings</SelectItem>
                <SelectItem value="report">Reports</SelectItem>
                <SelectItem value="ticket">Tickets</SelectItem>
                <SelectItem value="detection">Detections</SelectItem>
                <SelectItem value="flag">Feature Flags</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}</div>
          ) : data?.logs?.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No activity logged yet. Actions taken in the admin portal will appear here.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {data?.logs?.map((log) => (
                <div key={log.id} className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                    <div className="min-w-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full mr-2 ${actionColor(log.action)}`}>
                        {log.action}
                      </span>
                      {log.targetType && (
                        <span className="text-xs text-muted-foreground">
                          {log.targetType} #{log.targetId}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                  </span>
                </div>
              ))}
            </div>
          )}
          {(data?.total ?? 0) > 30 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">Page {page}</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={page * 30 >= (data?.total ?? 0)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
