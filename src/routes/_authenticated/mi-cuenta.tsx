import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { Shield } from "lucide-react";

export const Route = createFileRoute("/_authenticated/mi-cuenta")({
  head: () => ({ meta: [{ title: "Mi Cuenta · STC" }] }),
  component: MiCuentaPage,
});

const ROLE_LABELS: Record<string, Record<string, string>> = {
  es: { admin: "Super Admin", supervisor: "Supervisor", lider: "Líder", gestor: "Gestor", consulta: "Consulta" },
  en: { admin: "Super Admin", supervisor: "Supervisor", lider: "Leader",  gestor: "Manager", consulta: "Read-only" },
  pt: { admin: "Super Admin", supervisor: "Supervisor", lider: "Líder",  gestor: "Gestor",  consulta: "Somente leitura" },
};

function MiCuentaPage() {
  const { user, profile, role } = useAuth();
  const { t, lang } = useI18n();

  const initials = profile?.nombre
    ? profile.nombre.split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? "??";

  const roleLabel = role ? (ROLE_LABELS[lang]?.[role] ?? role.toUpperCase()) : null;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">{t("account_title")}</h1>

      {/* Tarjeta de perfil */}
      <div className="rounded-2xl border border-border bg-card p-6 flex items-center gap-5">
        {/* Avatar */}
        <div
          className="size-16 shrink-0 rounded-full flex items-center justify-center text-xl font-bold"
          style={{ background: "rgba(237,86,80,0.12)", color: "#ED5650" }}
        >
          {initials}
        </div>

        {/* Info */}
        <div className="flex flex-col gap-1.5 min-w-0">
          <p className="text-base font-semibold truncate">
            {profile?.nombre || user?.email}
          </p>
          <p className="text-sm text-muted-foreground truncate">
            {user?.email}
          </p>
          {roleLabel && (
            <span
              className="inline-flex items-center gap-1.5 self-start px-2 py-0.5 rounded text-[11px] font-semibold tracking-widest uppercase"
              style={{ background: "rgba(237,86,80,0.15)", color: "#ED5650" }}
            >
              <Shield className="size-3" />
              {roleLabel}
            </span>
          )}
        </div>
      </div>

      {/* Tarjeta SSO */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {t("account_sso_msg")}
        </p>
      </div>
    </div>
  );
}
