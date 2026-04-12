import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Sprout, MessageSquare, HelpCircle, Flag, CheckCircle, Bug, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function StatCard({ title, value, icon: Icon, color }: { title: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold mt-1">{value.toLocaleString()}</p>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data, isLoading } = trpc.admin.getDashboardStats.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Loading overview...</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><div className="h-16 bg-muted animate-pulse rounded" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">BetterFarm operations overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total Users" value={stats?.totalUsers ?? 0} icon={Users} color="bg-blue-50 text-blue-600" />
        <StatCard title="Total Farms" value={stats?.totalFarms ?? 0} icon={Sprout} color="bg-green-50 text-green-600" />
        <StatCard title="Forum Posts" value={stats?.totalPosts ?? 0} icon={MessageSquare} color="bg-purple-50 text-purple-600" />
        <StatCard title="Open Tickets" value={stats?.openTickets ?? 0} icon={HelpCircle} color="bg-orange-50 text-orange-600" />
        <StatCard title="Pending Reports" value={stats?.pendingReports ?? 0} icon={Flag} color="bg-red-50 text-red-600" />
        <StatCard title="Pending Verifications" value={stats?.pendingVerifications ?? 0} icon={CheckCircle} color="bg-yellow-50 text-yellow-600" />
        <StatCard title="Disease Detections" value={stats?.pendingDetections ?? 0} icon={Bug} color="bg-rose-50 text-rose-600" />
        <StatCard title="AI Interactions" value={stats?.totalAiInteractions ?? 0} icon={Zap} color="bg-indigo-50 text-indigo-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Users</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.recentUsers?.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">No users yet</p>
            ) : (
              <div className="space-y-3">
                {data?.recentUsers?.map((user) => (
                  <div key={user.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-sm">
                        {user.name?.charAt(0).toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{user.name ?? "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{user.email ?? ""}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(user.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Support Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.recentTickets?.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">No tickets yet</p>
            ) : (
              <div className="space-y-3">
                {data?.recentTickets?.map((ticket) => (
                  <div key={ticket.id} className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ticket.subject}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{ticket.category ?? "General"}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                      ticket.status === "open" ? "bg-red-100 text-red-700" :
                      ticket.status === "in_progress" ? "bg-yellow-100 text-yellow-700" :
                      "bg-green-100 text-green-700"
                    }`}>
                      {ticket.status.replace("_", " ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent Admin Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.recentLogs?.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-4">No activity yet</p>
            ) : (
              <div className="space-y-2">
                {data?.recentLogs?.map((log) => (
                  <div key={log.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <div>
                        <p className="text-sm">{log.action}</p>
                        {log.targetType && (
                          <p className="text-xs text-muted-foreground">{log.targetType} #{log.targetId}</p>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
