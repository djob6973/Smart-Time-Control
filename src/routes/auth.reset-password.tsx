import { createFileRoute, redirect } from "@tanstack/react-router";

// Reset de contraseña eliminado — sin sistema de passwords en este proyecto.
export const Route = createFileRoute("/auth/reset-password")({
  beforeLoad: () => { throw redirect({ to: "/" }); },
  component: () => null,
});
