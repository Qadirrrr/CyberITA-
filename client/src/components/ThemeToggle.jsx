import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { IconMoon, IconSun } from './icons';

export default function ThemeToggle({ id, className = '', showLabel = false, size = 'md' }) {
  const { theme, toggleTheme, isDark } = useTheme();

  return (
    <button
      id={id}
      type="button"
      onClick={toggleTheme}
      data-testid="theme-toggle"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`group relative inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/90 p-2 text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-white/20 dark:hover:bg-white/10 dark:hover:text-white ${
        size === 'sm' ? 'h-8 px-2 text-xs' : 'h-9 px-2.5 text-sm'
      } ${className}`}
    >
      <div className="relative flex h-4 w-4 items-center justify-center shrink-0">
        {isDark ? (
          <IconSun size={16} className="text-amber-400 transition-transform duration-200" />
        ) : (
          <IconMoon size={16} className="text-slate-700 transition-transform duration-200" />
        )}
      </div>
      {showLabel && (
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {isDark ? 'Light mode' : 'Dark mode'}
        </span>
      )}
    </button>
  );
}
