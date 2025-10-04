'use client';

import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      className="btn btn-sm btn-outline-secondary"
      type="button"
      onClick={toggleTheme}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <i className={`bi bi-${theme === 'light' ? 'moon-stars-fill' : 'sun-fill'}`}></i>
    </button>
  );
}
