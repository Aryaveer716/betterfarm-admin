import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Analytics() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Live counts on the Dashboard. Time-series analytics deferred.
        </p>
      </div>
      <Card>
        <CardContent className="py-12 text-center">
          <BarChart3 className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm mb-4">
            The legacy Analytics page used raw SQL on admin-local snake_case tables that no longer
            exist. Time-series implementation against canonical schema is deferred.
          </p>
          <Link href="/">
            <Button variant="outline">
              View Dashboard
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
