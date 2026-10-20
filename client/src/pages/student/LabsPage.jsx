import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Skeleton } from '../../components/ui';
import {
  IconArrowRight,
  IconCheckCircle,
  IconClock,
  IconPlay,
  IconSearch,
  IconTerminal,
} from '../../components/icons';
import { DIFFICULTIES } from '../../lib/constants';
import { timeAgo } from '../../lib/format';

const difficultyTone = { beginner: 'emerald', intermediate: 'amber', advanced: 'rose' };

export default function LabsPage() {
  const [labs, setLabs] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [DIFFICULTIES, setDIFFICULTIES] = useState('all');
  const [mineOnly, setMineOnly] = useState(false);
  const [error, setError] = useState('');

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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return labs.filter((lab) => {
      if (DIFFICULTIES !== 'all' && lab.DIFFICULTIES !== DIFFICULTIES) return false;
      if (mineOnly && !lab.last_started_at) return false;
      if (!term) return true;
      return `${lab.title} ${lab.summary} ${lab.course_title || ''}`.toLowerCase().includes(term);
    });
  }, [labs, search, DIFFICULTIES, mineOnly]);

  const started = labs.filter((lab) => lab.last_started_at).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Practical labs</h1>
          <p className="mt-1 text-sm text-slate-400">
            Browser-based terminals with guided, verified steps. No local setup required.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone="brand">
            <IconTerminal size={12} /> {labs.length} labs available
          </Badge>
          {started > 0 && (
            <Badge tone="emerald">
              <IconCheckCircle size={12} /> {started} started
            </Badge>
          )}
          {status && (
            <Badge tone={status.available ? 'emerald' : 'rose'}>
              {status.available ? `Provider ready · ${status.provider}` : 'Provider unavailable'}
            </Badge>
          )}
        </div>
      </div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search labs, topics or courses…"
            className="input pl-9"
            aria-label="Search labs"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDIFFICULTIES('all')}
            className={`chip ${DIFFICULTIES === 'all' ? 'chip-active' : ''}`}
          >
            All levels
          </button>
          {Object.keys(DIFFICULTIES).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setDIFFICULTIES(key)}
              className={`chip ${DIFFICULTIES === key ? 'chip-active' : ''}`}
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

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <Skeleton key={index} className="h-48 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={IconTerminal}
          title="No labs found"
          message="Try clearing the filters, or explore a course to find attached labs."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((lab) => {
            const tone = difficultyTone[lab.DIFFICULTIES] || 'brand';
            return (
              <Card key={lab.id} className="group flex flex-col p-5 transition hover:border-brand-400/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-400/10 text-brand-300">
                    <IconTerminal size={18} />
                  </div>
                  <Badge tone={tone}>{DIFFICULTIES[lab.DIFFICULTIES]?.label || lab.DIFFICULTIES}</Badge>
                </div>
                <h2 className="mt-3 font-display text-base font-semibold leading-snug text-white">{lab.title}</h2>
                {lab.summary && <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-400">{lab.summary}</p>}
                <p className="mt-2 text-[11px] text-slate-500">
                  {lab.course_title ? `${lab.course_title} · ` : ''}
                  {lab.step_count} steps
                </p>

                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <IconClock size={11} /> {lab.estimated_minutes} min
                    </span>
                    {lab.last_started_at && <span>· started {timeAgo(lab.last_started_at)}</span>}
                  </div>
                  <Button as={Link} to={`/labs/${lab.id}`} size="sm" variant="secondary">
                    <IconPlay size={13} /> Open
                  </Button>
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

      <p className="flex items-center gap-1.5 text-[11px] text-slate-600">
        <IconArrowRight size={12} /> Complete every required step to unlock practical report generation.
      </p>
    </div>
  );
}

