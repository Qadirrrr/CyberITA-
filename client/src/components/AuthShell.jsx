import Logo from './Logo';
import { IconLock } from './icons';
import ThemeToggle from './ThemeToggle';

export default function AuthShell({ title, subtitle, children, footer, compact = false, wide = false }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 transition-colors duration-200 dark:bg-night-950">
      <div className="pointer-events-none absolute -left-40 top-1/3 h-80 w-80 rounded-full bg-brand-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 bottom-0 h-80 w-80 rounded-full bg-accent-500/10 blur-3xl" />

      {/* Top action bar with theme toggle */}
      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <main
        className={`relative flex min-h-screen items-center justify-center px-4 sm:px-6 ${
          compact ? 'py-4 sm:py-6' : 'py-10'
        }`}
      >
        <div className={`w-full ${compact ? (wide ? 'max-w-[500px]' : 'max-w-[430px]') : 'max-w-[460px]'}`}>
          <div
            className={`relative overflow-hidden border border-slate-200/90 bg-white/95 shadow-xl backdrop-blur-xl transition-colors dark:border-white/10 dark:bg-night-900/75 dark:shadow-[0_30px_90px_-45px_rgba(0,0,0,0.95)] ${
              compact ? 'rounded-2xl p-4 sm:p-6' : 'rounded-[24px] p-6 sm:p-9'
            }`}
          >
            <div className="absolute inset-x-10 top-0 h-px bg-brand-500/40" />
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-brand-500/10 blur-3xl" />

            <div className="relative">
              <div className="flex flex-col items-center text-center">
                <Logo className="transition hover:opacity-90" />
                {!compact && (
                  <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
                    <IconLock size={13} className="text-brand-600 dark:text-brand-400" /> Secure access
                  </span>
                )}
                <h1
                  className={`font-display font-semibold tracking-tight text-slate-900 dark:text-white ${
                    compact ? 'mt-3 text-xl sm:text-2xl' : 'mt-5 text-2xl sm:text-[1.7rem]'
                  }`}
                >
                  {title}
                </h1>
                <p
                  className={`mx-auto max-w-sm text-slate-600 dark:text-slate-400 ${
                    compact ? 'mt-1.5 text-xs leading-5' : 'mt-2 text-sm leading-6'
                  }`}
                >
                  {subtitle}
                </p>
              </div>

              <div className={compact ? 'mt-3 sm:mt-4' : 'mt-7'}>{children}</div>

              {footer && (
                <div
                  className={`border-t border-slate-100 text-center text-sm text-slate-500 dark:border-white/10 dark:text-slate-400 ${
                    compact ? 'mt-3 pt-3 sm:mt-4' : 'mt-7 pt-5'
                  }`}
                >
                  {footer}
                </div>
              )}
            </div>
          </div>

          {!compact && (
            <p className="mt-5 text-center text-xs leading-5 text-slate-500 dark:text-slate-600">
              Protected by CyberITA+ security controls
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
