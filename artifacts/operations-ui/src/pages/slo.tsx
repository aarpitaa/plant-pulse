import { useGetSloStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertTriangle, ShieldAlert } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function SloDashboard() {
  const { data, isLoading } = useGetSloStatus({
    query: { refetchInterval: 5000, queryKey: ['sloStatus'] }
  });

  if (isLoading && !data) {
    return <div className="text-muted-foreground font-mono animate-pulse">CALCULATING_SLO_COMPLIANCE...</div>;
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Service Level Objectives</h1>
        <p className="text-muted-foreground font-mono mt-1">Platform reliability guarantees and error budget burn</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-t-4 border-t-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase font-mono text-muted-foreground">Platform Compliance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold font-mono">{data.overallCompliance.toFixed(3)}%</div>
            <p className="text-xs text-muted-foreground mt-1 font-mono">Target: 99.9%</p>
          </CardContent>
        </Card>
        <Card className={data.errorBudgetRemaining < 10 ? "border-t-4 border-t-destructive" : "border-t-4 border-t-[#00E5FF]"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase font-mono text-muted-foreground">Error Budget Remaining</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold font-mono">{data.errorBudgetRemaining.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1 font-mono">{data.usedDowntimeMinutes}m used / {data.allowedDowntimeMinutes}m allowed</p>
          </CardContent>
        </Card>
        <Card className={data.burnRate > 1.0 ? "border-t-4 border-t-destructive" : "border-t-4 border-t-[#00E5FF]"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase font-mono text-muted-foreground">Current Burn Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold font-mono">{data.burnRate.toFixed(2)}x</div>
            <p className="text-xs text-muted-foreground mt-1 font-mono">Velocity of budget consumption</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Indicator Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Indicator</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead className="w-[200px]">Error Budget Used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.indicators.map((indicator, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    {indicator.compliant ? 
                      <CheckCircle2 className="w-5 h-5 text-[#00E5FF]" /> : 
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                    }
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{indicator.name}</div>
                    <div className="text-xs text-muted-foreground">{indicator.description}</div>
                  </TableCell>
                  <TableCell className="font-mono">{indicator.target}%</TableCell>
                  <TableCell className={`font-mono font-bold ${!indicator.compliant ? 'text-destructive' : 'text-[#00E5FF]'}`}>
                    {indicator.actual.toFixed(3)}%
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress 
                        value={indicator.errorBudgetUsed} 
                        indicatorColor={indicator.errorBudgetUsed > 100 ? "bg-destructive" : indicator.errorBudgetUsed > 80 ? "bg-[#FFD600]" : "bg-primary"}
                      />
                      <span className="text-xs font-mono w-12 text-right">{indicator.errorBudgetUsed.toFixed(0)}%</span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}