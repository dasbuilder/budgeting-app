---
name: Dark mode implementation
description: How dark mode is implemented in this project — theme provider, toggle location, and Tailwind config
type: project
---

Dark mode uses Tailwind's `class` strategy (`darkMode: 'class'` in `tailwind.config.js`). Theme state lives in `frontend/lib/ThemeContext.tsx` (a React context provider), which reads/writes `localStorage` on mount and toggles the `dark` class on `<html>`. The `ThemeProvider` wraps the app in `_app.tsx`.

The `ThemeToggle` component lives in `frontend/components/ThemeToggle.tsx` — it's a styled `<button role="switch">` with a sliding knob. It reads `isDark`/`toggleTheme` from `useTheme()`. The toggle is placed in the header of `index.tsx` next to the "Clear Database" button.

**Why:** The `class` strategy was chosen (over `media`) so the user can override their OS preference and the choice is persisted in `localStorage`. On first visit with no stored preference, it falls back to `prefers-color-scheme`.

**How to apply:** All dark-mode styling uses `dark:` Tailwind variants. The pattern is: cards use `dark:bg-gray-800`, page background uses `dark:bg-gray-900`, borders use `dark:border-gray-700`, and body text uses `dark:text-white` / `dark:text-gray-200` / `dark:text-gray-400` for hierarchy.
