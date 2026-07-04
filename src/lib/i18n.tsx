import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Lang = "es" | "en" | "pt";

export const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  { code: "es", label: "Español",    flag: "🇨🇴" },
  { code: "en", label: "English",    flag: "🇺🇸" },
  { code: "pt", label: "Português",  flag: "🇧🇷" },
];

const T = {
  es: {
    // Nav
    dashboard:   "Dashboard",
    scheduler:   "Programación",
    mi_horario:  "Mi Horario",
    jornada:     "Control de Jornada",
    employees:   "Trabajadores",
    areas:       "Áreas",
    absences:    "Ausencias",
    reports:     "Reportes",
    settings:    "Configuración",
    mi_cuenta:   "Mi Cuenta",
    // Common
    save:        "Guardar",
    cancel:      "Cancelar",
    delete:      "Eliminar",
    edit:        "Editar",
    create:      "Crear",
    search:      "Buscar",
    loading:     "Cargando…",
    error:       "Error",
    // Account page
    account_title:   "Mi Cuenta",
    account_sso_msg: "Tu sesión está gestionada por Google SSO. No se requiere contraseña adicional.",
    // Theme
    dark_mode:  "Modo oscuro",
    light_mode: "Modo claro",
    // Lang picker
    language: "Idioma",
    // Roles
    admin:      "Administrador",
    supervisor: "Supervisor",
    lider:      "Líder",
    gestor:     "Gestor",
    consulta:   "Consulta",
  },
  en: {
    dashboard:   "Dashboard",
    scheduler:   "Scheduling",
    mi_horario:  "My Schedule",
    jornada:     "Time Control",
    employees:   "Employees",
    areas:       "Areas",
    absences:    "Absences",
    reports:     "Reports",
    settings:    "Settings",
    mi_cuenta:   "My Account",
    save:        "Save",
    cancel:      "Cancel",
    delete:      "Delete",
    edit:        "Edit",
    create:      "Create",
    search:      "Search",
    loading:     "Loading…",
    error:       "Error",
    account_title:   "My Account",
    account_sso_msg: "Your session is managed by Google SSO. No additional password is required.",
    dark_mode:  "Dark mode",
    light_mode: "Light mode",
    language: "Language",
    admin:      "Administrator",
    supervisor: "Supervisor",
    lider:      "Leader",
    gestor:     "Manager",
    consulta:   "Read-only",
  },
  pt: {
    dashboard:   "Dashboard",
    scheduler:   "Programação",
    mi_horario:  "Meu Horário",
    jornada:     "Controle de Jornada",
    employees:   "Funcionários",
    areas:       "Áreas",
    absences:    "Ausências",
    reports:     "Relatórios",
    settings:    "Configurações",
    mi_cuenta:   "Minha Conta",
    save:        "Salvar",
    cancel:      "Cancelar",
    delete:      "Excluir",
    edit:        "Editar",
    create:      "Criar",
    search:      "Pesquisar",
    loading:     "Carregando…",
    error:       "Erro",
    account_title:   "Minha Conta",
    account_sso_msg: "Sua sessão é gerenciada pelo Google SSO. Nenhuma senha adicional é necessária.",
    dark_mode:  "Modo escuro",
    light_mode: "Modo claro",
    language: "Idioma",
    admin:      "Administrador",
    supervisor: "Supervisor",
    lider:      "Líder",
    gestor:     "Gestor",
    consulta:   "Somente leitura",
  },
} satisfies Record<Lang, Record<string, string>>;

export type TranslationKey = keyof typeof T.es;

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "es",
  setLang: () => {},
  t: (k) => k,
});

const STORAGE_KEY = "stc_lang";

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "es";
    const stored = localStorage.getItem(STORAGE_KEY) as Lang | null;
    return stored && (stored === "es" || stored === "en" || stored === "pt") ? stored : "es";
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(STORAGE_KEY, l);
    document.documentElement.lang = l;
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = useCallback((key: TranslationKey): string => T[lang][key] ?? T.es[key] ?? key, [lang]);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
