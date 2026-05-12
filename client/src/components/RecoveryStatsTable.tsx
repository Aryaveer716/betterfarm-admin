import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ByAction = {
  action: string;
  success: number;
  failed: number;
  suppressed: number;
};
type Total = { success: number; failed: number; suppressed: number };

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  return `${Math.round((100 * numerator) / denominator)}%`;
}

export function RecoveryStatsTable({
  byAction,
  total,
}: {
  byAction: ByAction[];
  total: Total;
}) {
  if (byAction.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recovery attempts</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No recovery attempts recorded for this fingerprint yet.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Recovery attempts</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead className="text-right">Success</TableHead>
              <TableHead className="text-right">Failed</TableHead>
              <TableHead className="text-right">Suppressed</TableHead>
              <TableHead className="text-right">Success rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {byAction.map((row) => {
              const denom = row.success + row.failed;
              return (
                <TableRow key={row.action}>
                  <TableCell className="font-mono text-xs">
                    {row.action}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.success.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.failed.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.suppressed.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium">
                    {pct(row.success, denom)}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-muted/40 font-medium">
              <TableCell>Total</TableCell>
              <TableCell className="text-right tabular-nums">
                {total.success.toLocaleString()}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {total.failed.toLocaleString()}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {total.suppressed.toLocaleString()}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {pct(total.success, total.success + total.failed)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
