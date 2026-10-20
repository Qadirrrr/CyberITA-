import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Skeleton } from '../../components/ui';
import {
  IconArrowRight,
  IconCamera,
  IconCheckCircle,
  IconClock,
  IconFileText,
  IconTerminal,
} from '../../components/icons';
import { REPORT_STATUS } from '../../lib/constants';
import { formatDateTime, timeAgo } from '../../lib/format';

const filters = [
  { key: 'all', label: 'All reports' },
  { key: 'draft', label: 'Drafts' },
  { key: 'submitted', label: 'Pending review' },
  { key: 'approved', label: 'Approved' },
  { key: 'published', label: 'Published' },
  { key: 'rejected', label: 'Needs changes' },
];

export default function ReportsPage() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    api
      .get('/reports/mine')
      .then((res) => {
        if (!cancelled) setReports(res.data.reports || []);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load your reports.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const map = { all: reports.length };
    for (const report of reports) map[report.status] = (map[report.status] || 0) + 1;
    return map;
  }, [reports]);

  const filtered = filter === 'all' ? reports : reports.filter((report) => report.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Practical reports</h1>
          <p className="mt-1 text-sm text-slate-400">
            Document your lab work, submit it for review, and publish approved reports to the community blog.
          </p>
        </div>
        <Button as={Link} to="/student/labs" variant="secondary" size="sm">
          <IconTerminal size={14} /> Go to labs
        </Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filters.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setFilter(item.key)}
            className={`chip ${filter === item.key ? 'chip-active' : ''}`}
          >
            {item.label}
            <span className="ml-1 text-[10px] opacity-60">{counts[item.key] || 0}</span>
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={IconFileText}
          title={filter === 'all' ? 'No reports yet' : 'Nothing in this bucket'}
          message={
            filter === 'all'
              ? 'Finish a practical lab, then generate a report from your verified steps.'
              : 'Try another status filter to see the rest of your reports.'
          }
          action={
            filter === 'all' ? (
              <Button as={Link} to="/student/labs" size="sm">
                Start a lab <IconArrowRight size={14} />
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((report) => {
            const status = REPORT_STATUS[report.status] || REPORT_STATUS.draft;
            return (
              <Card key={report.id} className="group p-5 transition hover:border-brand-400/25">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={status.tone}>{status.label}</Badge>
                      {report.course_title && <span className="text-[11px] text-slate-500">{report.course_title}</span>}
                    </div>
                    <h2 className="mt-2 font-display text-base font-semibold text-white">
                      <Link to={`/student/reports/${report.id}`} className="transition hover:text-brand-200">
                        {report.title}
                      </Link>
                    </h2>
                    <p className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <IconTerminal size={11} /> {report.lab_title}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <IconCamera size={11} /> {report.screenshot_count} screenshots
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <IconClock size={11} /> updated {timeAgo(report.updated_at)}
                      </span>
                    </p>
                    {report.status === 'rejected' && report.instructor_feedback && (
                      <p className="mt-2 line-clamp-2 rounded-lg border border-rose-400/20 bg-rose-400/5 px-2.5 py-1.5 text-[11px] leading-5 text-rose-200/80">
                        {report.instructor_feedback}
                      </p>
                    )}
                    {report.status === 'published' && report.published_slug && (
                      <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-300">
                        <IconCheckCircle size={11} /> Published to the blog
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-[10px] text-slate-600">{formatDateTime(report.updated_at)}</span>
                    <Button as={Link} to={`/student/reports/${report.id}`} size="sm" variant="secondary">
                      {report.status === 'draft' || report.status === 'rejected' ? 'Continue editing' : 'View report'}
                      <IconArrowRight size={13} />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
