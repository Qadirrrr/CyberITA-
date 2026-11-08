import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Alert, Badge, Button, Card, EmptyState, ProgressBar, Skeleton } from '../../components/ui';
import {
  IconArrowRight,
  IconCheckCircle,
  IconClock,
  IconPlay,
  IconSearch,
  IconServer,
  IconTerminal,
  IconZap,
} from '../../components/icons';
import { DIFFICULTIES, LAB_MODES } from '../../lib/constants';
import { timeAgo } from '../../lib/format';

const difficultyTone = { beginner: 'emerald', intermediate: 'amber', advanced: 'rose' };

const MODES = {
  practice: {
    id: 'practice',
    label: 'Practice labs',
    tagline: 'Not graded',
    description:
      'Open a real, isolated Linux container in your browser. Install packages, try commands, start over any time and learn at your own pace.',
    points: ['Real Linux container', 'Unlimited sessions', 'Open to everyone'],
  },
  course: {
    id: 'course',
    label: 'Course labs',
    tagline: 'Graded practicals',
    description:
      'Hands-on labs from your enrolled courses. Guided labs walk you through verified steps; real labs give you a question to solve and review your screenshot evidence.',
    points: ['Guided or question-only', 'Tied to your course', 'Instructor review'],
  },
};

function ModeCard({ mode, active, count, onSelect, onPrimary, primaryLabel, primaryLoading, disabled, disabledReason }) {
  const config = MODES[mode];
  const Icon = mode === 'practice' ? IconZap : IconServer;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border p-5 text-left shadow-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 ${
        active
          ? 'border-brand-400 bg-white shadow-md shadow-brand-500/10 dark:border-brand-400/60 dark:bg-brand-400/[0.07]'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-white/20'
      }`}
    >
      <div className="relative flex items-start justify-between gap-3">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
            mode === 'practice'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300'
              : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-300'
          }`}
        >
          <Icon size={20} />
        </span>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Badge tone={mode === 'practice' ? 'emerald' : 'sky'}>{config.tagline}</Badge>
          <Badge tone="slate">{count} lab{count === 1 ? '' : 's'}</Badge>
        </div>
      </div>

      <h2 className="relative mt-3 font-display text-lg font-semibold text-slate-900 dark:text-white">{config.label}</h2>
      <p className="relative mt-1.5 text-sm leading-6 text-slate-600 dark:text-slate-400">{config.description}</p>

      <ul className="relative mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600 dark:text-slate-400">
        {(config?.points || []).map((point) => (
          <li key={point} className="inline-flex items-center gap-1.5">
            <IconCheckCircle size={13} className={mode === 'practice' ? 'text-emerald-600 dark:text-emerald-400' : 'text-sky-600 dark:text-sky-400'} />
            {point}
          </li>
        ))}
      </ul>

      <div className="relative mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
        <Button
          type="button"
          size="sm"
          variant={active ? 'primary' : 'secondary'}
          onClick={(event) => {
            event.stopPropagation();
            onPrimary?.();
          }}
          loading={primaryLoading}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
        >
          {primaryLabel}
          <IconArrowRight size={13} />
        </Button>
      </div>
    </div>
  );
}

export default function LabsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('all');
  const [mineOnly, setMineOnly] = useState(false);
  const [startingId, setStartingId] = useState(null);
  const [error, setError] = useState('');

  const requestedMode = params.get('mode');
  const mode = requestedMode === 'course' || requestedMode === 'practice' ? requestedMode : 'practice';

  const setMode = (next) => {
    const nextParams = new URLSearchParams(params);
    nextParams.set('mode', next);
    setParams(nextParams, { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get('/labs', { params: { limit: 60 } })
      .then((res) => {
        if (!cancelled) setLabs(res.data.labs || []);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load the lab catalog.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const practiceLabs = useMemo(() => labs.filter((lab) => lab.is_practice), [labs]);
  const courseLabs = useMemo(() => labs.filter((lab) => !lab.is_practice), [labs]);

  const activeLabs = mode === 'practice' ? practiceLabs : courseLabs;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return activeLabs.filter((lab) => {
      if (difficulty !== 'all' && lab.difficulty !== difficulty) return false;
      if (mineOnly && !lab.last_started_at) return false;
      if (!term) return true;
      return `${lab.title} ${lab.summary || ''} ${lab.course_title || ''}`.toLowerCase().includes(term);
    });
  }, [activeLabs, search, difficulty, mineOnly]);

  const startedCount = labs.filter((lab) => lab.last_started_at).length;

  const startPractice = async (lab) => {
    if (!lab) return;
    setStartingId(lab.id);
    setError('');
    try {
      const { data } = await api.post(`/labs/${lab.id}/sessions`, {}, { timeout: 60000 });
      navigate(`/labs/session/${data.session.id}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not start the practice lab container.'));
    } finally {
      setStartingId(null);
    }
  };

  const quickStart = () => {
    const preferred = practiceLabs.find((lab) => lab.last_started_at) || practiceLabs[0];
    startPractice(preferred);
  };

  const resetFilters = () => {
    setSearch('');
    setDifficulty('all');
    setMineOnly(false);
  };

  return (
    <div className="animate-fade-up space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400">
            Hands-on labs
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">Practical labs</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
            Warm up on practice labs, or open course labs for graded practicals.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone="emerald">
            <IconZap size={12} /> {practiceLabs.length} practice
          </Badge>
          <Badge tone="sky">
            <IconServer size={12} /> {courseLabs.length} course
          </Badge>
          {startedCount > 0 && (
            <Badge tone="brand">
              <IconCheckCircle size={12} /> {startedCount} started
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ModeCard
          mode="practice"
          active={mode === 'practice'}
          count={practiceLabs.length}
          onSelect={() => setMode('practice')}
          onPrimary={practiceLabs.length ? quickStart : undefined}
          primaryLabel={practiceLabs.length ? 'Start practice' : 'No labs yet'}
          primaryLoading={Boolean(startingId) && startingId === (practiceLabs.find((l) => l.last_started_at) || practiceLabs[0])?.id}
          disabled={!practiceLabs.length || loading}
          disabledReason={practiceLabs.length ? undefined : 'No practice labs have been published yet.'}
        />
        <ModeCard
          mode="course"
          active={mode === 'course'}
          count={courseLabs.length}
          onSelect={() => setMode('course')}
          onPrimary={() => setMode('course')}
          primaryLabel={mode === 'course' ? 'Browse labs' : 'Browse practicals'}
          disabled={loading}
        />
      </div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={mode === 'practice' ? 'Search practice labs…' : 'Search course practicals…'}
            className="input pl-9"
            aria-label="Search labs"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDifficulty('all')}
            aria-pressed={difficulty === 'all'}
            className={`chip ${difficulty === 'all' ? 'chip-active' : ''}`}
          >
            All levels
          </button>
          {Object.keys(DIFFICULTIES).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setDifficulty(key)}
              aria-pressed={difficulty === key}
              className={`chip ${difficulty === key ? 'chip-active' : ''}`}
            >
              {DIFFICULTIES[key].label}
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(event) => setMineOnly(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 accent-brand-600 focus:ring-brand-500 dark:border-white/20"
          />
          Started by me
        </label>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            {mode === 'practice' ? 'Practice labs' : 'Course labs'}
          </h2>
          <Badge tone="slate">{filtered.length}</Badge>
          {!loading && activeLabs.length > 0 && filtered.length !== activeLabs.length && (
            <span className="text-xs text-slate-500">of {activeLabs.length}</span>
          )}
        </div>
        {(search || difficulty !== 'all' || mineOnly) && (
          <button type="button" onClick={resetFilters} className="text-xs font-medium text-slate-500 transition hover:text-brand-600 dark:hover:text-brand-300">
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <Alert tone="error" title="Something went wrong">
          {error}
        </Alert>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-48 w-full" />
          ))}
        </div>
      ) : activeLabs.length === 0 ? (
        mode === 'practice' ? (
          <EmptyState
            icon={IconZap}
            title="No practice labs yet"
            message="Instructors have not published any practice labs yet. Course practicals are available now."
            action={
              <Button variant="secondary" onClick={() => setMode('course')}>
                Browse course practicals <IconArrowRight size={13} />
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={IconTerminal}
            title="No course practicals found"
            message="Practical labs appear here once you are enrolled in a course that includes them."
            action={
              <Button as={Link} to="/student/courses" variant="secondary">
                Browse my courses <IconArrowRight size={13} />
              </Button>
            }
          />
        )
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={IconSearch}
          title="No labs match your filters"
          message="Try a different search term or level."
          action={
            <Button variant="secondary" onClick={resetFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((lab) => {
            const tone = difficultyTone[lab.difficulty] || 'brand';
            const isPractice = Boolean(lab.is_practice);
            const isReal = lab.lab_mode === 'real';
            return (
              <Card key={lab.id} className="card-hover group flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                      isPractice
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300'
                        : 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300'
                    }`}
                  >
                    {isPractice ? <IconZap size={18} /> : <IconTerminal size={18} />}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Badge tone={tone}>{DIFFICULTIES[lab.difficulty]?.label || lab.difficulty}</Badge>
                    <Badge tone={LAB_MODES[lab.lab_mode]?.tone || 'sky'}>{LAB_MODES[lab.lab_mode]?.short || 'Guided'}</Badge>
                    {isPractice && <Badge tone="emerald">Open to all</Badge>}
                  </div>
                </div>
                <h3 className="mt-3 font-display text-base font-semibold leading-snug text-slate-900 transition-colors group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-300">{lab.title}</h3>
                {lab.summary && <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{lab.summary}</p>}
                <p className="mt-2 text-xs text-slate-500">
                  {isReal
                    ? `Question-only · ${lab.min_evidence || 1}+ screenshots`
                    : isPractice
                      ? `Open to all · ${lab.step_count} steps`
                      : `${lab.course_title || 'Independent lab'} · ${lab.step_count} steps`}
                </p>

                {(lab.my_completed || lab.my_progress_percent > 0) && (
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        {lab.my_completed ? 'Completed' : 'Your progress'}
                      </span>
                      <span className="font-mono font-semibold text-slate-600 dark:text-slate-300">
                        {lab.my_completed ? '100%' : `${Math.round(lab.my_progress_percent)}%`}
                      </span>
                    </div>
                    <ProgressBar
                      value={lab.my_completed ? 100 : lab.my_progress_percent}
                      tone={lab.my_completed ? 'emerald' : 'brand'}
                      size="sm"
                    />
                  </div>
                )}

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3.5 dark:border-white/5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    {Number(lab.time_limit_minutes) > 0 ? (
                      <span className="inline-flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300" title={`${lab.time_limit_minutes} minute time limit · about ${lab.estimated_minutes} minutes of work`}>
                        <IconClock size={11} /> {lab.time_limit_minutes} min limit
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <IconClock size={11} /> {lab.estimated_minutes} min
                      </span>
                    )}
                    {lab.last_started_at && <span>· started {timeAgo(lab.last_started_at)}</span>}
                  </div>
                  {isPractice ? (
                    <div className="flex items-center gap-1.5">
                      <Button as={Link} to={`/labs/${lab.id}`} size="sm" variant="ghost">
                        Details
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => startPractice(lab)}
                        loading={startingId === lab.id}
                        disabled={Boolean(startingId) && startingId !== lab.id}
                      >
                        <IconPlay size={13} /> Start
                      </Button>
                    </div>
                  ) : (
                    <Button as={Link} to={`/labs/${lab.id}`} size="sm" variant="secondary">
                      <IconPlay size={13} /> Open
                    </Button>
                  )}
                </div>
                {lab.my_status && (
                  <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <span className={`h-1.5 w-1.5 rounded-full ${lab.my_status === 'running' ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'}`} />
                    {lab.my_status === 'running' ? (
                      <span className="text-emerald-700 dark:text-emerald-300">Session running now</span>
                    ) : (
                      <>Last session {lab.my_status}</>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-xs leading-5 text-slate-500">
        <IconArrowRight size={12} className="mt-1 shrink-0" />
        {mode === 'practice'
          ? 'Practice labs are not graded. Start as many sessions as you like.'
          : 'Finish every required step in a course lab to unlock your practical report.'}
      </p>
    </div>
  );
}
