import { createFileRoute, redirect } from "@tanstack/react-router";

// Login eliminado — el acceso lo gestiona el perímetro de Dokku (oauth2-proxy/Google SSO).
export const Route = createFileRoute("/auth/login")({
  beforeLoad: () => { throw redirect({ to: "/" }); },
  component: () => null,
});
