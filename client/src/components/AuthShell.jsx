import { Link } from 'react-router-dom';
import Logo from './Logo';
import { IconCheckCircle, IconShield, IconTerminal } from './icons';

export default function AuthShell({ title, subtitle, children, footer, quote }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden border-r border-white/5 bg-night-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 bg-hero-glow" />
        <div className="pointer-events-none absolute inset-0 bg-noise opacity-30" />
        <div className="relative">
          <Logo />
          <div className="mt-16 max-w-md">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-400">CyberITA+ learning platform</p>
            <h2 className="mt-4 text-balance font-display text-3xl font-semibold leading-tight xl:text-4xl">
              {quote?.title || 'Learn IT where it counts — in the terminal.'}
            </h2>
            <p className="mt-4 text-sm leading-7 text-slate-400">
              {quote?.body ||
                'Sandboxed Linux labs, verified steps and instructor-reviewed reports. Build evidence of real skill, not just watch time.'}
            </p>
            <ul className="mt-8 space-y-3">
              {[
                'Instant browser-based lab environments',
                'Automatic command and output verification',
                'Practical reports reviewed by instructors',
                'Serialised certificates you can share',
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <IconCheckCircle size={16} className="mt-0.5 shrink-0 text-brand-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="relative mt-12">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-night-950/90 shadow-2xl">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
              <span className="h-2 w-2 rounded-full bg-rose-400/70" />
              <span className="h-2 w-2 rounded-full bg-amber-400/70" />
              <span className="h-2 w-2 rounded-full bg-emerald-400/70" />
              <span className="ml-2 font-mono text-[10px] text-slate-500">student@cyberita-lab</span>
            </div>
            <div className="space-y-1.5 p-4 font-mono text-[11.5px] leading-5">
              <p>
                <span className="text-emerald-400">student@lab</span>
                <span className="text-slate-500">:~$ </span>
                <span className="text-slate-100">ls -la</span>
              </p>
              <p className="text-slate-400">drwxr-xr-x  2 student student welcome.txt</p>
              <p>
                <span className="text-emerald-400">student@lab</span>
                <span className="text-slate-500">:~$ </span>
                <span className="text-slate-100">cat welcome.txt</span>
              </p>
              <p className="text-slate-300">Welcome to your CyberITA+ lab environment.</p>
              <p className="flex items-center gap-1.5 text-emerald-300">
                <IconCheckCircle size={11} /> Step verified
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-500">
            <IconShield size={13} className="text-brand-400" /> Isolated sandbox · nothing to install
          </div>
        </div>
      </div>

      <div className="flex flex-col">
        <div className="flex h-16 items-center justify-between border-b border-white/5 px-5 sm:px-8 lg:border-0">
          <Logo className="lg:hidden" />
          <Link to="/" className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-brand-300">
            <IconTerminal size={14} /> Back to site
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">
            <h1 className="font-display text-2xl font-semibold sm:text-3xl">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">{subtitle}</p>
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-6 text-center text-sm text-slate-500">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
