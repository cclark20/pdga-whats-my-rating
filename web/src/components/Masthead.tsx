import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";

type Theme = "dark" | "light";

export default function Masthead() {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme as Theme) ?? "dark",
  );

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // private mode; the choice just won't persist
    }
    setTheme(next);
  }

  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <header className="flex items-center justify-between border-b border-rule py-1">
      <Link
        to="/"
        className="flex min-h-11 items-center font-display text-body font-semibold tracking-tight no-underline"
      >
        What's My Rating?
      </Link>
      <button
        type="button"
        onClick={toggle}
        aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
        className="label -mr-2 flex min-h-11 items-center gap-2 rounded-sm px-2 transition-colors duration-150 ease-out hover:text-text"
      >
        <Icon size={16} strokeWidth={1.5} aria-hidden />
        {theme === "dark" ? "Light" : "Dark"}
      </button>
    </header>
  );
}
