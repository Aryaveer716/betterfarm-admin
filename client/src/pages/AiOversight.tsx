import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Zap, CheckCircle, XCircle, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function AiOversight() {
  const [filter, setFilter] = useState<"all" | "success" | "failed">("all");
  const [page, setPage] = useState(1);

  const wasSuccessful = filter === "all" ? undefined : filter === "success";
  const { data, isLoading } = trpc.admin.getAiInteractions.useQuery({ page, limit: 20, wasSuccessful });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">AI Oversight</h1>
        <p className="text-muted-foreground text-sm mt-1">Monitor AI copilot interactions and performance</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Interactions</p>
                <p className="text-3xl font-bold mt-1">{(data?.total ?? 0).toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
                <Zap className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Successful</p>
                <p className="text-3xl font-bold mt-1 text-green-600">{(data?.successCount ?? 0).toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="text-3xl font-bold mt-1 text-red-600">{(data?.failCount ?? 0).toLocaleString()}</p>
              </div>
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Interaction Log</CardTitle>
            <Select value={filter} onValueChange={(v) => { setFilter(v as any); setPage(1); }}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="success">Successful</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded" />)}</div>
          ) : data?.interactions?.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No AI interactions recorded yet</p>
          ) : (
            <div className="space-y-2">
              {data?.interactions?.map((item) => (
                <div key={item.id} className="flex items-start justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${item.wasSuccessful ? "bg-green-50" : "bg-red-50"}`}>
                      {item.wasSuccessful ? <CheckCircle className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.inputText?.substring(0, 80) ?? "No input"}{(item.inputText?.length ?? 0) > 80 ? "..." : ""}</p>
                      {item.errorMessage && <p className="text-xs text-red-600 mt-0.5">{item.errorMessage}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        {item.model && <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{item.model}</span>}
                        {item.category && <span className="text-xs text-muted-foreground">{item.category}</span>}
                        {item.latencyMs && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="w-3 h-3" />{item.latencyMs}ms
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {item.tokensUsed && <span className="text-xs text-muted-foreground">{item.tokensUsed} tokens</span>}
                    <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {(data?.total ?? 0) > 20 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
              <p className="text-sm text-muted-foreground">{data?.total} total interactions</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
                <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={page * 20 >= (data?.total ?? 0)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
