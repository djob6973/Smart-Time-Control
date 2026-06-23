import { Menu, Search, Sun, Moon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAppContext } from "@/lib/app-context";
import { NotificationCenter } from "./NotificationCenter";
import { useEffect, useState } from "react";

function useTheme() {
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("stc-theme", next ? "dark" : "light"); } catch {}
  }

  useEffect(() => {
    const saved = localStorage.getItem("stc-theme");
    if (saved === "dark") {
      setIsDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  return { isDark, toggle };
}

export function Topbar({ title, subtitle, right }: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const { profile } = useAuth();
  const { toggleSidebar } = useAppContext();
  const { isDark, toggle } = useTheme();

  const initials = profile?.nombre
    ? profile.nombre.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase()
    : profile?.email?.slice(0, 2).toUpperCase() ?? "??";

  return (
    <header className="sticky top-0 z-20 lg:static bg-background/90 lg:bg-transparent backdrop-blur-sm lg:backdrop-blur-none border-b border-border/60 lg:border-b-0">
      <div className="flex items-center gap-3 px-4 md:px-6 py-3 lg:py-5 lg:pb-4">
        {/* Hamburger — solo mobile */}
        <button
          onClick={toggleSidebar}
          aria-label="Abrir menú"
          className="lg:hidden shrink-0 size-9 rounded-xl flex items-center justify-center hover:bg-secondary text-foreground transition-colors"
        >
          <Menu className="size-5" />
        </button>

        {/* Título */}
        <div className="min-w-0 flex-1">
          <h1 className="text-base md:text-lg lg:text-[1.625rem] font-semibold lg:font-medium tracking-tight lg:tracking-[-0.01em] truncate font-display lg:leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">{subtitle}</p>
          )}
        </div>

        {/* Acciones opcionales de la ruta */}
        {right && <div className="hidden md:flex items-center gap-2">{right}</div>}

        {/* Search — oculto en mobile */}
        <div className="hidden md:flex items-center gap-2 rounded-pill border border-border bg-card px-3.5 py-2 w-56 lg:w-64 transition-shadow focus-within:shadow-soft focus-within:border-primary/40">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            placeholder="Buscar…"
            className="bg-transparent text-sm outline-none flex-1 min-w-0 placeholder:text-muted-foreground"
          />
        </div>

        {/* Toggle tema */}
        <button
          onClick={toggle}
          title="Cambiar tema"
          className="shrink-0 size-10 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          {isDark ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </button>

        <NotificationCenter />

        {/* Avatar */}
        <div
          className="size-10 shrink-0 rounded-full bg-foreground dark:bg-primary text-background dark:text-primary-foreground flex items-center justify-center text-sm font-bold"
          title={profile?.email}
        >
          {initials}
        </div>
      </div>
    </header>
  );
}
