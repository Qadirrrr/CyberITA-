import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import Logo from '../Logo';
import UserMenu from './UserMenu';
import NotificationBell from './NotificationBell';
import { useAuth, dashboardPath } from '../../context/AuthContext';
import { Button } from '../ui';
import { IconArrowRight, IconMail, IconMenu, IconX, IconShield } from '../icons';

const navLinks = [
  { to: '/courses', label: 'Courses' },
  { to: '/learning-paths', label: 'Learning Paths' },
  { to: '/blog', label: 'Blog' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

function Navbar() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();
  const onAuthPage = ['/login', '/register'].includes(location.pathname);

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-night-950/80 backdrop-blur-xl">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive ? 'text-white' : 'text-slate-400 hover:text-slate-100'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-2 lg:flex">
          {user ? (
            <>
              <Link
                to={dashboardPath(user.role)}
                className="mr-1 text-sm font-medium text-slate-300 transition hover:text-white"
              >
                Dashboard
              </Link>
              <NotificationBell />
              <UserMenu />
            </>
          ) : onAuthPage ? (
            <Button as={Link} to="/" variant="ghost" size="sm">
              Back to site
            </Button>
          ) : (
            <>
              <Button as={Link} to="/login" variant="ghost" size="sm">
                Sign in
              </Button>
              <Button as={Link} to="/register" size="sm">
                Get started
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-lg p-2 text-slate-300 transition hover:bg-white/5 lg:hidden"
          aria-label="Toggle navigation"
        >
          {open ? <IconX size={22} /> : <IconMenu size={22} />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-night-950/95 lg:hidden">
          <div className="container-page flex flex-col gap-1 py-4">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2.5 text-sm font-medium ${
                    isActive ? 'bg-white/5 text-white' : 'text-slate-300 hover:bg-white/5'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3">
              {user ? (
                <>
                  <Button as={Link} to={dashboardPath(user.role)} onClick={() => setOpen(false)}>
                    Go to dashboard
                  </Button>
                  <Button as={Link} to="/student/profile" variant="secondary" onClick={() => setOpen(false)}>
                    Profile
                  </Button>
                </>
              ) : (
                <>
                  <Button as={Link} to="/login" variant="secondary" onClick={() => setOpen(false)}>
                    Sign in
                  </Button>
                  <Button as={Link} to="/register" onClick={() => setOpen(false)}>
                    Create free account
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 bg-night-950/60">
      <div className="container-page grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2 lg:col-span-1">
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-6 text-slate-500">
            Practical IT training built around real terminal labs, verified work reports and industry-recognised
            certificates.
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
            <IconShield size={14} className="text-brand-400" />
            100% browser-based sandboxed environments
          </div>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Platform</h4>
          <ul className="mt-4 space-y-2.5 text-sm">
            {navLinks.slice(0, 4).map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="text-slate-500 transition hover:text-brand-300">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Resources</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-500">
            <li>
              <Link to="/verify" className="transition hover:text-brand-300">
                Verify a certificate
              </Link>
            </li>
            <li>
              <Link to="/contact" className="transition hover:text-brand-300">
                Support &amp; enquiries
              </Link>
            </li>
            <li>
              <Link to="/about" className="transition hover:text-brand-300">
                Our approach
              </Link>
            </li>
            <li>
              <Link to="/register" className="transition hover:text-brand-300">
                Create an account
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Stay sharp</h4>
          <p className="mt-4 text-sm leading-6 text-slate-500">
            New labs and courses are added every month. Start with a free account and upgrade your skills at your pace.
          </p>
          <Button as={Link} to="/register" size="sm" className="mt-4">
            Start learning <IconArrowRight size={15} />
          </Button>
          <a
            href="mailto:hello@cyberita.plus"
            className="mt-4 inline-flex items-center gap-2 text-xs text-slate-500 transition hover:text-brand-300"
          >
            <IconMail size={14} /> hello@cyberita.plus
          </a>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="container-page flex flex-col items-center justify-between gap-2 py-5 text-xs text-slate-600 sm:flex-row">
          <p>&copy; {new Date().getFullYear()} CyberITA+. All rights reserved.</p>
          <p>Designed for hands-on learners, built for real-world results.</p>
        </div>
      </div>
    </footer>
  );
}

export default function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
