import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { Badge, Card, ProgressBar, Skeleton } from '../../components/ui';
import { IconAward, IconStar } from '../../components/icons';

const RANK_STYLES = [
  'bg-amber-400 text-night-950',
  'bg-slate-300 text-night-950',
  'bg-orange-300 text-night-950',
];

export default function LeaderboardPage() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/leaderboard');
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) toast.error(getErrorMessage(err, 'Could not load the leaderboard.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const me = data?.me;
  const leaders = data?.leaders || [];
  const levelProgress = me ? Math.min(100, Math.round(((me.xp - me.levelStart) / (me.nextLevelAt - me.levelStart)) * 100)) : 0;

  return (
    <div className="animate-fade-up space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Leaderboard</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Earn XP by finishing lab steps, completing labs and getting real lab submissions approved. The best learners top the board.
        </p>
      </div>

      {me && (
        <Card className="relative overflow-hidden p-5">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-cyan-400 to-accent-500" aria-hidden="true" />
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Your rank</div>
              <div className="mt-0.5 font-display text-2xl font-semibold text-slate-900 dark:text-white">
                {me.rank ? `#${me.rank}` : 'Not ranked yet'}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Your XP</div>
              <div className="mt-0.5 inline-flex items-center gap-1.5 font-display text-2xl font-semibold text-slate-900 dark:text-white">
                <IconStar size={19} className="text-amber-400" /> {me.xp}
              </div>
            </div>
            <div className="min-w-[200px] flex-1">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <span>Level {me.level}</span>
                <span>{me.nextLevelAt - me.xp} XP to level {me.level + 1}</span>
              </div>
              <ProgressBar value={levelProgress} className="mt-1.5" />
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        {leaders.length === 0 ? (
          <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
            No XP has been earned yet. Finish a lab and you will be the first name on this board.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {leaders.map((entry) => (
              <li
                key={entry.id}
                className={`flex items-center gap-3 px-4 py-3 sm:px-5 ${entry.isMe ? 'bg-brand-500/10' : ''}`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    RANK_STYLES[entry.rank - 1] || 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-300'
                  }`}
                >
                  {entry.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {entry.name} {entry.isMe && <Badge tone="brand" className="ml-1">You</Badge>}
                  </div>
                  <div className="text-xs text-slate-400">
                    Level {entry.level} · {entry.labsFinished} lab{entry.labsFinished === 1 ? '' : 's'} finished · {entry.coursesFinished} course{entry.coursesFinished === 1 ? '' : 's'} completed
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  <IconStar size={14} className="text-amber-400" /> {entry.xp} XP
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <IconAward size={15} className="text-brand-500" /> How to earn XP
        </h2>
        <ul className="mt-3 grid gap-2 text-sm text-slate-500 dark:text-slate-400 sm:grid-cols-2">
          <li>Verified lab step: earns the step points (usually 10 XP)</li>
          <li>Guided lab completed: +{data?.rules?.labCompleted ?? 50} XP</li>
          <li>Real lab submission approved: +{data?.rules?.submissionApproved ?? 100} XP</li>
          <li>Course completed: +{data?.rules?.courseCompleted ?? 150} XP</li>
        </ul>
        <p className="mt-3 text-xs text-slate-400">XP is earned once per step, lab, submission and course, so replaying a finished lab does not farm points.</p>
      </Card>
    </div>
  );
}
