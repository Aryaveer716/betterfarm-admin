import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, AlertCircle, RefreshCw, Database, Server } from "lucide-react";
import { useState } from "react";

export default function SystemHealth() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, isLoading, error } = trpc.admin.getDashboardStats.useQuery(undefined, {
    refetchInterval: 30000,
  });

  const services = [
    {
      name: "Database",
      status: error ? "error" : isLoading ? "checking" : "online",
      description: "MySQL / TiDB connection",
      icon: Database,
    },
    {
      name: "API Server",
      status: isLoading ? "checking" : "online",
      description: "tRPC backend server",
      icon: Server,
    },
  ];

  const statusIcon = (status: string) => {
    if (status === "online") return <CheckCircle className="w-5 h-5 text-green-600" />;
    if (status === "error") return <XCircle className="w-5 h-5 text-red-600" />;
    return <AlertCircle className="w-5 h-5 text-yellow-500 animate-pulse" />;
  };

  const statusBadge = (status: string) => {
    if (status === "online") return "bg-green-100 text-green-700";
    if (status === "error") return "bg-red-100 text-red-700";
    return "bg-yellow-100 text-yellow-700";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">System Health</h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor platform service status</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRefreshKey(k => k + 1)} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {services.map((svc) => (
          <Card key={svc.name}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-muted rounded-lg flex items-center justify-center">
                    <svc.icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium">{svc.name}</p>
                    <p className="text-xs text-muted-foreground">{svc.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {statusIcon(svc.status)}
                  <span className={`text-xs px-2 py-1 rounded-full ${statusBadge(svc.status)}`}>
                    {svc.status === "checking" ? "Checking..." : svc.status}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded" />)}
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <XCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Unable to fetch system statistics. Database may be unavailable.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Users", value: data?.stats?.totalUsers ?? 0 },
                { label: "Forum Posts", value: data?.stats?.totalPosts ?? 0 },
                { label: "Flagged Posts", value: data?.stats?.flaggedPosts ?? 0 },
                { label: "Unread Emails", value: data?.stats?.unreadEmails ?? 0 },
                { label: "Pending Reports", value: data?.stats?.pendingContentReports ?? 0 },
                { label: "Pending Verifications", value: data?.stats?.pendingVerifications ?? 0 },
                { label: "Active Detections", value: data?.stats?.activeDetections ?? 0 },
                { label: "AI Conversations", value: data?.stats?.totalConversations ?? 0 },
              ].map((item) => (
                <div key={item.label} className="p-4 bg-muted/30 rounded-lg">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-xl font-bold mt-1">{item.value.toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
