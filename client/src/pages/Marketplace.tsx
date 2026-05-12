import { Card, CardContent } from "@/components/ui/card";
import { ShoppingCart } from "lucide-react";

export default function Marketplace() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Marketplace</h1>
        <p className="text-muted-foreground text-sm mt-1">Coming soon</p>
      </div>
      <Card>
        <CardContent className="py-12 text-center">
          <ShoppingCart className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            BetterFarm does not yet ship a marketplace feature. This admin page will be wired once
            the main app has a canonical marketplaceListings table.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
