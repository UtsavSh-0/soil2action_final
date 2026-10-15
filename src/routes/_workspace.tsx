import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

// Authentication readiness: when an identity provider is added, guard this layout
// with beforeLoad and redirect to /login. The FastAPI backend must still verify tokens.
export const Route = createFileRoute("/_workspace")({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
