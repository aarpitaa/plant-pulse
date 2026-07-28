import { Link, useLocation } from "wouter";
import { Activity, Server, AlertTriangle, ShieldCheck, ActivitySquare, TerminalSquare, Database } from "lucide-react";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Executive", icon: ActivitySquare },
    { href: "/plants", label: "Sites", icon: Server },
    { href: "/incidents", label: "Incidents", icon: AlertTriangle },
    { href: "/slo", label: "SLO Compliance", icon: ShieldCheck },
    { href: "/remediation", label: "Audit Log", icon: Activity },
    { href: "/simulator", label: "Chaos Sim", icon: TerminalSquare },
    { href: "/kafka", label: "Pipeline", icon: Database },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row">
      <nav className="w-full md:w-64 bg-sidebar border-r border-sidebar-border flex-shrink-0 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-sidebar-border">
          <div className="flex items-center gap-2 text-primary font-bold text-xl tracking-tight">
            <ActivitySquare className="w-6 h-6" />
            PLANT_PULSE
          </div>
        </div>
        <div className="flex-1 py-6 flex flex-col gap-1 px-4 overflow-y-auto">
          <div className="text-xs font-mono text-muted-foreground mb-2 px-2 uppercase tracking-wider">Mission Control</div>
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    isActive
                      ? "bg-sidebar-primary/10 text-sidebar-primary border border-sidebar-primary/20"
                      : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </div>
        <div className="p-4 border-t border-sidebar-border text-xs font-mono text-muted-foreground">
          SYS_STATUS: ONLINE<br/>
          ENV: PROD-01
        </div>
      </nav>
      <main className="flex-1 overflow-x-hidden flex flex-col h-screen">
        <header className="h-16 border-b border-border bg-card/50 backdrop-blur flex items-center px-6 flex-shrink-0 z-10 sticky top-0">
          <div className="font-mono text-sm text-muted-foreground">
            {new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-background relative z-0">
          {children}
        </div>
      </main>
    </div>
  );
}