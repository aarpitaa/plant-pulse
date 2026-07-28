import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-[80vh] w-full flex items-center justify-center">
      <Card className="w-full max-w-md mx-4 border-destructive border-2">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className="text-destructive text-6xl font-bold font-mono">404</div>
          </div>
          <h1 className="text-2xl font-bold">ROUTE_NOT_FOUND</h1>
          <p className="text-muted-foreground font-mono text-sm">
            The requested subsystem is unreachable or does not exist in the current environment context.
          </p>
          <div className="pt-4">
            <Link href="/" className="text-primary hover:underline font-mono uppercase">
              [ RETURN TO MISSION CONTROL ]
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}