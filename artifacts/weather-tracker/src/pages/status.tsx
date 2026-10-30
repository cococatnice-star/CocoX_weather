import { useGetStatus, getGetStatusQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import { Server, Activity, Link as LinkIcon, Bell, Database } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function Status() {
  const { data: status, isLoading } = useGetStatus({
    query: { refetchInterval: 10000, queryKey: getGetStatusQueryKey() }
  });

  if (isLoading || !status) {
    return (
      <div className="text-center py-12 font-mono text-muted-foreground uppercase flex items-center justify-center gap-3">
        <Activity className="animate-pulse" /> Querying system status...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="border-b border-border pb-4">
        <h1 className="text-3xl font-display font-bold uppercase tracking-tight text-foreground flex items-center gap-3">
          <Server className="text-primary" />
          System Diagnostics
        </h1>
        <p className="text-muted-foreground font-mono text-sm mt-1">Operational status and configuration</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-mono uppercase flex items-center gap-2">
              <Activity size={16} /> Heartbeat
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-mono text-sm">Status</span>
              <Badge className="bg-green-500/20 text-green-400 hover:bg-green-500/30 border-green-500/50">Online</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-mono text-sm">Last Sync</span>
              <span className="font-mono text-sm">
                {status.lastCheckAt ? format(new Date(status.lastCheckAt), 'yyyy-MM-dd HH:mm:ss') : 'Pending...'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-mono text-sm">Polling Interval</span>
              <span className="font-mono text-sm">{status.checkIntervalSeconds}s</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-mono uppercase flex items-center gap-2">
              <Database size={16} /> Telemetry
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground font-mono text-sm">Alerts Processed</span>
              <span className="font-mono text-xl font-bold">{status.totalAlertsSeen?.toLocaleString() || 0}</span>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-muted-foreground font-mono text-sm">Data Source</span>
              <div className="bg-muted p-2 rounded-md font-mono text-xs break-all flex items-center gap-2">
                <LinkIcon size={12} className="shrink-0 text-muted-foreground" />
                <a href={status.alertSourceUrl} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
                  {status.alertSourceUrl}
                </a>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card md:col-span-2">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-mono uppercase flex items-center gap-2">
              <Bell size={16} /> Integrations
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border/50">
              <div className="flex items-center gap-4">
                <div className={`w-3 h-3 rounded-full ${status.discordConfigured ? 'bg-green-500' : 'bg-red-500'}`} />
                <div>
                  <h4 className="font-bold text-foreground">Discord Webhook</h4>
                  <p className="text-xs text-muted-foreground font-mono mt-1">For critical alert broadcasting</p>
                </div>
              </div>
              <Badge variant={status.discordConfigured ? "default" : "destructive"} className="font-mono uppercase">
                {status.discordConfigured ? "Connected" : "Unconfigured"}
              </Badge>
            </div>
            {!status.discordConfigured && (
              <p className="text-xs text-muted-foreground mt-4 font-mono">
                System is running in local-only mode. Configure DISCORD_WEBHOOK_URL environment variable to enable external broadcasting.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
