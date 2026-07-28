import { useGetSimulatorStatus, useStartSimulator, useStopSimulator, useUpdateSimulatorConfig, useRunExperiment } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Square, AlertOctagon, Activity, Zap, ServerCrash } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export function SimulatorControl() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: status, isLoading } = useGetSimulatorStatus({
    query: { refetchInterval: 3000, queryKey: ['simulatorStatus'] }
  });

  const startSim = useStartSimulator({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['simulatorStatus'] })
    }
  });

  const stopSim = useStopSimulator({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['simulatorStatus'] })
    }
  });

  const updateConfig = useUpdateSimulatorConfig({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['simulatorStatus'] });
        toast({ title: "Config Updated", description: "Simulator parameters modified successfully." });
      }
    }
  });

  const runExperiment = useRunExperiment({
    mutation: {
      onSuccess: (data) => {
        toast({ 
          title: data.triggered ? "Experiment Deployed" : "Experiment Skipped", 
          description: data.message,
          variant: data.triggered ? "destructive" : "default"
        });
      }
    }
  });

  if (isLoading && !status) {
    return <div className="text-muted-foreground font-mono animate-pulse">CONNECTING_TO_SIMULATOR_ENGINE...</div>;
  }

  if (!status) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Chaos Simulator</h1>
        <p className="text-muted-foreground font-mono mt-1">Control telemetry generation and inject system failures</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Engine Status</CardTitle>
            <CardDescription>Main telemetry generator control</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-6 border rounded-lg bg-card mb-6">
              <div className="flex items-center gap-4">
                <div className={`w-4 h-4 rounded-full ${status.running ? 'bg-[#00E5FF] animate-pulse' : 'bg-muted-foreground'}`}></div>
                <div>
                  <div className="font-bold text-xl">{status.running ? 'ONLINE' : 'OFFLINE'}</div>
                  <div className="text-sm font-mono text-muted-foreground">
                    {status.running ? `GENERATING ${status.eventsPerSecond} EV/S` : 'AWAITING_COMMAND'}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {!status.running ? (
                  <Button onClick={() => startSim.mutate()} disabled={startSim.isPending} className="bg-[#00E5FF] text-black hover:bg-[#00E5FF]/80 font-mono">
                    <Play className="w-4 h-4 mr-2" /> ENGAGE
                  </Button>
                ) : (
                  <Button onClick={() => stopSim.mutate()} disabled={stopSim.isPending} variant="destructive" className="font-mono">
                    <Square className="w-4 h-4 mr-2" /> HALT
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="border border-border p-3 rounded">
                <div className="text-xs text-muted-foreground font-mono mb-1">RATE</div>
                <div className="font-bold">{status.eventsPerSecond} /s</div>
              </div>
              <div className="border border-border p-3 rounded">
                <div className="text-xs text-muted-foreground font-mono mb-1">MACHINES</div>
                <div className="font-bold">{status.machineCount}</div>
              </div>
              <div className="border border-border p-3 rounded">
                <div className="text-xs text-muted-foreground font-mono mb-1">ANOMALY MODE</div>
                <div className="font-bold text-primary">{status.anomalyMode}</div>
              </div>
              <div className="border border-border p-3 rounded">
                <div className="text-xs text-muted-foreground font-mono mb-1">DLQ ENABLED</div>
                <div className="font-bold">{status.dlqEnabled ? 'YES' : 'NO'}</div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-bold border-b border-border pb-2">Adjust Parameters</h3>
              <div className="flex gap-4">
                <Button 
                  variant="outline" 
                  onClick={() => updateConfig.mutate({ data: { eventsPerSecond: 100 } })}
                  disabled={status.eventsPerSecond === 100 || updateConfig.isPending}
                >100 e/s</Button>
                <Button 
                  variant="outline" 
                  onClick={() => updateConfig.mutate({ data: { eventsPerSecond: 1000 } })}
                  disabled={status.eventsPerSecond === 1000 || updateConfig.isPending}
                >1K e/s</Button>
                <Button 
                  variant="outline" 
                  onClick={() => updateConfig.mutate({ data: { eventsPerSecond: 5000 } })}
                  disabled={status.eventsPerSecond === 5000 || updateConfig.isPending}
                  className="text-primary border-primary"
                >5K e/s (STRESS)</Button>
              </div>
              
              <div className="flex gap-4 mt-2">
                <Button 
                  variant="outline" 
                  onClick={() => updateConfig.mutate({ data: { anomalyMode: 'none' } })}
                  disabled={status.anomalyMode === 'none' || updateConfig.isPending}
                >Normal</Button>
                <Button 
                  variant="outline" 
                  onClick={() => updateConfig.mutate({ data: { anomalyMode: 'temperature-spike' } })}
                  disabled={status.anomalyMode === 'temperature-spike' || updateConfig.isPending}
                >Temp Spikes</Button>
                <Button 
                  variant="outline" 
                  onClick={() => updateConfig.mutate({ data: { anomalyMode: 'malformed' } })}
                  disabled={status.anomalyMode === 'malformed' || updateConfig.isPending}
                  className="text-destructive border-destructive"
                >Corrupt Data</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertOctagon className="w-5 h-5" /> Chaos Experiments
            </CardTitle>
            <CardDescription>Inject structural failures</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button 
              variant="outline" 
              className="w-full justify-start border-destructive/50 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => runExperiment.mutate({ experiment: 'pod-failure' })}
              disabled={runExperiment.isPending}
            >
              <ServerCrash className="w-4 h-4 mr-3 text-destructive" />
              Kill Worker Pod
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start border-warning/50 hover:bg-warning/10 hover:text-warning"
              onClick={() => runExperiment.mutate({ experiment: 'kafka-backlog' })}
              disabled={runExperiment.isPending}
            >
              <Zap className="w-4 h-4 mr-3 text-warning" />
              Simulate Network Lag
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-start border-primary/50 hover:bg-primary/10 hover:text-primary"
              onClick={() => runExperiment.mutate({ experiment: 'database-latency' })}
              disabled={runExperiment.isPending}
            >
              <Activity className="w-4 h-4 mr-3 text-primary" />
              Inject DB Latency
            </Button>
            <div className="p-4 bg-muted/30 rounded text-xs text-muted-foreground font-mono mt-4">
              WARNING: Experiments will impact live SLO metrics and may trigger real automated remediation actions.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}