import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { SlidersHorizontal, Sliders, AlertTriangle, Info } from "lucide-react";

type ConfirmTarget =
  | { kind: "flag"; key: string; nextValue: boolean; description: string }
  | { kind: "tunable"; key: string; nextValue: number | string; description: string };

const FLAG_DESCRIPTIONS: Record<string, { label: string; whenOff: string }> = {
  voice_enabled: {
    label: "Voice copilot",
    whenOff: "All voice paths go silent. Users can still chat via text. Use this for fleet-wide voice incidents.",
  },
  xtts_allowed: {
    label: "XTTS streaming TTS",
    whenOff: "XTTS streaming dies; device-TTS keeps working as a degraded fallback. Use BEFORE voice_enabled for partial outages.",
  },
  device_tts_allowed: {
    label: "Device TTS fallback",
    whenOff: "expo-speech / SpeechSynthesis disabled. With xtts also off, voice is text-only.",
  },
  background_flush_enabled: {
    label: "Background sync flush",
    whenOff: "Pending writes (logs, transcripts) stay queued locally until the app is foregrounded. Use to relieve sync-storm load.",
  },
  learning_telemetry_enabled: {
    label: "Learning telemetry uplink",
    whenOff: "Operator + screen + journey telemetry stops uploading.",
  },
};

export default function Operator() {
  const utils = trpc.useUtils();
  const { data: config, isLoading } = trpc.admin.operator.getConfig.useQuery();
  const [confirm, setConfirm] = useState<ConfirmTarget | null>(null);
  const [stallEdit, setStallEdit] = useState<string>("");

  const setFlag = trpc.admin.operator.setFlag.useMutation({
    onSuccess: () => {
      toast.success("Flag updated. Fleet sees change within ~35s.");
      void utils.admin.operator.getConfig.invalidate();
      setConfirm(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const setTunable = trpc.admin.operator.setTunable.useMutation({
    onSuccess: () => {
      toast.success("Tunable updated. Fleet sees change within ~35s.");
      void utils.admin.operator.getConfig.invalidate();
      setConfirm(null);
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Operator Controls</h1>
          <p className="text-muted-foreground text-sm mt-1">Loading…</p>
        </div>
        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 bg-muted animate-pulse rounded" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Operator Controls</h1>
        <p className="text-destructive">Failed to load operator config. Refresh to retry.</p>
      </div>
    );
  }

  const { flags, tunables, defs, version, flagKeys } = config;
  const phase1Tunables = Object.entries(defs).filter(([, d]) => d.phase === 1);
  const phase2Tunables = Object.entries(defs).filter(([, d]) => d.phase === 2);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <SlidersHorizontal className="w-6 h-6" />
            Operator Controls
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Remote-controlled kill switches and tunables for the live fleet. Changes propagate within
            ~35 seconds (5s server cache + 30s client poll). Every change is audit-logged.
          </p>
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          v {version.slice(0, 8)}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Kill Switches
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {flagKeys.map((key) => {
              const value = flags[key] ?? true;
              const meta = FLAG_DESCRIPTIONS[key] ?? { label: key, whenOff: "" };
              return (
                <div
                  key={key}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
                >
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{meta.label}</span>
                      <code className="text-xs text-muted-foreground">{key}</code>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{meta.whenOff}</p>
                  </div>
                  <Switch
                    checked={value}
                    disabled={setFlag.isPending}
                    onCheckedChange={(next) =>
                      setConfirm({ kind: "flag", key, nextValue: next, description: meta.label })
                    }
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sliders className="w-4 h-4" />
            Live Tunables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {phase1Tunables.map(([key, def]) => {
              const current = tunables[key];
              if (def.type === "string" && def.allowedValues) {
                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">{key}</Label>
                      <code className="text-xs text-muted-foreground">{def.description}</code>
                    </div>
                    <Select
                      value={String(current)}
                      onValueChange={(next) =>
                        setConfirm({ kind: "tunable", key, nextValue: next, description: def.description })
                      }
                      disabled={setTunable.isPending}
                    >
                      <SelectTrigger className="w-full max-w-md">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {def.allowedValues.map((v) => (
                          <SelectItem key={v} value={v}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              if (def.type === "number") {
                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm font-medium">{key}</Label>
                      <code className="text-xs text-muted-foreground">
                        range [{def.min}, {def.max}] · current {String(current)}
                      </code>
                    </div>
                    <p className="text-xs text-muted-foreground">{def.description}</p>
                    <div className="flex gap-2 max-w-md">
                      <Input
                        type="number"
                        min={def.min}
                        max={def.max}
                        defaultValue={String(current)}
                        onChange={(e) => setStallEdit(e.target.value)}
                        disabled={setTunable.isPending}
                      />
                      <Button
                        variant="outline"
                        disabled={setTunable.isPending || stallEdit === ""}
                        onClick={() => {
                          const n = Number(stallEdit);
                          if (Number.isNaN(n)) {
                            toast.error("Invalid number");
                            return;
                          }
                          setConfirm({
                            kind: "tunable",
                            key,
                            nextValue: n,
                            description: def.description,
                          });
                        }}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="w-4 h-4" />
            Phase 2 Tunables (consumers not yet wired)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            These tunables are defined in the DB but not yet read by client code. Editing them is safe
            but has no effect until the client consumers are wired in Phase 2.
          </p>
          <div className="space-y-2">
            {phase2Tunables.map(([key, def]) => (
              <div key={key} className="flex items-center justify-between p-2 rounded border border-border bg-muted/20 opacity-70">
                <div className="flex items-center gap-2 text-sm">
                  <code>{key}</code>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{def.description}</span>
                </div>
                <code className="text-xs text-muted-foreground">{String(tunables[key] ?? def.default)}</code>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm operator change</DialogTitle>
          </DialogHeader>
          {confirm && (
            <div className="space-y-2">
              <p className="text-sm">
                Set <code className="font-mono">{confirm.key}</code> to{" "}
                <strong>{String(confirm.nextValue)}</strong>?
              </p>
              <p className="text-xs text-muted-foreground">{confirm.description}</p>
              <p className="text-xs text-muted-foreground">
                This change is audit-logged and propagates to the live fleet within ~35 seconds.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant={
                confirm?.kind === "flag" && confirm.nextValue === false ? "destructive" : "default"
              }
              disabled={setFlag.isPending || setTunable.isPending}
              onClick={() => {
                if (!confirm) return;
                if (confirm.kind === "flag") {
                  setFlag.mutate({ key: confirm.key, value: confirm.nextValue });
                } else {
                  setTunable.mutate({ key: confirm.key, value: confirm.nextValue });
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
