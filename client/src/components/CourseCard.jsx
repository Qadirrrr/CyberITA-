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
        <div className="absolute inset-0 bg-gradient-to-t from-night-950/80 via-night-950/10 to-transparent" />
        <div className="absolute left-4 top-4 flex flex-wrap items-center gap-2">
          <span className={`chip border-white/10 bg-night-950/60 text-[11px] ${visual.text} backdrop-blur`}>
            <IconComponent size={13} />
            {course.category || 'General'}
          </span>
          <Badge tone={level.tone === 'emerald' ? 'emerald' : level.tone === 'amber' ? 'amber' : 'rose'}>{level.label}</Badge>
        </div>
        {!course.cover_image || imageFailed ? (
          <IconComponent size={64} className={`absolute bottom-3 right-4 opacity-25 ${visual.text}`} strokeWidth={1.2} />
        ) : null}
        <div className="absolute bottom-3 left-4 flex items-center gap-1.5 text-[11px] font-medium text-slate-200">
          <IconUsers size={13} className="text-brand-300" />
          {course.enrolled_count ?? course.enrollment_count ?? 0} learners
        </div>
        {course.status && course.status !== 'published' && (
          <span className="absolute right-3 top-3 rounded-full bg-night-950/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-300 backdrop-blur">
            {course.status}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 font-display text-lg font-semibold leading-snug text-white transition group-hover:text-brand-200">
          {course.title}
        </h3>
        <p className="mt-2 line-clamp-2 flex-1 text-sm leading-6 text-slate-400">{course.summary}</p>

        <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <IconLayers size={14} /> {lessons} lessons
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconClock size={14} /> {formatMinutes(minutes)}
          </span>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-500/30 to-accent-500/30 text-[10px] font-semibold text-brand-200 ring-1 ring-white/10">
              {(course.instructor_name || 'CyberITA')
                .split(' ')
                .slice(0, 2)
                .map((n) => n[0])
                .join('')}
            </span>
            <span className="max-w-[140px] truncate text-xs text-slate-400">{course.instructor_name || 'CyberITA+ Faculty'}</span>
          </div>
          <span className={`text-sm font-semibold ${price > 0 ? 'text-white' : 'text-emerald-300'}`}>
            {price > 0 ? `$${price}` : 'Free'}
          </span>
        </div>
        {footer}
      </div>
    </Link>
  );
}
