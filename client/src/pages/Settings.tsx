import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function Settings() {
  const utils = trpc.useUtils();
  const { data: flags, isLoading } = trpc.admin.getFeatureFlags.useQuery();

  const toggle = trpc.admin.toggleFeatureFlag.useMutation({
    onSuccess: () => { toast.success("Feature flag updated"); utils.admin.getFeatureFlags.invalidate(); },
    onMutate: async ({ flagId, isEnabled }) => {
      await utils.admin.getFeatureFlags.cancel();
      const prev = utils.admin.getFeatureFlags.getData();
      utils.admin.getFeatureFlags.setData(undefined, (old) =>
        old?.map(f => f.id === flagId ? { ...f, isEnabled } : f)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.admin.getFeatureFlags.setData(undefined, ctx.prev);
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage feature flags and platform configuration</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Feature Flags
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded" />)}</div>
          ) : (flags?.length ?? 0) === 0 ? (
            <p className="text-center text-muted-foreground py-8">No feature flags configured</p>
          ) : (
            <div className="space-y-1">
              {flags?.map((flag) => (
                <div key={flag.id} className="flex items-center justify-between p-4 rounded-lg hover:bg-muted/30 transition-colors border border-transparent hover:border-border">
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{flag.name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</p>
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{flag.name}</code>
                    </div>
                    {flag.description && <p className="text-xs text-muted-foreground mt-0.5">{flag.description}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      Last updated {formatDistanceToNow(new Date(flag.updatedAt), { addSuffix: true })}
                    </p>
                  </div>
                  <Switch
                    checked={flag.isEnabled}
                    onCheckedChange={(checked) => toggle.mutate({ flagId: flag.id, isEnabled: checked })}
                    disabled={toggle.isPending}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
