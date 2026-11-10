import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Logo from '../Logo';
import SidebarProfile from './SidebarProfile';
import NotificationBell from './NotificationBell';
import useClickOutside from '../../hooks/useClickOutside';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { useToast } from '../../context/ToastContext';
import api from '../../lib/api';
import { MODERATOR_ROLES, ROLES } from '../../lib/constants';
import { Avatar, cx } from '../ui';
import ThemeToggle from '../ThemeToggle';
import {
  IconAward,
  IconBarChart,
  IconBookOpen,
  IconClock,
  IconFileText,
  IconLayout,
  IconLayers,
  IconLogOut,
  IconMail,
  IconMenu,
  IconSend,
  IconSettings,
  IconShield,
  IconTerminal,
  IconUsers,
  IconX,
  IconFlag,
  // Student sidebar custom icons
  IconGrid,
  IconBookWifi,
  IconLessons,
  IconCalendarGrid,
  IconChatBubble,
  IconHeadphones,
  IconBell,
  IconCheckCircle,
  IconChevronDown,
  IconChevronLeft,
} from '../icons';


const studentNavPrimary = [
  { to: '/student', label: 'Dashboard', icon: IconGrid, end: true },
  { to: '/student/courses', label: 'My courses', icon: IconBookWifi },
  { to: '/student/lessons', label: 'My lessons', icon: IconLessons },
  { to: '/student/labs', label: 'Labs', icon: IconTerminal },
  { to: '/student/lab-assignments', label: 'Lab assignments', icon: IconTerminal, badge: 'labAssignments' },
  { to: '/student/calendar', label: 'Calendar', icon: IconCalendarGrid },
  { to: '/student/chat', label: 'Chat', icon: IconChatBubble, badge: 'chat' },
];

const studentNavProgress = [
  { to: '/student/reports', label: 'Lab reports', icon: IconFileText },
  { to: '/student/certificates', label: 'Certificates', icon: IconAward },
  { to: '/student/history', label: 'Learning history', icon: IconClock },
];

const studentNavSecondary = [
  { to: '/student/support', label: 'Support', icon: IconHeadphones },
  { to: '/student/notifications', label: 'Notifications', icon: IconBell, badge: 'notifications' },
  { to: '/student/settings', label: 'Settings', icon: IconSettings },
];

const instructorNavGroups = [
  {
    label: 'Teaching',
    items: [
      { to: '/instructor', label: 'Overview', icon: IconLayout, end: true },
      { to: '/instructor/courses', label: 'Assigned courses', icon: IconBookOpen },
      { to: '/instructor/students', label: 'My students', icon: IconUsers },
    ],
  },
  {
    label: 'Authoring Studio',
    items: [
      { to: '/instructor/studio', label: 'Content studio', icon: IconLayers },
      { to: '/instructor/labs', label: 'Lab assignments', icon: IconTerminal },
    ],
  },
  {
    label: 'Evaluation & Reviews',
    items: [
      { to: '/instructor/lab-submissions', label: 'Lab submissions', icon: IconTerminal, badge: 'labSubmissions' },
      { to: '/instructor/deadline-tracker', label: 'Deadline tracker', icon: IconClock },
      { to: '/instructor/reports', label: 'Practical reports', icon: IconFileText },
    ],
  },
  {
    label: 'Communication',
    items: [
      { to: '/instructor/messages', label: 'Student chat', icon: IconChatBubble, badge: 'chat' },
      { to: '/instructor/announcements', label: 'Announcements', icon: IconBell },
      { to: '/instructor/blog', label: 'Articles', icon: IconBookOpen },
    ],
  },
  {
    label: 'Preferences',
    items: [
      { to: '/instructor/settings', label: 'Settings', icon: IconSettings },
    ],
  },
];

const adminNavGroups = [
  {
    label: 'Platform',
    items: [
      { to: '/admin', label: 'Overview', icon: IconLayout, end: true },
    ],
  },
  {
    label: 'Users & Access',
    items: [
      { to: '/admin/users', label: 'Users & Roles', icon: IconShield },
      { to: '/admin/moderators', label: 'Moderator Management', icon: IconFlag },
    ],
  },
  {
    label: 'Courses & Content',
    items: [
      { to: '/admin/courses', label: 'Courses & Enrollment', icon: IconBookOpen },
      { to: '/admin/content', label: 'Content & Publication', icon: IconFileText },
      { to: '/instructor/reports', label: 'Student Reports', icon: IconFileText },
       { to: '/instructor/lab-submissions', label: 'Lab Submission Review', icon: IconCheckCircle },
       { to: '/instructor/deadline-tracker', label: 'Deadline Tracker', icon: IconClock },
      { to: '/instructor/blog', label: 'Blog Publication', icon: IconBookOpen },
    ],
  },
  {
    label: 'Infrastructure',
    items: [
      { to: '/admin/labs', label: 'Lab Infrastructure', icon: IconTerminal },
      { to: '/instructor/labs', label: 'All Labs', icon: IconTerminal },
    ],
  },
  {
    label: 'Communication',
    items: [
      { to: '/admin/messages', label: 'Contact Messages', icon: IconMail },
      { to: '/admin/broadcast', label: 'Broadcast Alerts', icon: IconSend },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/system', label: 'System & Analytics', icon: IconBarChart },
      { to: '/admin/logs', label: 'Audit & Security Logs', icon: IconBarChart },
      { to: '/admin/settings', label: 'Platform Settings', icon: IconSettings },
    ],
  },
];

function moderatorNavGroups(role) {
  const home = role === 'senior_moderator' ? '/moderator/senior' : '/moderator/subject';
  return [
    {
      label: 'Moderation',
      items: [
        { to: home, label: 'Dashboard', icon: IconLayout, end: true },
        { to: '/moderator/reports', label: 'Reports & escalations', icon: IconFlag, badge: 'moderation' },
      ],
    },
    {
      label: 'Preferences',
      items: [{ to: '/moderator/settings', label: 'Settings', icon: IconSettings }],
    },
  ];
}

function navFor(role) {
  if (role === 'instructor') return instructorNavGroups.flatMap((g) => g.items);
  if (role === 'senior_moderator' || role === 'subject_moderator') {
    return moderatorNavGroups(role).flatMap((group) => group.items);
  }
  return studentNavPrimary;
}

export default function DashboardLayout() {
  const { user, logout, refreshUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('cyberita.sidebar.collapsed') === '1';
    } catch {
      return false;
    }
  });
  const profileRef = useRef(null);
  useClickOutside(profileRef, () => setProfileOpen(false), profileOpen);
  const [chatUnread, setChatUnread] = useState(0);
  const location = useLocation();
  const { notifications = [], unread = 0, markCategoryRead } = useNotifications() || {};

  // Close the profile menu whenever the route changes
  useEffect(() => {
    setProfileOpen(false);
  }, [location.pathname]);

  // Remember the desktop sidebar visibility across page loads
  useEffect(() => {
    try {
      localStorage.setItem('cyberita.sidebar.collapsed', sidebarCollapsed ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }, [sidebarCollapsed]);

  const items = navFor(user?.role);
  const isModerator = MODERATOR_ROLES.includes(user?.role);
  const title =
    user?.role === 'admin'
      ? 'Admin workspace'
      : user?.role === 'instructor'
        ? 'Instructor workspace'
        : isModerator
          ? 'Moderation workspace'
          : 'Learning workspace';

  // Calculate unread notification counts per category
  const labAssignmentNotifs = useMemo(() => {
    return (notifications || []).filter(
      (n) => !n.read_at && (n.type === 'lab' || n.link?.includes('lab-assignment') || n.title?.toLowerCase().includes('lab'))
    ).length;
  }, [notifications]);

  const submissionNotifs = useMemo(() => {
    return (notifications || []).filter(
      (n) =>
        !n.read_at &&
        !n.link?.includes('lab-submissions') &&
        (n.type === 'submission' || n.link?.includes('submission'))
    ).length;
  }, [notifications]);

  const labSubmissionNotifs = useMemo(() => {
    return (notifications || []).filter(
      (n) => !n.read_at && n.link?.includes('/instructor/lab-submissions')
    ).length;
  }, [notifications]);

  const moderationNotifs = useMemo(() => {
    return (notifications || []).filter(
      (n) => !n.read_at && (n.type === 'moderation' || n.link?.includes('/moderator/'))
    ).length;
  }, [notifications]);

  // When student or instructor visits a section, automatically mark notifications for that section as read
  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith('/student/lab-assignments')) {
      if (labAssignmentNotifs > 0) markCategoryRead?.('lab');
    } else if (path.startsWith('/instructor/lab-submissions')) {
      if (submissionNotifs > 0) markCategoryRead?.('submission');
    } else if (path.startsWith('/moderator/')) {
      if (moderationNotifs > 0) markCategoryRead?.('moderation');
    }
  }, [location.pathname, labAssignmentNotifs, submissionNotifs, moderationNotifs, markCategoryRead]);

  useEffect(() => {
    if (!user || !['student', 'instructor'].includes(user.role)) {
      setChatUnread(0);
      return undefined;
    }
    let active = true;
    const load = () => {
      api
        .get('/messages/unread-count')
        .then(({ data }) => {
          if (active) setChatUnread(Number(data.unread) || 0);
        })
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 30000);
    window.addEventListener('chat:read', load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('chat:read', load);
    };
  }, [user]);

  const onLogout = async () => {
    await logout();
    toast.info('You have been signed out.');
    navigate('/');
  };

  const isStudent = user?.role === 'student';

  const [resendStatus, setResendStatus] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const emailUnverified = Boolean(user && !user.email_verified_at);

  const resendVerification = async () => {
    setResendLoading(true);
    setResendStatus('');
    try {
      const { data } = await api.post('/auth/resend-verification', { email: user.email });
      if (data?.devVerificationLink) {
        // Development: the link is echoed instead of being emailed, so open it
        // and refresh the cached user once it has been consumed.
        window.open(data.devVerificationLink, '_blank', 'noopener');
        setResendStatus('dev');
        window.setTimeout(() => {
          refreshUser().catch(() => {});
        }, 2000);
      } else {
        setResendStatus('sent');
        toast.success('Verification email sent. Check your inbox.');
      }
    } catch (err) {
      setResendStatus('error');
      toast.error(err?.response?.data?.error?.message || 'Could not send the verification email.');
    } finally {
      setResendLoading(false);
    }
  };

  const renderNavItem = (item, mini = false) => {
    const IconComponent = item.icon;
    let badgeCount = 0;
    let badgeTone = 'brand';

    if (item.badge === 'chat') {
      badgeCount = chatUnread;
      badgeTone = 'brand';
    } else if (item.badge === 'labAssignments') {
      badgeCount = labAssignmentNotifs;
      badgeTone = 'emerald';
    } else if (item.badge === 'notifications') {
      badgeCount = unread;
      badgeTone = 'brand';
    } else if (item.badge === 'submissions') {
      badgeCount = submissionNotifs;
      badgeTone = 'rose';
    } else if (item.badge === 'labSubmissions') {
      badgeCount = labSubmissionNotifs;
      badgeTone = 'amber';
    } else if (item.badge === 'moderation') {
      badgeCount = moderationNotifs;
      badgeTone = 'brand';
    }

    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        title={mini ? item.label : undefined}
        onClick={() => {
          setMobileOpen(false);
          if (item.badge === 'labAssignments') markCategoryRead?.('lab');
          if (item.badge === 'submissions') markCategoryRead?.('submission');
          if (item.badge === 'labSubmissions') markCategoryRead?.('lab');
          if (item.badge === 'moderation') markCategoryRead?.('moderation');
        }}
        className={({ isActive }) =>
          cx(
            'group relative flex items-center rounded-xl text-xs font-medium transition-all duration-150',
            mini ? 'mx-auto h-9 w-9 justify-center' : 'gap-2.5 px-3 py-2',
            isActive
              ? 'bg-brand-50 text-brand-700 font-semibold shadow-sm border border-brand-200/80 dark:border-transparent dark:bg-brand-400/10 dark:text-brand-200 dark:shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18)]'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100'
          )
        }
      >
        <IconComponent size={16} className="shrink-0" />
        {!mini && <span className="min-w-0 flex-1 truncate text-xs">{item.label}</span>}
        {badgeCount > 0 &&
          (mini ? (
            <span
              className={cx(
                'absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full',
                badgeTone === 'amber'
                  ? 'bg-amber-400'
                  : badgeTone === 'emerald'
                    ? 'bg-emerald-400'
                    : badgeTone === 'rose'
                      ? 'bg-rose-500'
                      : 'bg-brand-400'
              )}
            />
          ) : (
            <span
              className={cx(
                'flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold shadow-sm',
                badgeTone === 'amber'
                  ? 'bg-amber-400 text-night-950 shadow-amber-400/30'
                  : badgeTone === 'emerald'
                    ? 'bg-emerald-400 text-night-950 shadow-emerald-400/30'
                    : badgeTone === 'rose'
                      ? 'bg-rose-500 text-white shadow-rose-500/30'
                      : 'bg-brand-400 text-night-950 shadow-brand-400/30'
              )}
            >
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          ))}
      </NavLink>
    );
  };

  const renderSidebar = (mini = false) => (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className={cx(
          'flex h-16 items-center border-b border-white/5',
          mini ? 'justify-center px-2' : 'justify-between px-4'
        )}
      >
        {mini ? <Logo compact /> : <Logo />}
        {!mini && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className="hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-white lg:inline-flex"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <IconChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-white lg:hidden"
              aria-label="Close menu"
            >
              <IconX size={18} />
            </button>
          </div>
        )}
      </div>

      {isStudent ? (
        /* ── STUDENT SIDEBAR LAYOUT ── */
        <>
          <div className={cx('no-scrollbar min-h-0 flex-1 overflow-y-auto pb-4 pt-4', mini ? 'px-2' : 'px-3')}>
            {!mini && (
              <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">Learning</p>
            )}
            <nav className={cx('space-y-0.5', mini && 'space-y-1')}>
              {studentNavPrimary.map((item) => renderNavItem(item, mini))}
            </nav>

            {mini ? (
              <div className="my-3 h-px bg-white/5" />
            ) : (
              <p className="mt-5 px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">Progress</p>
            )}
            <nav className={cx('space-y-0.5', mini && 'space-y-1')}>
              {studentNavProgress.map((item) => renderNavItem(item, mini))}
            </nav>
          </div>

          <div
            ref={profileRef}
            className={cx('shrink-0 border-t border-white/5 py-3', mini ? 'relative px-2' : 'px-3')}
          >
            {profileOpen && (
              <div
                className={cx(
                  'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-white/10 dark:bg-night-850 dark:shadow-2xl',
                  mini ? 'absolute bottom-full left-2 z-50 mb-2 w-56' : 'mb-2'
                )}
              >
                <nav className="space-y-0.5 p-1.5" onClick={() => setProfileOpen(false)}>
                  {studentNavSecondary.map((item) => renderNavItem(item))}
                </nav>
                <div className="border-t border-slate-200 p-1.5 dark:border-white/10">
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      onLogout();
                    }}
                    className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition-all duration-150 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                  >
                    <IconLogOut size={18} className="shrink-0" />
                    Log out
                  </button>
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setProfileOpen((value) => !value)}
              aria-expanded={profileOpen}
              aria-haspopup="true"
              aria-label="Profile menu"
              title={mini ? user?.full_name || 'Profile' : undefined}
              className={cx(
                'group flex w-full items-center rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:hover:border-white/15 dark:hover:bg-white/[0.06]',
                mini ? 'justify-center p-1.5' : 'gap-2.5 p-2'
              )}
            >
              <Avatar name={user?.full_name} src={user?.avatar_url} size="sm" />
              {!mini && (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {user?.full_name || 'Profile'}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-500 dark:text-slate-500">
                      {ROLES[user?.role] || 'Profile'}
                    </span>
                  </span>
                  <IconChevronDown
                    size={14}
                    className={`shrink-0 text-slate-500 transition-transform duration-200 ${profileOpen ? 'rotate-180' : ''}`}
                  />
                </>
              )}
            </button>
          </div>
        </>
      ) : (
        /* ── INSTRUCTOR / ADMIN SIDEBAR LAYOUT ── */
        <>
          <div className={cx('no-scrollbar min-h-0 flex-1 overflow-y-auto pb-4 pt-4', mini ? 'px-2' : 'px-3')}>
            {user?.role === 'admin' ? (
              /* Grouped admin nav */
              adminNavGroups.map((group, index) => (
                <div
                  key={group.label}
                  className={cx(mini ? (index > 0 ? 'mt-2 border-t border-white/5 pt-2' : '') : 'mb-1')}
                >
                  {!mini && (
                    <p className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      {group.label}
                    </p>
                  )}
                  <nav className="space-y-0.5">
                    {(group?.items || []).map((item) => renderNavItem(item, mini))}
                  </nav>
                </div>
              ))
            ) : isModerator ? (
              /* Grouped moderator nav */
              moderatorNavGroups(user?.role).map((group, index) => (
                <div
                  key={group.label}
                  className={cx(mini ? (index > 0 ? 'mt-2 border-t border-white/5 pt-2' : '') : 'mb-1')}
                >
                  {!mini && (
                    <p className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      {group.label}
                    </p>
                  )}
                  <nav className="space-y-0.5">
                    {(group?.items || []).map((item) => renderNavItem(item, mini))}
                  </nav>
                </div>
              ))
            ) : (
              /* Grouped instructor nav */
              instructorNavGroups.map((group, index) => (
                <div
                  key={group.label}
                  className={cx(mini ? (index > 0 ? 'mt-2 border-t border-white/5 pt-2' : '') : 'mb-1')}
                >
                  {!mini && (
                    <p className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      {group.label}
                    </p>
                  )}
                  <nav className="space-y-0.5">
                    {(group?.items || []).map((item) => renderNavItem(item, mini))}
                  </nav>
                </div>
              ))
            )}
          </div>
          <div className={cx('mt-auto border-t border-white/5', mini ? 'p-2' : 'p-3')}>
            <SidebarProfile compact={mini} />
          </div>
        </>
      )}
    </div>
  );


  return (
    <div className="min-h-screen lg:flex">
      <aside
        className={cx(
          'no-scrollbar fixed inset-y-0 left-0 hidden border-r border-slate-200/80 bg-white/95 transition-[width] duration-300 dark:border-white/5 dark:bg-night-900/70 lg:block',
          sidebarCollapsed ? 'w-[76px]' : 'w-[224px]'
        )}
      >
        {renderSidebar(sidebarCollapsed)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close menu overlay"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm dark:bg-night-950/80"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="no-scrollbar relative z-10 h-full w-[268px] border-r border-slate-200 bg-white dark:border-white/10 dark:bg-night-900">
            {renderSidebar(false)}
          </aside>
        </div>
      )}

      <div
        className={cx(
          'flex min-h-screen min-w-0 flex-1 flex-col bg-slate-100 transition-[padding] duration-300 dark:bg-transparent',
          sidebarCollapsed ? 'lg:pl-[76px]' : 'lg:pl-[224px]'
        )}
      >
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-xl dark:border-white/5 dark:bg-night-950/80">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-lg p-2 text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5 lg:hidden"
                aria-label="Open menu"
              >
                <IconMenu size={21} />
              </button>
              <button
                type="button"
                onClick={() => setSidebarCollapsed((value) => !value)}
                className="hidden rounded-lg p-2 text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white lg:inline-flex"
                aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                aria-expanded={!sidebarCollapsed}
                title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
              >
                <IconMenu size={21} />
              </button>
              <div className="hidden items-center gap-2 text-sm text-slate-500 sm:flex">
                <IconLayout size={15} />
                <span className="font-medium text-slate-800 dark:text-slate-200">{title}</span>
                {user?.role !== 'student' && <span className="text-slate-400">/</span>}
                {user?.role !== 'student' && (
                  <span className="text-slate-500">{isModerator ? 'Moderation' : 'Content management'}</span>
                )}
              </div>
              <Logo compact className="lg:hidden" />
            </div>
            <div className="flex items-center gap-2.5">
              <ThemeToggle />
              <NotificationBell />
              <button
                type="button"
                onClick={onLogout}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:border-rose-400/30 dark:hover:bg-rose-500/10 dark:hover:text-rose-300"
                aria-label="Log out"
                title="Log out"
              >
                <IconLogOut size={16} className="shrink-0" />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </div>
          </div>
        </header>

        {emailUnverified && (
          <div className="border-b border-amber-300/40 bg-amber-50 px-4 py-2.5 dark:border-amber-400/20 dark:bg-amber-400/10 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200 sm:text-sm">
                <IconMail size={15} className="shrink-0" />
                <span>
                  <span className="font-semibold">Email not verified.</span> Verify{' '}
                  <span className="font-medium">{user?.email}</span> to secure your account.
                </span>
              </p>
              <div className="flex items-center gap-2">
                {resendStatus === 'sent' && (
                  <span className="text-xs text-emerald-700 dark:text-emerald-300">Email sent. Check your inbox.</span>
                )}
                {resendStatus === 'dev' && (
                  <span className="text-xs text-amber-700 dark:text-amber-300">Verification link opened in a new tab.</span>
                )}
                <button
                  type="button"
                  onClick={resendVerification}
                  disabled={resendLoading}
                  className="rounded-lg border border-amber-400/40 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-200 disabled:opacity-50 dark:border-amber-300/30 dark:bg-amber-400/15 dark:text-amber-100 dark:hover:bg-amber-400/25"
                >
                  {resendLoading ? 'Sending…' : 'Resend verification'}
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
