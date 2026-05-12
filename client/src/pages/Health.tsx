import { useState, useEffect } from "react";
import { Link } from "wouter";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Search,
  Activity,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";

type Status = "open" | "acknowledged" | "investigating" | "resolved" | "all";
type Kind = "render_error" | "network_error" | "auth_expired" | "all";
type SortBy = "hitCount" | "lastSeen" | "affectedUsers";

const STATUS_LABELS: Record<Status, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  investigating: "Investigating",
  resolved: "Resolved",
  all: "All",
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  acknowledged: "bg-yellow-100 text-yellow-700",
  investigating: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
};

const LIMIT = 25;

export default function Health() {
  const [status, setStatus] = useState<Status>("open");
  const [kind, setKind] = useState<Kind>("all");
  const [sortBy, setSortBy] = useState<SortBy>("hitCount");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const utils = trpc.useUtils();

  // Debounce search 300ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading } = trpc.adminHealth.getOpenIssues.useQuery({
    status,
    kind,
    sortBy,
    limit: LIMIT,
    offset: (page - 1) * LIMIT,
    search: debouncedSearch || undefined,
  });

  const updateStatus = trpc.adminHealth.updateKnownIssueStatus.useMutation({
    onSuccess: () => {
      void utils.adminHealth.getOpenIssues.invalidate();
      toast.success("Status updated");
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Activity className="w-6 h-6" /> App Health
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Open issues from in-app anomalies, ranked by recent activity.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status pills */}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
              <Button
                key={s}
                size="sm"
                variant={status === s ? "default" : "outline"}
                onClick={() => {
                  setStatus(s);
                  setPage(1);
                }}
              >
                {STATUS_LABELS[s]}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            {/* Kind dropdown */}
            <Select
              value={kind}
              onValueChange={(v) => {
                setKind(v as Kind);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kinds</SelectItem>
                <SelectItem value="render_error">Render error</SelectItem>
                <SelectItem value="network_error">Network error</SelectItem>
                <SelectItem value="auth_expired">Auth expired</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hitCount">Sort by hits</SelectItem>
                <SelectItem value="lastSeen">Sort by recency</SelectItem>
                <SelectItem value="affectedUsers">Sort by affected users</SelectItem>
              </SelectContent>
            </Select>

            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search title or fingerprint..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No open issues right now.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Fingerprint</TableHead>
                  <TableHead className="text-right">Hits</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead className="text-right">Recovery</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row: {
                  id: number;
                  status: string;
                  kind: string;
                  title: string;
                  fingerprint: string;
                  hitCount: number;
                  affectedUsers: number;
                  lastSeen: Date | string | null;
                  recoverySuccessRate: number | null;
                }) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Badge
                        className={STATUS_BADGE[row.status] ?? ""}
                        variant="outline"
                      >
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{row.kind}</TableCell>
                    <TableCell>
                      <Link
                        href={`/health/${encodeURIComponent(row.fingerprint)}`}
                        className="text-primary hover:underline font-medium"
                      >
                        {row.title}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[280px] truncate">
                      {row.fingerprint}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.hitCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.affectedUsers.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.lastSeen
                        ? formatDistanceToNow(new Date(row.lastSeen), {
                            addSuffix: true,
                          })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.recoverySuccessRate !== null &&
                      row.recoverySuccessRate !== undefined
                        ? `${row.recoverySuccessRate}%`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {row.status === "open" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updateStatus.isPending}
                            onClick={() =>
                              updateStatus.mutate({
                                id: row.id,
                                status: "acknowledged",
                              })
                            }
                          >
                            <AlertCircle className="w-3 h-3" /> Ack
                          </Button>
                        )}
                        {row.status !== "resolved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updateStatus.isPending}
                            onClick={() =>
                              updateStatus.mutate({
                                id: row.id,
                                status: "resolved",
                              })
                            }
                          >
                            <CheckCircle className="w-3 h-3" /> Resolve
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="p-4 flex items-center justify-between border-t">
            <div className="text-sm text-muted-foreground">
              {total === 0
                ? "0"
                : `${(page - 1) * LIMIT + 1}–${Math.min(
                    page * LIMIT,
                    total,
                  )} of ${total}`}
            </div>
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
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
