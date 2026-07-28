import { useGetKafkaMetrics } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActivitySquare, ArrowDownToLine, Server, Database } from "lucide-react";
import { format } from "date-fns";

export function KafkaPipeline() {
  const { data: metrics, isLoading } = useGetKafkaMetrics({
    query: { refetchInterval: 5000, queryKey: ['kafkaMetrics'] }
  });

  if (isLoading && !metrics) {
    return <div className="text-muted-foreground font-mono animate-pulse">PROBING_MESSAGE_BROKERS...</div>;
  }

  if (!metrics) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Event Pipeline</h1>
          <p className="text-muted-foreground font-mono mt-1">Kafka broker health and topic metrics</p>
        </div>
        <div className={`px-3 py-1 rounded font-mono text-sm border ${metrics.brokerHealthy ? 'bg-[#00E5FF]/10 text-[#00E5FF] border-[#00E5FF]/30' : 'bg-destructive/10 text-destructive border-destructive/30'}`}>
          BROKER: {metrics.brokerHealthy ? 'HEALTHY' : 'DEGRADED'}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <ActivitySquare className="w-4 h-4" />
              <span className="font-mono text-xs font-bold uppercase">Throughput</span>
            </div>
            <div className="text-3xl font-bold font-mono">{metrics.totalEventsPerSecond.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground font-mono mt-1">events / sec</div>
          </CardContent>
        </Card>
        
        <Card className={metrics.totalConsumerLag > 5000 ? "border-warning" : ""}>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Server className="w-4 h-4" />
              <span className="font-mono text-xs font-bold uppercase">Global Lag</span>
            </div>
            <div className={`text-3xl font-bold font-mono ${metrics.totalConsumerLag > 5000 ? 'text-warning' : ''}`}>
              {metrics.totalConsumerLag.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-1">unprocessed events</div>
          </CardContent>
        </Card>

        <Card className={metrics.dlqSize > 0 ? "border-destructive" : ""}>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <Database className="w-4 h-4" />
              <span className="font-mono text-xs font-bold uppercase">DLQ Size</span>
            </div>
            <div className={`text-3xl font-bold font-mono ${metrics.dlqSize > 0 ? 'text-destructive' : ''}`}>
              {metrics.dlqSize.toLocaleString()}
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-1">dead letters</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              <ArrowDownToLine className="w-4 h-4" />
              <span className="font-mono text-xs font-bold uppercase">DLQ Growth</span>
            </div>
            <div className="text-3xl font-bold font-mono">{metrics.dlqGrowthRate}</div>
            <div className="text-xs text-muted-foreground font-mono mt-1">msgs / min</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Topic Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Topic Name</TableHead>
                <TableHead className="text-right">Partitions</TableHead>
                <TableHead className="text-right">Messages In</TableHead>
                <TableHead className="text-right">Messages Out</TableHead>
                <TableHead className="text-right">Lag</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.topics.map((topic, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono font-medium text-primary">{topic.topic}</TableCell>
                  <TableCell className="text-right font-mono">{topic.partitions}</TableCell>
                  <TableCell className="text-right font-mono">{topic.messagesIn.toLocaleString()}</TableCell>
                  <TableCell className="text-right font-mono">{topic.messagesOut.toLocaleString()}</TableCell>
                  <TableCell className={`text-right font-mono font-bold ${topic.consumerLag > 1000 ? 'text-warning' : ''}`}>
                    {topic.consumerLag.toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="text-right text-xs text-muted-foreground font-mono mt-4">
            LAST_SYNC: {format(new Date(metrics.updatedAt), 'HH:mm:ss')}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}