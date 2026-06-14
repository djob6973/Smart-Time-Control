import { createFileRoute, redirect } from "@tanstack/react-router";

// OAuth callback removed — authentication is now handled via cookie sessions.
export const Route = createFileRoute("/auth/callback")({
  beforeLoad: () => {
    throw redirect({ to: "/" });
  },
  component: () => null,
});
