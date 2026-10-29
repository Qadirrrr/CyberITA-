import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Skeleton } from '../../components/ui';
import {
  IconArrowRight,
  IconCheckCircle,
  IconClock,
  IconPlay,
  IconSearch,
  IconServer,
  IconShield,
  IconTerminal,
  IconZap,
} from '../../components/icons';
import { DIFFICULTIES } from '../../lib/constants';
import { timeAgo } from '../../lib/format';

const difficultyTone = { beginner: 'emerald', intermediate: 'amber', advanced: 'rose' };

const MODES = {
  practice: {
    id: 'practice',
    label: 'Practice terminal',
    tagline: 'Instant · no Docker',
    description:
      'Open a simulated Ubuntu shell right in your browser. Explore commands freely, break things and start over — nothing is graded or tied to a course.',
    points: ['No container needed', 'Unlimited sessions', 'Never graded'],
  },
  course: {
    id: 'course',
    label: 'Course practicals',
    tagline: 'Real containers',
    description:
      'Hands-on labs attached to your enrolled courses. Each one runs in its own isolated Docker container and unlocks a graded practical report.',
    points: ['Isolated Docker container', 'Verified guided steps', 'Practical report'],
  },
};

function ModeCard({ mode, active, count, statusLine, statusTone, onSelect, onPrimary, primaryLabel, primaryLoading, disabled, disabledReason }) {
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
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border p-5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 ${
        active
          ? 'border-brand-400/60 bg-brand-400/[0.07] shadow-lg shadow-brand-500/10'
          : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
      }`}
    >
      <div
        className={`pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full blur-3xl transition ${
          mode === 'practice' ? 'bg-emerald-500/10' : 'bg-sky-500/10'
        }`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
            mode === 'practice'
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
              : 'border-sky-400/30 bg-sky-400/10 text-sky-300'
          }`}
        >
          <Icon size={20} />
        </span>
        <div className="flex flex-col items-end gap-1.5">
          <Badge tone={mode === 'practice' ? 'emerald' : 'sky'}>{config.tagline}</Badge>
          <span className="text-[11px] font-medium text-slate-400">{count} lab{count === 1 ? '' : 's'}</span>
        </div>
      </div>

      <h2 className="relative mt-3 font-display text-lg font-semibold text-white">{config.label}</h2>
      <p className="relative mt-1.5 text-xs leading-5 text-slate-400">{config.description}</p>

      <ul className="relative mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-slate-400">
        {config.points.map((point) => (
          <li key={point} className="inline-flex items-center gap-1.5">
            <IconCheckCircle size={11} className={mode === 'practice' ? 'text-emerald-400' : 'text-sky-400'} />
            {point}
          </li>
        ))}
      </ul>

      <div className="relative mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
        <span className={`inline-flex items-center gap-1.5 text-[11px] ${statusTone}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {statusLine}
        </span>
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
  const [status, setStatus] = useState(null);
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
    api
      .get('/labs/status')
      .then((res) => {
        if (!cancelled) setStatus(res.data);
      })
      .catch(() => {});
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
  const dockerOnline = Boolean(status?.available);
  const dockerReason = status?.reason || 'The Docker engine is not responding.';

  const startPractice = async (lab) => {
    if (!lab) return;
    setStartingId(lab.id);
    setError('');
    try {
      const { data } = await api.post(`/labs/${lab.id}/sessions`, {}, { timeout: 60000 });
      navigate(`/labs/session/${data.session.id}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not start the practice terminal.'));
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

  const practiceStatus = status?.practice?.available
    ? { line: 'Always available · runs in-browser', tone: 'text-emerald-300' }
    : { line: 'Available', tone: 'text-emerald-300' };
  const courseStatus = dockerOnline
    ? { line: 'Docker engine online', tone: 'text-emerald-300' }
    : { line: 'Docker engine offline', tone: 'text-amber-300' };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Practical labs</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Choose how you want to practise: instant browser terminals for warm-ups, or real Docker workstations for
            graded course practicals.
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
          statusLine={practiceStatus.line}
          statusTone={practiceStatus.tone}
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
          statusLine={courseStatus.line}
          statusTone={courseStatus.tone}
          onSelect={() => setMode('course')}
          onPrimary={() => setMode('course')}
          primaryLabel={mode === 'course' ? 'Browse labs' : 'Browse practicals'}
          disabled={loading}
        />
      </div>

      {!dockerOnline && courseLabs.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3.5 py-2.5 text-xs leading-5 text-amber-200">
          <IconServer size={14} className="mt-0.5 shrink-0 text-amber-400" />
          <span>
            <span className="font-medium text-amber-200">Course practicals are temporarily offline.</span>{' '}
            {dockerReason} Practice terminals keep working because they run in your browser.
          </span>
        </div>
      )}

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={mode === 'practice' ? 'Search practice terminals…' : 'Search course practicals…'}
            className="input pl-9"
            aria-label="Search labs"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDifficulty('all')}
            className={`chip ${difficulty === 'all' ? 'chip-active' : ''}`}
          >
            All levels
          </button>
          {Object.keys(DIFFICULTIES).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setDifficulty(key)}
              className={`chip ${difficulty === key ? 'chip-active' : ''}`}
            >
              {DIFFICULTIES[key].label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 whitespace-nowrap text-xs text-slate-400">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(event) => setMineOnly(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-white/20 bg-night-950 text-brand-400"
          />
          Started by me
        </label>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-slate-300">
            {mode === 'practice' ? 'Practice terminals' : 'Course practicals'}
          </h2>
          <Badge tone="slate">{filtered.length}</Badge>
          {mode === 'practice' && (
            <Badge tone="emerald">
              <IconShield size={11} /> simulated shell
            </Badge>
          )}
        </div>
        {(search || difficulty !== 'all' || mineOnly) && (
          <button type="button" onClick={resetFilters} className="text-[11px] text-slate-400 transition hover:text-brand-300">
            Clear filters
          </button>
        )}
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

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
            message="Instructors have not published any practice terminals yet. Course practicals are available now."
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
            return (
              <Card key={lab.id} className="group flex flex-col p-5 transition hover:border-brand-400/30">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                      isPractice
                        ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                        : 'border-sky-400/20 bg-sky-400/10 text-sky-300'
                    }`}
                  >
                    {isPractice ? <IconZap size={18} /> : <IconTerminal size={18} />}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge tone={tone}>{DIFFICULTIES[lab.difficulty]?.label || lab.difficulty}</Badge>
                    {isPractice ? <Badge tone="emerald">practice</Badge> : <Badge tone="sky">course</Badge>}
                  </div>
                </div>
                <h3 className="mt-3 font-display text-base font-semibold leading-snug text-white">{lab.title}</h3>
                {lab.summary && <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-400">{lab.summary}</p>}
                <p className="mt-2 text-[11px] text-slate-500">
                  {isPractice
                    ? `Practice · open to all · ${lab.step_count} steps`
                    : `${lab.course_title || 'Independent lab'} · ${lab.step_count} steps`}
                </p>

                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <IconClock size={11} /> {lab.estimated_minutes} min
                    </span>
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
                  <div className="mt-3 flex items-center gap-1.5 border-t border-white/5 pt-2 text-[10px] uppercase tracking-wider text-slate-500">
                    <span className={`h-1.5 w-1.5 rounded-full ${lab.my_status === 'running' ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    last session {lab.my_status}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11px] leading-5 text-slate-600">
        <IconArrowRight size={12} className="mt-1 shrink-0" />
        {mode === 'practice'
          ? 'Practice terminals are simulated entirely in the browser — no container is created and nothing is graded.'
          : 'Course practicals run in a real isolated Linux container. Finish every required step to unlock your practical report.'}
      </p>
    </div>
  );
}
