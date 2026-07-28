import { useGetMachine } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link, useParams } from "wouter";
import { SeverityBadge, StatusBadge } from "@/components/badges";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format } from "date-fns";

export function MachineDetail() {
  const params = useParams();
  const machineId = params.machineId as string;

  const { data: detail, isLoading } = useGetMachine(machineId, {
    query: { enabled: !!machineId, queryKey: ['machine', machineId], refetchInterval: 3000 }
  });

  if (isLoading && !detail) {
    return <div className="text-muted-foreground font-mono animate-pulse">ESTABLISHING_LINK_TO_MACHINE...</div>;
  }

  if (!detail) return <div className="text-destructive font-mono">ERR_MACHINE_NOT_FOUND</div>;

  const { machine, recentTelemetry, activeIncidents } = detail;

  const chartData = [...recentTelemetry].reverse().map(t => ({
    time: format(new Date(t.timestamp), 'HH:mm:ss'),
    temperatureC: t.temperatureC,
    pressurePsi: t.pressurePsi,
    vibrationMmS: t.vibrationMmS,
    isAnomaly: t.isAnomaly
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono mb-2">
            <Link href="/plants" className="hover:text-primary">PLANTS</Link>
            <span>/</span>
            <Link href={`/plants/${machine.siteId}`} className="hover:text-primary">{machine.siteId}</Link>
            <span>/</span>
            <span>{machine.machineId}</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{machine.name}</h1>
          <div className="text-muted-foreground font-mono mt-1">TYPE: {machine.machineType}</div>
        </div>
        <div className="flex gap-2">
          <StatusBadge status={machine.status} />
          <SeverityBadge severity={machine.severity} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg font-mono flex items-center justify-between">
              TELEMETRY_STREAM
              <div className="flex gap-4 text-xs">
                <span className="text-destructive">■ Temp (°C)</span>
                <span className="text-primary">■ Pressure (PSI)</span>
                <span className="text-[#00E5FF]">■ Vibration (mm/s x10)</span>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '4px' }}
                    itemStyle={{ fontFamily: 'monospace' }}
                    labelStyle={{ color: 'hsl(var(--muted-foreground))', marginBottom: '8px' }}
                  />
                  <Line type="monotone" dataKey="temperatureC" stroke="hsl(var(--destructive))" dot={false} strokeWidth={2} isAnimationActive={false} />
                  <Line type="monotone" dataKey="pressurePsi" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} isAnimationActive={false} />
                  {/* Scale vibration to fit on same axis easily */}
                  <Line type="monotone" dataKey="vibrationMmS" stroke="hsl(170, 100%, 40%)" dot={false} strokeWidth={2} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Current State</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b border-border pb-2">
                  <span className="text-muted-foreground font-mono text-sm">TEMP</span>
                  <span className="font-mono text-lg">{machine.temperatureC.toFixed(2)} °C</span>
                </div>
                <div className="flex justify-between items-center border-b border-border pb-2">
                  <span className="text-muted-foreground font-mono text-sm">PRESSURE</span>
                  <span className="font-mono text-lg">{machine.pressurePsi.toFixed(2)} PSI</span>
                </div>
                <div className="flex justify-between items-center border-b border-border pb-2">
                  <span className="text-muted-foreground font-mono text-sm">VIBRATION</span>
                  <span className="font-mono text-lg">{machine.vibrationMmS.toFixed(3)} mm/s</span>
                </div>
                <div className="text-xs text-right text-muted-foreground font-mono pt-2">
                  LAST_SYNC: {format(new Date(machine.lastReadingAt), 'HH:mm:ss')}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg text-destructive">Active Incidents</CardTitle>
            </CardHeader>
            <CardContent>
              {activeIncidents.length === 0 ? (
                <div className="text-muted-foreground font-mono text-sm">NO_ACTIVE_INCIDENTS</div>
              ) : (
                <div className="space-y-3">
                  {activeIncidents.map(inc => (
                    <div key={inc.id} className="border border-destructive/20 bg-destructive/5 p-3 rounded">
                      <div className="flex justify-between items-start mb-2">
                        <SeverityBadge severity={inc.severity} />
                        <StatusBadge status={inc.status} />
                      </div>
                      <Link href={`/incidents/${inc.id}`} className="font-medium text-sm hover:text-primary">
                        {inc.title}
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Readings Log</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Temp (°C)</TableHead>
                <TableHead className="text-right">Pressure (PSI)</TableHead>
                <TableHead className="text-right">Vibration (mm/s)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTelemetry.slice(0, 10).map((t) => (
                <TableRow key={t.id} className={t.isAnomaly ? "bg-destructive/10" : ""}>
                  <TableCell className="font-mono">{format(new Date(t.timestamp), 'yyyy-MM-dd HH:mm:ss')}</TableCell>
                  <TableCell>
                    {t.isAnomaly ? <span className="text-destructive font-mono font-bold">ANOMALY</span> : <span className="text-[#00E5FF] font-mono">OK</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono">{t.temperatureC.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{t.pressurePsi.toFixed(2)}</TableCell>
                  <TableCell className="text-right font-mono">{t.vibrationMmS.toFixed(3)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}