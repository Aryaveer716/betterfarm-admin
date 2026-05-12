import { Card, CardContent } from "@/components/ui/card";
import { DollarSign } from "lucide-react";

export default function Revenue() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Revenue</h1>
        <p className="text-muted-foreground text-sm mt-1">Coming soon</p>
      </div>
      <Card>
        <CardContent className="py-12 text-center">
          <DollarSign className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">
            Revenue tracking depends on the marketplace feature, which is not shipped yet.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
