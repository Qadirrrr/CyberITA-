import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from './ui';
import { IconClock, IconCode, IconCloud, IconLayers, IconNetwork, IconRefresh, IconServer, IconShield, IconTarget, IconTerminal, IconUsers } from './icons';
import { DIFFICULTIES } from '../lib/constants';
import { formatMinutes } from '../lib/format';

const categoryVisuals = {
  Linux: { icon: IconTerminal, gradient: 'from-brand-500/30 via-night-800 to-night-900', text: 'text-brand-300' },
  Networking: { icon: IconNetwork, gradient: 'from-sky-500/25 via-night-800 to-night-900', text: 'text-sky-300' },
  Cybersecurity: { icon: IconShield, gradient: 'from-rose-500/25 via-night-800 to-night-900', text: 'text-rose-300' },
  Cloud: { icon: IconCloud, gradient: 'from-accent-500/25 via-night-800 to-night-900', text: 'text-accent-300' },
  DevOps: { icon: IconRefresh, gradient: 'from-amber-500/20 via-night-800 to-night-900', text: 'text-amber-300' },
  Programming: { icon: IconCode, gradient: 'from-emerald-500/20 via-night-800 to-night-900', text: 'text-emerald-300' },
  Databases: { icon: IconServer, gradient: 'from-indigo-500/25 via-night-800 to-night-900', text: 'text-indigo-300' },
  Career: { icon: IconTarget, gradient: 'from-fuchsia-500/20 via-night-800 to-night-900', text: 'text-fuchsia-300' },
};

export default function CourseCard({ course, compact = false, footer }) {
  const [imageFailed, setImageFailed] = useState(false);
  const visual = categoryVisuals[course.category] || { icon: IconLayers, gradient: 'from-white/10 via-night-800 to-night-900', text: 'text-slate-300' };
  const IconComponent = visual.icon;
  const level = DIFFICULTIES[course.level] || DIFFICULTIES.beginner;
  const lessons = course.lesson_count ?? course.lessons_count ?? 0;
  const minutes = Number(course.duration_hours || 0) * 60;
  const price = Number(course.price || 0);

  return (
    <Link
      to={`/courses/${course.slug}`}
      className="card card-hover group flex h-full flex-col overflow-hidden"
    >
      <div className={`relative ${compact ? 'h-32' : 'h-44'} overflow-hidden bg-gradient-to-br ${visual.gradient}`}>
        {course.cover_image && !imageFailed && (
          <img
            src={course.cover_image}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="absolute inset-0 h-full w-full object-cover opacity-80 transition duration-500 group-hover:scale-105"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
        <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
          <span className={`chip border-white/15 bg-slate-950/70 text-xs font-medium text-white backdrop-blur`}>
            <IconComponent size={13} />
            {course.category || 'General'}
          </span>
          <Badge tone={level.tone === 'emerald' ? 'emerald' : level.tone === 'amber' ? 'amber' : 'rose'}>{level.label}</Badge>
        </div>
        {!course.cover_image || imageFailed ? (
          <IconComponent size={64} className={`absolute bottom-3 right-4 opacity-25 ${visual.text}`} strokeWidth={1.2} />
        ) : null}
        <div className="absolute bottom-3 left-4 flex items-center gap-1.5 text-xs font-medium text-slate-100">
          <IconUsers size={13} className="text-brand-300" />
          {course.enrolled_count ?? course.enrollment_count ?? 0} learners
        </div>
        {course.status && course.status !== 'published' && (
          <span className="absolute right-3 top-3 rounded-md bg-slate-950/80 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-amber-300 backdrop-blur">
            {course.status}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 font-display text-lg font-semibold leading-snug text-slate-900 transition group-hover:text-brand-600 dark:text-white dark:group-hover:text-brand-200">
          {course.title}
        </h3>
        <p className="mt-2 line-clamp-2 flex-1 text-sm leading-6 text-slate-600 dark:text-slate-400">{course.summary}</p>

        <div className="mt-4 flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <IconLayers size={14} /> {lessons} lessons
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconClock size={14} /> {formatMinutes(minutes)}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-white/5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/20 to-accent-500/20 text-xs font-semibold text-brand-700 ring-1 ring-slate-200 dark:text-brand-200 dark:ring-white/10">
              {(course.instructor_name || 'CyberITA')
                .split(' ')
                .slice(0, 2)
                .map((n) => n[0])
                .join('')}
            </span>
            <span className="max-w-[140px] truncate text-xs font-medium text-slate-600 dark:text-slate-400">{course.instructor_name || 'CyberITA+ Faculty'}</span>
          </div>
          <span className={`text-sm font-semibold ${price > 0 ? 'text-slate-900 dark:text-white' : 'text-emerald-600 dark:text-emerald-300'}`}>
            {price > 0 ? `$${price}` : 'Free'}
          </span>
        </div>
        {footer}
      </div>
    </Link>
  );
}
