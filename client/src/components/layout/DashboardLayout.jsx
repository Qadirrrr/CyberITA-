import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import Logo from '../Logo';
import UserMenu from './UserMenu';
import NotificationBell from './NotificationBell';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { cx } from '../ui';
import {
  IconAward,
  IconBarChart,
  IconBookOpen,
  IconClipboard,
  IconFileText,
  IconGlobe,
  IconGraduationCap,
  IconLayout,
  IconLogOut,
  IconMail,
  IconMenu,
  IconSend,
  IconServer,
  IconShield,
  IconTerminal,
  IconUsers,
  IconX,
  IconZap,
} from '../icons';

const studentNav = [
  { to: '/student', label: 'Dashboard', icon: IconLayout, end: true },
  { to: '/student/courses', label: 'My Courses', icon: IconBookOpen },
  { to: '/student/labs', label: 'Practical Labs', icon: IconTerminal },
  { to: '/student/reports', label: 'Lab Reports', icon: IconFileText },
  { to: '/student/certificates', label: 'Certificates', icon: IconAward },
  { to: '/student/history', label: 'Learning History', icon: IconBarChart },
];

const instructorNav = [
  { to: '/instructor', label: 'Overview', icon: IconLayout, end: true },
  { to: '/instructor/courses', label: 'Courses', icon: IconBookOpen },
  { to: '/instructor/labs', label: 'Labs', icon: IconTerminal },
  { to: '/instructor/submissions', label: 'Assignments', icon: IconClipboard },
  { to: '/instructor/reports', label: 'Lab Reports', icon: IconFileText },
  { to: '/instructor/blog', label: 'Blog', icon: IconZap },
  { to: '/instructor/students', label: 'Students', icon: IconUsers },
];

const adminNav = [
  { to: '/admin', label: 'Overview', icon: IconLayout, end: true },
  { to: '/instructor/courses', label: 'Courses', icon: IconBookOpen },
  { to: '/instructor/labs', label: 'Labs', icon: IconTerminal },
  { to: '/instructor/submissions', label: 'Assignments', icon: IconClipboard },
  { to: '/instructor/reports', label: 'Lab Reports', icon: IconFileText },
  { to: '/instructor/blog', label: 'Blog', icon: IconZap },
  { to: '/instructor/students', label: 'Students', icon: IconGraduationCap },
  { to: '/admin/users', label: 'Users & Roles', icon: IconShield },
  { to: '/admin/messages', label: 'Messages', icon: IconMail },
  { to: '/admin/broadcast', label: 'Broadcast', icon: IconSend },
];

function navFor(role) {
  if (role === 'admin') return adminNav;
  if (role === 'instructor') return instructorNav;
  return studentNav;
}

export default function DashboardLayout() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = navFor(user?.role);
  const title = user?.role === 'admin' ? 'Admin workspace' : user?.role === 'instructor' ? 'Instructor workspace' : 'Learning workspace';

  const onLogout = async () => {
    await logout();
    toast.info('You have been signed out.');
    navigate('/');
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center justify-between border-b border-white/5 px-5">
        <Logo />
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden"
          aria-label="Close menu"
        >
          <IconX size={18} />
        </button>
      </div>

      <div className="px-4 pt-5">
        <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">{title}</p>
        <nav className="mt-2 space-y-0.5">
          {items.map((item) => {
            const IconComponent = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cx(
                    'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                    isActive
                      ? 'bg-brand-400/10 text-brand-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18)]'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-100'
                  )
                }
              >
                <IconComponent size={18} className="shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto space-y-2 p-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <IconServer size={14} className="text-brand-400" /> Lab environments
          </div>
          <p className="mt-1.5 text-[11px] leading-4 text-slate-500">
            Mock provider active. Sandboxed Linux containers are simulated in the browser for every exercise.
          </p>
        </div>
        <NavLink
          to="/"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white"
        >
          <IconGlobe size={18} /> Back to learning site
        </NavLink>
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300"
        >
          <IconLogOut size={18} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="fixed inset-y-0 left-0 hidden w-[264px] border-r border-white/5 bg-night-900/70 lg:block">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu overlay"
            className="absolute inset-0 bg-night-950/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 h-full w-[280px] border-r border-white/10 bg-night-900">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-h-screen flex-1 flex-col lg:pl-[264px]">
        <header className="sticky top-0 z-30 border-b border-white/5 bg-night-950/80 backdrop-blur-xl">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-lg p-2 text-slate-300 transition hover:bg-white/5 lg:hidden"
                aria-label="Open menu"
              >
                <IconMenu size={21} />
              </button>
              <div className="hidden items-center gap-2 text-sm text-slate-500 sm:flex">
                <IconLayout size={15} />
                <span>{title}</span>
                {user?.role !== 'student' && <span className="text-slate-600">/</span>}
                {user?.role !== 'student' && <span className="text-slate-400">Content management</span>}
              </div>
              <Logo compact className="lg:hidden" />
            </div>
            <div className="flex items-center gap-1.5">
              <NotificationBell />
              <UserMenu />
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
