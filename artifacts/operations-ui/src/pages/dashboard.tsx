import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Activity, AlertTriangle, CheckCircle2, Clock, Zap } from "lucide-react";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { Link } from "wouter";
import { formatDistanceToNow } from "date-fns";

export function Dashboard() {
  const { data: summary, isLoading, isError } = useGetDashboardSummary({
    query: { refetchInterval: 3000, queryKey: getGetDashboardSummaryQueryKey() }
  });

  if (isLoading && !summary) {
    return <div className="text-muted-foreground font-mono animate-pulse">LOADING_TELEMETRY...</div>;
  }

  if (isError) {
    return <div className="text-destructive font-mono">ERR_FETCHING_DASHBOARD_DATA</div>;
  }

  if (!summary) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Executive Summary</h1>
        <p className="text-muted-foreground font-mono mt-1">Real-time system health and SLO compliance</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-t-4 border-t-[#00E5FF]">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase font-mono text-muted-foreground">SLO Compliance</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-[#00E5FF]" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold font-mono">{summary.sloCompliance.toFixed(2)}%</div>
            <Progress 
              value={summary.sloCompliance} 
              className="mt-3 h-2" 
              indicatorColor={summary.sloCompliance < 99.0 ? "bg-[#FFD600]" : "bg-[#00E5FF]"} 
            />
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase font-mono text-muted-foreground">Error Budget</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold font-mono">{summary.errorBudgetRemaining.toFixed(1)}%</div>
            <Progress 
              value={summary.errorBudgetRemaining} 
              className="mt-3 h-2" 
              indicatorColor={summary.errorBudgetRemaining < 20 ? "bg-destructive" : "bg-primary"} 
            />
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-destructive">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase font-mono text-muted-foreground">Critical Incidents</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold font-mono text-destructive">{summary.criticalIncidents}</div>
            <p className="text-xs text-muted-foreground mt-2 font-mono">
              <span className="text-primary">{summary.openIncidents} total</span> open incidents
            </p>
          </CardContent>
        </Card>

        <Card className="border-t-4 border-t-muted-foreground">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium uppercase font-mono text-muted-foreground">Pipeline</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold font-mono">{summary.eventsPerSecond.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-2 font-mono">
              Events / sec • Lag: {summary.processingLagSeconds.toFixed(2)}s
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-lg">Machine Health Matrix</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex items-center justify-center">
            <div className="grid grid-cols-3 gap-4 w-full text-center">
              <div className="bg-[#00E5FF]/10 border border-[#00E5FF]/20 rounded-lg p-6 flex flex-col items-center justify-center">
                <div className="text-4xl font-bold text-[#00E5FF] font-mono">{summary.normalCount}</div>
                <div className="text-xs font-mono text-muted-foreground mt-2 uppercase">Normal</div>
              </div>
              <div className="bg-[#FFD600]/10 border border-[#FFD600]/20 rounded-lg p-6 flex flex-col items-center justify-center">
                <div className="text-4xl font-bold text-[#FFD600] font-mono">{summary.warningCount}</div>
                <div className="text-xs font-mono text-muted-foreground mt-2 uppercase">Warning</div>
              </div>
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 flex flex-col items-center justify-center">
                <div className="text-4xl font-bold text-destructive font-mono">{summary.criticalCount}</div>
                <div className="text-xs font-mono text-muted-foreground mt-2 uppercase">Critical</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Active Incidents Log</CardTitle>
            <Link href="/incidents" className="text-sm font-mono text-primary hover:underline">VIEW_ALL</Link>
          </CardHeader>
          <CardContent>
            {summary.recentIncidents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground font-mono">NO_ACTIVE_INCIDENTS</div>
            ) : (
              <div className="space-y-4">
                {summary.recentIncidents.map((incident) => (
                  <div key={incident.id} className="flex items-start justify-between border-b border-border pb-4 last:border-0 last:pb-0">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <SeverityBadge severity={incident.severity} />
                        <Link href={`/incidents/${incident.id}`} className="font-medium hover:text-primary transition-colors">
                          {incident.title}
                        </Link>
                      </div>
                      <div className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                        <span>{incident.siteId} / {incident.machineId}</span>
                        <span>•</span>
                        <span>{formatDistanceToNow(new Date(incident.detectedAt), { addSuffix: true })}</span>
                      </div>
                    </div>
                    <StatusBadge status={incident.status} />
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