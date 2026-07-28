import { useListSites } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { MapPin, Server } from "lucide-react";

export function PlantsOverview() {
  const { data: sites, isLoading } = useListSites();

  if (isLoading) {
    return <div className="text-muted-foreground font-mono animate-pulse">LOADING_SITES_REGISTRY...</div>;
  }

  if (!sites) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Plant Registry</h1>
        <p className="text-muted-foreground font-mono mt-1">Global site overview and machine distribution</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {sites.map(site => (
          <Link key={site.id} href={`/plants/${site.siteId}`}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer group hover-elevate">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-xl group-hover:text-primary transition-colors">{site.name}</CardTitle>
                    <div className="flex items-center text-sm text-muted-foreground mt-1 font-mono">
                      <MapPin className="w-3 h-3 mr-1" />
                      {site.location}
                    </div>
                  </div>
                  <div className="bg-muted px-2 py-1 rounded text-xs font-mono">
                    ID: {site.siteId}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-2 text-center mt-4">
                  <div className="bg-card border border-border rounded p-2">
                    <div className="text-xs text-muted-foreground font-mono mb-1">TOTAL</div>
                    <div className="font-bold font-mono">{site.totalMachines}</div>
                  </div>
                  <div className="bg-[#00E5FF]/10 border border-[#00E5FF]/20 rounded p-2">
                    <div className="text-xs text-[#00E5FF] font-mono mb-1">NORM</div>
                    <div className="font-bold text-[#00E5FF] font-mono">{site.normalCount}</div>
                  </div>
                  <div className="bg-[#FFD600]/10 border border-[#FFD600]/20 rounded p-2">
                    <div className="text-xs text-[#FFD600] font-mono mb-1">WARN</div>
                    <div className="font-bold text-[#FFD600] font-mono">{site.warningCount}</div>
                  </div>
                  <div className="bg-destructive/10 border border-destructive/20 rounded p-2">
                    <div className="text-xs text-destructive font-mono mb-1">CRIT</div>
                    <div className="font-bold text-destructive font-mono">{site.criticalCount}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}