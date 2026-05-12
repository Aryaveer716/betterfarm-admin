import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Settings2, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Settings() {
  const utils = trpc.useUtils();
  const { data: flags, isLoading } = trpc.admin.listNonOperatorFlags.useQuery();

  const setFlag = trpc.admin.setNonOperatorFlag.useMutation({
    onSuccess: () => {
      toast.success("Feature flag updated");
      void utils.admin.listNonOperatorFlags.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Product feature flags. Operator kill switches (voice/XTTS/TTS/sync/telemetry) live on the
          Operator page, not here.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Feature Flags
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded" />)}
            </div>
          )}
          {!isLoading && (flags?.length ?? 0) === 0 && (
            <div className="text-center py-8">
              <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">
                No product flags found. Main app seeds the canonical featureFlags table on first
                boot.
              </p>
            </div>
          )}
          <div className="space-y-1">
            {flags?.map((flag) => (
              <div
                key={flag.flagKey}
                className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/30 transition-colors border border-transparent hover:border-border"
              >
                <div className="flex-1 min-w-0 mr-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-sm font-medium">{flag.flagKey}</code>
                    <Badge variant={flag.flagValue ? "default" : "outline"} className="text-xs">
                      {flag.flagValue ? "ON" : "OFF"}
                    </Badge>
                  </div>
                  {flag.description && (
                    <p className="text-xs text-muted-foreground mt-1">{flag.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Updated {formatDistanceToNow(new Date(flag.updatedAt))} ago
                    {flag.updatedBy && ` by ${flag.updatedBy}`}
                  </p>
                </div>
                <Switch
                  checked={flag.flagValue}
                  disabled={setFlag.isPending}
                  onCheckedChange={(next) => setFlag.mutate({ flagKey: flag.flagKey, flagValue: next })}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
