import { useGetIncident, useUpdateIncident } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useParams } from "wouter";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";

export function IncidentDetail() {
  const params = useParams();
  const incidentId = parseInt(params.id as string, 10);
  const queryClient = useQueryClient();

  const { data: incident, isLoading } = useGetIncident(incidentId, {
    query: { enabled: !isNaN(incidentId), queryKey: ['incident', incidentId] }
  });

  const updateIncident = useUpdateIncident({
    mutation: {
      onSuccess: (data) => {
        queryClient.setQueryData(['incident', incidentId], data);
        queryClient.invalidateQueries({ queryKey: ['/api/incidents'] });
        queryClient.invalidateQueries({ queryKey: ['/api/dashboard/summary'] });
      }
    }
  });

  if (isLoading) {
    return <div className="text-muted-foreground font-mono animate-pulse">LOADING_INCIDENT_DATA...</div>;
  }

  if (!incident) return <div className="text-destructive font-mono">ERR_INCIDENT_NOT_FOUND</div>;

  const handleAcknowledge = () => {
    updateIncident.mutate({ id: incidentId, data: { status: 'acknowledged' } });
  };

  const handleResolve = () => {
    updateIncident.mutate({ id: incidentId, data: { status: 'resolved' } });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono mb-2">
        <Link href="/incidents" className="hover:text-primary">INCIDENTS</Link>
        <span>/</span>
        <span>#{incident.id}</span>
      </div>

      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{incident.title}</h1>
          <div className="flex gap-2 mt-3">
            <SeverityBadge severity={incident.severity} />
            <StatusBadge status={incident.status} />
          </div>
        </div>
        <div className="flex gap-2">
          {incident.status === 'open' && (
            <Button 
              onClick={handleAcknowledge} 
              disabled={updateIncident.isPending}
              variant="outline" 
              className="font-mono bg-warning/10 text-warning border-warning hover:bg-warning hover:text-warning-foreground"
            >
              ACKNOWLEDGE
            </Button>
          )}
          {(incident.status === 'open' || incident.status === 'acknowledged') && (
            <Button 
              onClick={handleResolve}
              disabled={updateIncident.isPending}
              variant="outline"
              className="font-mono bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF] hover:bg-[#00E5FF] hover:text-[#00E5FF]/10"
            >
              MARK_RESOLVED
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Details & Description</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/30 p-4 rounded-md font-mono text-sm leading-relaxed border border-border whitespace-pre-wrap">
              {incident.description || "No additional description provided by the system."}
            </div>

            <h3 className="text-lg font-bold mt-8 mb-4">Timeline</h3>
            <div className="space-y-4 pl-2 border-l-2 border-border ml-2">
              <div className="relative pl-6">
                <div className="absolute left-[-5px] top-1.5 w-2 h-2 rounded-full bg-destructive"></div>
                <div className="font-mono text-xs text-muted-foreground">{format(new Date(incident.detectedAt), 'yyyy-MM-dd HH:mm:ss')}</div>
                <div className="font-medium">Incident Detected</div>
              </div>
              {incident.acknowledgedAt && (
                <div className="relative pl-6">
                  <div className="absolute left-[-5px] top-1.5 w-2 h-2 rounded-full bg-warning"></div>
                  <div className="font-mono text-xs text-muted-foreground">{format(new Date(incident.acknowledgedAt), 'yyyy-MM-dd HH:mm:ss')}</div>
                  <div className="font-medium">Acknowledged</div>
                </div>
              )}
              {incident.resolvedAt && (
                <div className="relative pl-6">
                  <div className="absolute left-[-5px] top-1.5 w-2 h-2 rounded-full bg-[#00E5FF]"></div>
                  <div className="font-mono text-xs text-muted-foreground">{format(new Date(incident.resolvedAt), 'yyyy-MM-dd HH:mm:ss')}</div>
                  <div className="font-medium">Resolved</div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Affected Entity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 font-mono text-sm">
              <div>
                <div className="text-muted-foreground text-xs mb-1">SITE</div>
                <Link href={`/plants/${incident.siteId}`} className="text-primary hover:underline">{incident.siteId}</Link>
              </div>
              <div>
                <div className="text-muted-foreground text-xs mb-1">MACHINE</div>
                <Link href={`/machines/${incident.machineId}`} className="text-primary hover:underline">{incident.machineId}</Link>
              </div>
              <div>
                <div className="text-muted-foreground text-xs mb-1">AUTO-REMEDIATIONS ATTEMPTED</div>
                <div>{incident.remediationCount || 0}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}