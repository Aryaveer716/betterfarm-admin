import { Fragment, useState } from "react";
import { useRoute, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import {
  ArrowLeft,
  Edit,
  CheckCircle,
  AlertCircle,
  Pause,
  Loader2,
} from "lucide-react";
import { RecoveryStatsTable } from "@/components/RecoveryStatsTable";
import { KnownIssueForm } from "@/components/KnownIssueForm";

const STATUS_BADGE: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  acknowledged: "bg-yellow-100 text-yellow-700",
  investigating: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
};

const OCC_LIMIT = 20;

export default function HealthDetail() {
  const [, params] = useRoute<{ fingerprint: string }>("/health/:fingerprint");
  const fingerprint = decodeURIComponent(params?.fingerprint ?? "");

  const [editOpen, setEditOpen] = useState(false);
  const [occPage, setOccPage] = useState(1);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const utils = trpc.useUtils();

  const detailQ = trpc.adminHealth.getIssueDetail.useQuery(
    { fingerprint },
    { enabled: fingerprint.length > 0 },
  );
  const occQ = trpc.adminHealth.getIssueOccurrences.useQuery(
    { fingerprint, limit: OCC_LIMIT, offset: (occPage - 1) * OCC_LIMIT },
    { enabled: fingerprint.length > 0 },
  );
  const recoveryQ = trpc.adminHealth.getRecoveryStatsForFingerprint.useQuery(
    { fingerprint },
    { enabled: fingerprint.length > 0 },
  );

  const updateStatus = trpc.adminHealth.updateKnownIssueStatus.useMutation({
    onSuccess: () => {
      void utils.adminHealth.getIssueDetail.invalidate({ fingerprint });
      toast.success("Status updated");
    },
    onError: (err: { message: string }) => toast.error(err.message),
  });

  if (!fingerprint) {
    return (
      <div className="p-6 text-muted-foreground">Missing fingerprint in URL.</div>
    );
  }

  if (detailQ.isLoading) {
    return (
      <div className="p-6 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }
  if (!detailQ.data) {
    return <div className="p-6 text-muted-foreground">Issue not found.</div>;
  }

  const issue = detailQ.data.issue;
  const sparkline = detailQ.data.sparkline.map(
    (b: { tsHour: string; count: number }) => ({
      hour: b.tsHour.slice(11, 13) + ":00",
      count: b.count,
    }),
  );
  const occ = occQ.data?.rows ?? [];
  const occTotal = occQ.data?.total ?? 0;
  const occPages = Math.max(1, Math.ceil(occTotal / OCC_LIMIT));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/health"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to list
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2 flex-1 min-w-[280px]">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  className={STATUS_BADGE[issue.status] ?? ""}
                  variant="outline"
                >
                  {issue.status}
                </Badge>
                <Badge variant="outline">{issue.kind}</Badge>
              </div>
              <h1 className="text-2xl font-bold">{issue.title}</h1>
              <p className="font-mono text-xs text-muted-foreground break-all">
                {issue.fingerprint}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditOpen(true)}
              >
                <Edit className="w-3 h-3" /> Edit
              </Button>
              {issue.status === "open" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updateStatus.isPending}
                  onClick={() =>
                    updateStatus.mutate({
                      id: issue.id,
                      status: "acknowledged",
                    })
                  }
                >
                  <AlertCircle className="w-3 h-3" /> Acknowledge
                </Button>
              )}
              {issue.status !== "investigating" &&
                issue.status !== "resolved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updateStatus.isPending}
                    onClick={() =>
                      updateStatus.mutate({
                        id: issue.id,
                        status: "investigating",
                      })
                    }
                  >
                    <Pause className="w-3 h-3" /> Investigate
                  </Button>
                )}
              {issue.status !== "resolved" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updateStatus.isPending}
                  onClick={() =>
                    updateStatus.mutate({ id: issue.id, status: "resolved" })
                  }
                >
                  <CheckCircle className="w-3 h-3" /> Resolve
                </Button>
              )}
              {issue.status === "resolved" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updateStatus.isPending}
                  onClick={() =>
                    updateStatus.mutate({ id: issue.id, status: "open" })
                  }
                >
                  Re-open
                </Button>
              )}
            </div>
          </div>

          {issue.description && (
            <div className="rounded border p-3 bg-muted/30">
              <p className="text-xs uppercase text-muted-foreground mb-1">
                Internal notes
              </p>
              <p className="text-sm whitespace-pre-wrap">{issue.description}</p>
            </div>
          )}
          {issue.farmerMessage && (
            <div className="rounded border p-3 bg-amber-50">
              <p className="text-xs uppercase text-amber-900 mb-1">
                Farmer message (pending Slice E)
              </p>
              <p className="text-sm whitespace-pre-wrap">{issue.farmerMessage}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Hits per hour (last 24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sparkline}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-muted"
                  />
                  <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Hit count" value={issue.hitCount.toLocaleString()} />
            <Row
              label="Affected users"
              value={issue.affectedUsers.toLocaleString()}
            />
            <Row
              label="Recovery success"
              value={
                issue.recoverySuccessRate !== null &&
                issue.recoverySuccessRate !== undefined
                  ? `${issue.recoverySuccessRate}%`
                  : "—"
              }
            />
            <Row
              label="First seen"
              value={
                issue.firstSeen
                  ? format(new Date(issue.firstSeen), "PP p")
                  : "—"
              }
            />
            <Row
              label="Last seen"
              value={
                issue.lastSeen
                  ? formatDistanceToNow(new Date(issue.lastSeen), {
                      addSuffix: true,
                    })
                  : "—"
              }
            />
          </CardContent>
        </Card>
      </div>

      {recoveryQ.data && (
        <RecoveryStatsTable
          byAction={recoveryQ.data.byAction}
          total={recoveryQ.data.total}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent occurrences</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {occQ.isLoading ? (
            <div className="p-6 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : occ.length === 0 ? (
            <div className="p-6 text-muted-foreground text-sm">
              No occurrences in DB.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Screen</TableHead>
                  <TableHead>Error code</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Connectivity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {occ.map(
                  (row: {
                    id: number;
                    occurredAt: Date | string;
                    screenName: string | null;
                    errorCode: string | null;
                    userId: number | null;
                    platform: string;
                    connectivity: string;
                    context: unknown;
                  }) => (
                    <Fragment key={row.id}>
                      <TableRow
                        className="cursor-pointer hover:bg-muted/30"
                        onClick={() =>
                          setExpanded((m) => ({ ...m, [row.id]: !m[row.id] }))
                        }
                      >
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(row.occurredAt), {
                            addSuffix: true,
                          })}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.screenName ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs font-mono">
                          {row.errorCode ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {row.userId ?? "anon"}
                        </TableCell>
                        <TableCell className="text-xs">{row.platform}</TableCell>
                        <TableCell className="text-xs">
                          {row.connectivity}
                        </TableCell>
                      </TableRow>
                      {expanded[row.id] && row.context !== null && row.context !== undefined && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-muted/30">
                            <pre className="text-xs overflow-auto whitespace-pre-wrap">
                              {JSON.stringify(row.context, null, 2)}
                            </pre>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ),
                )}
              </TableBody>
            </Table>
          )}
          <div className="p-4 flex items-center justify-between border-t">
            <div className="text-sm text-muted-foreground">
              {occTotal === 0
                ? "0"
                : `${(occPage - 1) * OCC_LIMIT + 1}–${Math.min(
                    occPage * OCC_LIMIT,
                    occTotal,
                  )} of ${occTotal}`}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOccPage((p) => Math.max(1, p - 1))}
                disabled={occPage === 1}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOccPage((p) => Math.min(occPages, p + 1))}
                disabled={occPage >= occPages}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <KnownIssueForm
        issue={issue}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => {
          void utils.adminHealth.getIssueDetail.invalidate({ fingerprint });
          void utils.adminHealth.getOpenIssues.invalidate();
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
