import { Badge } from "@/components/ui/badge";

export function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "critical") {
    return <Badge variant="destructive" className="uppercase font-mono tracking-wider">CRITICAL</Badge>;
  }
  if (severity === "warning") {
    return <Badge variant="warning" className="uppercase font-mono tracking-wider">WARNING</Badge>;
  }
  return <Badge variant="success" className="uppercase font-mono tracking-wider">NORMAL</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  switch (status.toLowerCase()) {
    case 'open':
      return <Badge variant="destructive" className="uppercase font-mono">OPEN</Badge>;
    case 'acknowledged':
      return <Badge variant="warning" className="uppercase font-mono">ACKED</Badge>;
    case 'resolved':
      return <Badge variant="success" className="uppercase font-mono">RESOLVED</Badge>;
    case 'running':
      return <Badge variant="success" className="uppercase font-mono">RUNNING</Badge>;
    case 'stopped':
      return <Badge variant="secondary" className="uppercase font-mono">STOPPED</Badge>;
    case 'maintenance':
      return <Badge variant="warning" className="uppercase font-mono">MAINT</Badge>;
    case 'offline':
      return <Badge variant="destructive" className="uppercase font-mono">OFFLINE</Badge>;
    default:
      return <Badge variant="outline" className="uppercase font-mono">{status}</Badge>;
  }
}
