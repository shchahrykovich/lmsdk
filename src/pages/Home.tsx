/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/auth-client";

export default function Home(): React.ReactNode {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  if (isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (session) {
    return <Navigate to="/projects" replace />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome</CardTitle>
          <CardDescription>You are not signed in</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => { void navigate("/signin"); }} className="w-full">
            Sign in
          </Button>
          <Button onClick={() => { void navigate("/signup"); }} variant="outline" className="w-full">
            Sign up
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
