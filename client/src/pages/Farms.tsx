import { Card, CardContent } from "@/components/ui/card";
import { Sprout, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function Farms() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Farms</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Farm management has moved to the Verification workflow.
        </p>
      </div>
      <Card>
        <CardContent className="py-12 text-center">
          <Sprout className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground text-sm mb-4">
            Farm profiles are reviewed through Verification (canonical verificationRequests workflow).
          </p>
          <Link href="/verification">
            <Button variant="outline">
              Go to Verification
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
