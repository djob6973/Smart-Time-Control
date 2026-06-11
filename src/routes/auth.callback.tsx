import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    let handled = false;
    let sub: ReturnType<typeof supabase.auth.onAuthStateChange>["data"]["subscription"] | null = null;

    const go = (to: string) => {
      if (handled) return;
      handled = true;
      sub?.unsubscribe();
      navigate({ to: to as "/" });
    };

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") go("/auth/login");
      else if (event === "SIGNED_IN") go("/");
    });
    sub = data.subscription;

    const code = new URL(window.location.href).searchParams.get("code");
    if (code) {
      supabase.auth
        .exchangeCodeForSession(window.location.href)
        .then(({ error }) => {
          if (error) go("/auth/login");
          else setTimeout(() => go("/"), 1500);
        });
    } else {
      setTimeout(() => go("/"), 3000);
    }

    return () => sub?.unsubscribe();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">Verificando tu cuenta…</p>
      </div>
    </div>
  );
}
