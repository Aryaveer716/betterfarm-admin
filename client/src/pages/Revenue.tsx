import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, TrendingUp, Users, ShoppingCart } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function Revenue() {
  const { data, isLoading } = trpc.admin.getRevenue.useQuery();

  const stats = [
    {
      label: "Total Listings Value",
      value: data ? `₱${(data.totalListingsValue ?? 0).toLocaleString()}` : "—",
      icon: ShoppingCart,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Active Listings",
      value: data?.activeListings?.toLocaleString() ?? "—",
      icon: TrendingUp,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Avg Listing Price",
      value: data ? `₱${(data.avgListingPrice ?? 0).toLocaleString()}` : "—",
      icon: DollarSign,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      label: "Verified Farmers",
      value: data?.verifiedFarmers?.toLocaleString() ?? "—",
      icon: Users,
      color: "text-green-600",
      bg: "bg-green-50",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Revenue</h1>
        <p className="text-muted-foreground text-sm mt-1">Platform financial metrics and marketplace performance</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  {isLoading ? (
                    <div className="h-8 w-24 bg-muted animate-pulse rounded mt-1" />
                  ) : (
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
                  )}
                </div>
                <div className={`w-12 h-12 ${stat.bg} rounded-xl flex items-center justify-center`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Listings by Category</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-48 bg-muted animate-pulse rounded" />
            ) : (data?.listingsByCategory?.length ?? 0) === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No listing data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data?.listingsByCategory ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="category" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#16a34a" radius={[4, 4, 0, 0]} name="Listings" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Listings by Status</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-48 bg-muted animate-pulse rounded" />
            ) : (data?.listingsByStatus?.length ?? 0) === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">No listing data yet</p>
            ) : (
              <div className="space-y-3 py-2">
                {data?.listingsByStatus?.map((item) => {
                  const total = data.listingsByStatus?.reduce((s, i) => s + i.count, 0) ?? 1;
                  const pct = Math.round((item.count / total) * 100);
                  const colorMap: Record<string, string> = { active: "bg-green-500", sold: "bg-blue-500", removed: "bg-red-400", pending: "bg-yellow-400" };
                  return (
                    <div key={item.status}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize">{item.status}</span>
                        <span className="text-muted-foreground">{item.count} ({pct}%)</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${colorMap[item.status] ?? "bg-gray-400"} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
