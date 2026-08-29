// useTheme.js — 3-Mode Theme Hook (Light / Dark / System Default) for Neo-Brutalism
import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "flashcrush_theme";

/**
 * Returns system color scheme preference: "dark" | "light"
 */
function getSystemTheme() {
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || "system";
    } catch {
      return "system";
    }
  });

  const [resolvedTheme, setResolvedTheme] = useState(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : "system";
    if (saved === "dark") return "dark";
    if (saved === "light") return "light";
    return getSystemTheme();
  });

  // Apply theme to document & meta tags
  const applyTheme = useCallback((activeResolvedTheme) => {
    const root = document.documentElement;
    root.setAttribute("data-theme", activeResolvedTheme);
    root.style.colorScheme = activeResolvedTheme;

    // Update meta theme-color for mobile address bar
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute("content", activeResolvedTheme === "dark" ? "#121214" : "#FFD93D");
    }
  }, []);

  // Update theme when preference changes or system preference changes
  useEffect(() => {
    let active = theme;
    if (theme === "system") {
      active = getSystemTheme();
    }
    setResolvedTheme(active);
    applyTheme(active);

    // If system mode, listen for OS theme changes in real time
    if (theme === "system" && typeof window !== "undefined" && window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = (e) => {
        const newSys = e.matches ? "dark" : "light";
        setResolvedTheme(newSys);
        applyTheme(newSys);
      };
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme, applyTheme]);

  const setTheme = useCallback((newTheme) => {
    if (newTheme !== "light" && newTheme !== "dark" && newTheme !== "system") return;
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch (e) {
      console.warn("Could not save theme to localStorage", e);
    }
    setThemeState(newTheme);
  }, []);

  return {
    theme,           // "light" | "dark" | "system"
    resolvedTheme,   // "light" | "dark"
    setTheme,        // fn("light"|"dark"|"system")
  };
}
