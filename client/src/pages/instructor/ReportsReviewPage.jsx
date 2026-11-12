import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Pagination, Skeleton } from '../../components/ui';
import { IconArrowRight, IconFileText, IconTerminal, IconUser } from '../../components/icons';
import { REPORT_STATUS } from '../../lib/constants';
import { timeAgo } from '../../lib/format';

const filters = [
  { key: 'submitted', label: 'Pending review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Returned' },
  { key: 'published', label: 'Published' },
  { key: 'all', label: 'All' },
];

export default function ReportsReviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const filter = filters.some((item) => item.key === searchParams.get('status')) ? searchParams.get('status') : 'submitted';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = { page, limit: 20 };
    if (filter !== 'all') params.status = filter;
    api
      .get('/reports', { params })
      .then((res) => {
        if (cancelled) return;
        setReports(res.data.reports || []);
        setTotal(res.data.total || 0);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load the review queue.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, page]);

  const changeFilter = (key) => {
    setPage(1);
    setSearchParams(key === 'submitted' ? {} : { status: key });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Student Reports</h1>
        <p className="mt-1 text-sm text-slate-400">
          Grade step evidence, screenshots and solution articles from your labs, then turn standout work into
          instructor-authored articles.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filters.map((item) => (
          <button key={item.key} type="button" onClick={() => changeFilter(item.key)} className={`chip ${filter === item.key ? 'chip-active' : ''}`}>
            {item.label}
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
      ) : reports.length === 0 ? (
        <EmptyState
          icon={IconFileText}
          title="Queue is clear"
          message={filter === 'submitted' ? 'No reports are waiting for review right now.' : 'No reports in this bucket yet.'}
        />
      ) : (
        <>
          <div className="space-y-3">
            {reports.map((report) => {
              const status = REPORT_STATUS[report.status] || REPORT_STATUS.draft;
              return (
                <Card key={report.id} className="p-5 transition hover:border-brand-400/25">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={status.tone}>{status.label}</Badge>
                        {report.score != null && (
                          <span className="font-mono text-[11px] text-emerald-300">
                            {Number(report.score)}
                            {report.max_score != null ? ` / ${Number(report.max_score)}` : ''} marks
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                          <IconTerminal size={11} /> {report.lab_title}
                        </span>
                        {report.course_title && <span className="text-[11px] text-slate-600">· {report.course_title}</span>}
                      </div>
                      <h2 className="mt-2 font-display text-base font-semibold text-white">
                        <Link to={`/instructor/reports/${report.id}`} className="hover:text-brand-200">{report.title}</Link>
                      </h2>
                      <p className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1"><IconUser size={11} /> {report.author_name}</span>
                        <span>· {report.author_email}</span>
                        <span>· updated {timeAgo(report.updated_at)}</span>
                      </p>
                      {report.instructor_feedback && (
                        <p className="mt-2 line-clamp-1 text-[11px] text-slate-500">Feedback: {report.instructor_feedback}</p>
                      )}
                    </div>
                    <Button as={Link} to={`/instructor/reports/${report.id}`} size="sm" variant={report.status === 'submitted' ? 'primary' : 'secondary'}>
                      {report.status === 'submitted' ? 'Review' : 'Open'} <IconArrowRight size={13} />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
          <Pagination page={page} limit={20} total={total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
