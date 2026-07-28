import { useListRemediationActions } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export function RemediationAudit() {
  const { data, isLoading } = useListRemediationActions();

  if (isLoading) {
    return <div className="text-muted-foreground font-mono animate-pulse">QUERYING_AUDIT_LOGS...</div>;
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Remediation Audit Log</h1>
        <p className="text-muted-foreground font-mono mt-1">History of automated controller actions</p>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Action Taken</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Metadata</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((action) => (
              <TableRow key={action.id}>
                <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                  {format(new Date(action.performedAt), 'yyyy-MM-dd HH:mm:ss')}
                </TableCell>
                <TableCell className="font-mono text-sm">{action.trigger}</TableCell>
                <TableCell className="font-mono text-sm text-primary">{action.action}</TableCell>
                <TableCell>
                  {action.outcome === 'success' && <Badge variant="success" className="uppercase font-mono">SUCCESS</Badge>}
                  {action.outcome === 'failure' && <Badge variant="destructive" className="uppercase font-mono">FAILURE</Badge>}
                  {action.outcome === 'skipped' && <Badge variant="secondary" className="uppercase font-mono">SKIPPED</Badge>}
                </TableCell>
                <TableCell className="font-mono text-xs max-w-[200px] truncate text-muted-foreground">
                  {action.metadata || '-'}
                </TableCell>
              </TableRow>
            ))}
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground font-mono">
                  NO_REMEDIATION_LOGS
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}