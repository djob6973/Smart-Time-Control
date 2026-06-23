import { useEffect, useState } from "react";

export function useTheme() {
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
