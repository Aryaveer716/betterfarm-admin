import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ChevronRight } from "lucide-react";

export function HealthSummaryTile() {
  const { data, isLoading } = trpc.adminHealth.getHealthSummary.useQuery(undefined, {
    staleTime: 60_000,
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Activity className="w-4 h-4" /> App Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="h-16 animate-pulse bg-muted/50 rounded" />
        ) : !data ? (
          <p className="text-sm text-muted-foreground">No data</p>
        ) : (
          <>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold tabular-nums">{data.openCount}</span>
              <span className="text-sm text-muted-foreground">open</span>
            </div>
            <p className="text-xs text-muted-foreground">
              +{data.newSinceYesterday} since yesterday
            </p>
            {data.topFingerprint && (
              <Link href={`/health/${encodeURIComponent(data.topFingerprint.fingerprint)}`}>
                <a className="flex items-center justify-between gap-1 text-xs text-primary hover:underline pt-2 border-t mt-2">
                  <span className="truncate flex-1">
                    Top: <span className="font-medium">{data.topFingerprint.title}</span>
                    {" "}
                    <span className="text-muted-foreground tabular-nums">
                      ({data.topFingerprint.hitCount.toLocaleString()} hits)
                    </span>
                  </span>
                  <ChevronRight className="w-3 h-3 flex-shrink-0" />
                </a>
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
