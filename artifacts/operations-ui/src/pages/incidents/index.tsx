import { useListIncidents } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { format } from "date-fns";

export function IncidentsList() {
  const { data, isLoading } = useListIncidents();

  if (isLoading) {
    return <div className="text-muted-foreground font-mono animate-pulse">FETCHING_INCIDENT_RECORDS...</div>;
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Incident Registry</h1>
          <p className="text-muted-foreground font-mono mt-1">System-wide alerts and anomalies requiring attention</p>
        </div>
        <div className="bg-card border border-border rounded px-4 py-2 flex gap-4 font-mono text-sm">
          <div>TOTAL: <span className="text-primary">{data.total}</span></div>
          <div>OPEN: <span className="text-destructive">{data.incidents.filter(i => i.status === 'open').length}</span></div>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Site / Machine</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Detected At</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.incidents.map((incident) => (
              <TableRow key={incident.id}>
                <TableCell className="font-mono text-muted-foreground">#{incident.id}</TableCell>
                <TableCell><SeverityBadge severity={incident.severity} /></TableCell>
                <TableCell><StatusBadge status={incident.status} /></TableCell>
                <TableCell className="font-mono text-xs">
                  <Link href={`/plants/${incident.siteId}`} className="hover:text-primary">{incident.siteId}</Link>
                  <span className="mx-1">/</span>
                  <Link href={`/machines/${incident.machineId}`} className="hover:text-primary">{incident.machineId}</Link>
                </TableCell>
                <TableCell className="font-medium max-w-[300px] truncate">{incident.title}</TableCell>
                <TableCell className="font-mono text-xs">{format(new Date(incident.detectedAt), 'MMM dd HH:mm:ss')}</TableCell>
                <TableCell className="text-right">
                  <Link href={`/incidents/${incident.id}`}>
                    <Button variant="outline" size="sm" className="font-mono text-xs">INVESTIGATE</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
            {data.incidents.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground font-mono">
                  NO_RECORDS_FOUND
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}