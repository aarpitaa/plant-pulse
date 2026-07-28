import { useGetSite } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link, useParams } from "wouter";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { MapPin, Thermometer, Gauge, Activity } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function PlantDetail() {
  const params = useParams();
  const siteId = params.siteId as string;

  const { data: site, isLoading } = useGetSite(siteId, {
    query: { enabled: !!siteId, queryKey: ['site', siteId] } // using custom query key to satisfy rule while generated one isn't explicitly imported
  });

  if (isLoading) {
    return <div className="text-muted-foreground font-mono animate-pulse">ESTABLISHING_LINK_TO_SITE...</div>;
  }

  if (!site) return <div className="text-destructive font-mono">ERR_SITE_NOT_FOUND</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono mb-2">
            <Link href="/plants" className="hover:text-primary">PLANTS</Link>
            <span>/</span>
            <span>{site.siteId}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{site.name}</h1>
          <div className="flex items-center text-sm text-muted-foreground mt-1 font-mono">
            <MapPin className="w-3 h-3 mr-1" />
            {site.location}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {site.machines.map(machine => (
          <Link key={machine.id} href={`/machines/${machine.machineId}`}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer group h-full">
              <CardHeader className="pb-2 border-b border-border/50">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-base group-hover:text-primary transition-colors">{machine.name}</CardTitle>
                    <div className="text-xs text-muted-foreground font-mono mt-1">{machine.machineType}</div>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <SeverityBadge severity={machine.severity} />
                    <StatusBadge status={machine.status} />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 pb-4">
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col items-center justify-center p-2 bg-muted/30 rounded">
                    <Thermometer className="w-4 h-4 mb-1 text-muted-foreground" />
                    <div className="font-mono text-sm">{machine.temperatureC.toFixed(1)}°</div>
                  </div>
                  <div className="flex flex-col items-center justify-center p-2 bg-muted/30 rounded">
                    <Gauge className="w-4 h-4 mb-1 text-muted-foreground" />
                    <div className="font-mono text-sm">{machine.pressurePsi.toFixed(1)}</div>
                  </div>
                  <div className="flex flex-col items-center justify-center p-2 bg-muted/30 rounded">
                    <Activity className="w-4 h-4 mb-1 text-muted-foreground" />
                    <div className="font-mono text-sm">{machine.vibrationMmS.toFixed(2)}</div>
                  </div>
                </div>
                <div className="text-right mt-3 text-[10px] text-muted-foreground font-mono">
                  UPDATED: {formatDistanceToNow(new Date(machine.lastReadingAt), { addSuffix: true })}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}