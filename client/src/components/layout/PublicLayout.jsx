import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import Logo from '../Logo';
import UserMenu from './UserMenu';
import NotificationBell from './NotificationBell';
import { useAuth, dashboardPath } from '../../context/AuthContext';
import api from '../../lib/api';
import useClickOutside from '../../hooks/useClickOutside';
import { Button } from '../ui';
import ThemeToggle from '../ThemeToggle';
import {
  IconArrowRight,
  IconChevronDown,
  IconChevronRight,
  IconMail,
  IconMenu,
  IconShield,
  IconX,
} from '../icons';

const navLinks = [
  { to: '/learning-paths', label: 'Learning Paths' },
  { to: '/blog', label: 'Blog' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
];

const footerLinks = [{ to: '/courses', label: 'Courses' }, ...navLinks];

function groupCatalog(items = []) {
  const categories = new Map();

  for (const item of items) {
    const category = (item.category || 'General').trim() || 'General';
    const subcategory = (item.subcategory || 'General').trim() || 'General';
    if (!categories.has(category)) categories.set(category, new Map());
    const subs = categories.get(category);
    if (!subs.has(subcategory)) subs.set(subcategory, []);
    subs.get(subcategory).push(item);
  }

  const byName = (a, b) => {
    if (a.name === 'General') return 1;
    if (b.name === 'General') return -1;
    return a.name.localeCompare(b.name);
  };

  return [...categories.entries()]
    .map(([name, subs]) => ({
      name,
      subcategories: [...subs.entries()]
        .map(([subName, entries]) => ({
          name: subName,
          items: entries.slice().sort((a, b) => a.title.localeCompare(b.title)),
        }))
        .sort(byName),
    }))
    .sort(byName);
}

function itemsIn(group) {
  return group.subcategories.flatMap((sub) => sub.items);
}

function CatalogMenu({ label, groups, loading, allHref, allLabel, itemHref, emptyLabel }) {
  const [open, setOpen] = useState(false);
  const [activeName, setActiveName] = useState('');
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false), open);

  const activeGroup = groups.find((group) => group.name === activeName) || groups[0] || null;

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
          open ? 'text-slate-900 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
        }`}
      >
        {label}
        <IconChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 pt-2">
          <div className="flex w-[min(32rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white/95 shadow-2xl shadow-slate-900/10 backdrop-blur-xl dark:border-white/10 dark:bg-night-900/95 dark:shadow-black/40">
            <ul className="max-h-[70vh] w-56 shrink-0 overflow-y-auto border-r border-slate-100 py-2 dark:border-white/5 bg-slate-50/50 dark:bg-transparent">
              {groups.map((group) => {
                const active = activeGroup?.name === group.name;
                return (
                  <li key={group.name}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveName(group.name)}
                      onFocus={() => setActiveName(group.name)}
                      onClick={() => setActiveName(group.name)}
                      className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition ${
                        active
                          ? 'bg-brand-50 font-medium text-brand-700 dark:bg-white/10 dark:text-white'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white'
                      }`}
                    >
                      <span className="truncate">{group.name}</span>
                      <IconChevronRight size={14} className={active ? 'text-brand-300' : 'text-slate-500'} />
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex min-h-[14rem] w-64 flex-col">
              <div className="max-h-[62vh] flex-1 overflow-y-auto p-3">
                {!activeGroup ? (
                  <p className="px-2 py-6 text-sm text-slate-500">{loading ? 'Loading...' : emptyLabel}</p>
                ) : (
                  <ul className="space-y-0.5">
                    {itemsIn(activeGroup).map((item) => (
                      <li key={item.id}>
                        <Link
                          to={itemHref(item)}
                          onClick={() => setOpen(false)}
                          className="block truncate rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white"
                        >
                          {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="border-t border-white/5 p-2">
                <Link
                  to={allHref}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-brand-300 transition hover:bg-brand-400/10 hover:text-brand-200"
                >
                  {allLabel} <IconArrowRight size={12} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileCatalog({ label, groups, loading, allHref, allLabel, itemHref, emptyLabel, onNavigate }) {
  return (
    <details className="group/nav rounded-lg">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/5">
        {label}
        <IconChevronDown size={16} className="transition group-open/nav:rotate-180" />
      </summary>
      <div className="mt-1 max-h-96 overflow-y-auto rounded-xl border border-white/5 bg-white/[0.02] p-2">
        {groups.length === 0 ? (
          <p className="px-2 py-2 text-xs text-slate-500">{loading ? 'Loading...' : emptyLabel}</p>
        ) : (
          <>
            <div className="space-y-0.5">
              {groups.map((group) => (
                <details key={group.name} className="group/cat rounded-lg">
                  <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg px-2.5 py-2 text-sm text-slate-300 transition hover:bg-white/5">
                    {group.name}
                    <IconChevronDown size={14} className="text-slate-500 transition group-open/cat:rotate-180" />
                  </summary>
                  <ul className="mb-1 space-y-0.5 pl-2">
                    {itemsIn(group).map((item) => (
                      <li key={item.id}>
                        <Link
                          to={itemHref(item)}
                          onClick={onNavigate}
                          className="block truncate rounded-md px-2.5 py-1.5 text-[13px] text-slate-400 transition hover:bg-white/5 hover:text-white"
                        >
                          {item.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
            <Link
              to={allHref}
              onClick={onNavigate}
              className="mt-2 flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium text-brand-300 transition hover:bg-brand-400/10"
            >
              {allLabel} <IconArrowRight size={12} />
            </Link>
          </>
        )}
      </div>
    </details>
  );
}

function Navbar() {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState({ courses: [], labs: [] });
  const [catalogLoading, setCatalogLoading] = useState(true);
  const { user } = useAuth();
  const location = useLocation();
  const onAuthPage = ['/login', '/register'].includes(location.pathname);

  useEffect(() => {
    let active = true;
    api
      .get('/nav')
      .then(({ data }) => {
        if (!active) return;
        setCatalog({ courses: data.courses || [], labs: data.labs || [] });
      })
      .catch(() => {})
      .finally(() => {
        if (active) setCatalogLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const courseGroups = useMemo(() => groupCatalog(catalog.courses), [catalog.courses]);
  const labGroups = useMemo(() => groupCatalog(catalog.labs), [catalog.labs]);

  const courseHref = (course) => `/courses/${course.slug}`;
  const labHref = (lab) => {
    if (user) return `/labs/${lab.id}`;
    return lab.course_slug ? `/courses/${lab.course_slug}` : '/login';
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl dark:border-white/5 dark:bg-night-950/80">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex">
            <CatalogMenu
              label="Courses"
              groups={courseGroups}
              loading={catalogLoading}
              allHref="/courses"
              allLabel="Browse all courses"
              itemHref={courseHref}
              emptyLabel="No published courses yet."
            />
            <CatalogMenu
              label="Labs"
              groups={labGroups}
              loading={catalogLoading}
              allHref="/student/labs"
              allLabel="Open lab catalog"
              itemHref={labHref}
              emptyLabel="No published labs yet."
            />
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive ? 'font-semibold text-brand-600 dark:text-white' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-2.5 lg:flex">
          <ThemeToggle />
          {user ? (
            <>
              <Link
                to={dashboardPath(user.role)}
                className="mr-1 text-sm font-medium text-slate-700 transition hover:text-brand-600 dark:text-slate-300 dark:hover:text-white"
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

        <div className="flex items-center gap-2 lg:hidden">
          <ThemeToggle size="sm" />
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-lg p-2 text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5"
            aria-label="Toggle navigation"
          >
            {open ? <IconX size={22} /> : <IconMenu size={22} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-night-950/95 lg:hidden">
          <div className="container-page flex flex-col gap-1 py-4">
            <MobileCatalog
              label="Courses"
              groups={courseGroups}
              loading={catalogLoading}
              allHref="/courses"
              allLabel="Browse all courses"
              itemHref={courseHref}
              emptyLabel="No published courses yet."
              onNavigate={() => setOpen(false)}
            />
            <MobileCatalog
              label="Labs"
              groups={labGroups}
              loading={catalogLoading}
              allHref="/student/labs"
              allLabel="Open lab catalog"
              itemHref={labHref}
              emptyLabel="No published labs yet."
              onNavigate={() => setOpen(false)}
            />
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
    <footer className="border-t border-slate-200 bg-slate-50/70 dark:border-white/5 dark:bg-night-950/60">
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
            {footerLinks.slice(0, 5).map((link) => (
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
