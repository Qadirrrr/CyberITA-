import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import Markdown from '../../components/Markdown';
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  Skeleton,
  Textarea,
} from '../../components/ui';
import {
  IconArrowLeft,
  IconCamera,
  IconCheckCircle,
  IconEdit,
  IconExternalLink,
  IconFileText,
  IconSend,
  IconTerminal,
  IconXCircle,
} from '../../components/icons';
import { REPORT_STATUS } from '../../lib/constants';
import { formatDateTime } from '../../lib/format';

export default function ReportReviewDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [publishForm, setPublishForm] = useState({ title: '', excerpt: '', tags: '', coverImage: '' });
  const [publishing, setPublishing] = useState(false);
  const [tab, setTab] = useState('content');

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data: response } = await api.get(`/reports/${id}`);
      setData(response);
      setPublishForm({
        title: response.report.title,
        excerpt: response.report.summary || '',
        tags: Array.isArray(response.report.sections) ? 'lab-report' : '',
        coverImage: '',
      });
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load this report.'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const review = async (action) => {
    setReviewing(true);
    try {
      await api.post(`/reports/${id}/review`, { action, feedback });
      toast.success(action === 'approve' ? 'Report approved.' : 'Report returned to the learner.');
      setFeedback('');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the review.'));
    } finally {
      setReviewing(false);
    }
  };

  const publish = async (event) => {
    event.preventDefault();
    setPublishing(true);
    try {
      const { data: response } = await api.post(`/reports/${id}/publish`, {
        title: publishForm.title,
        excerpt: publishForm.excerpt,
        tags: publishForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        coverImage: publishForm.coverImage.trim() || null,
      });
      toast.success('Report published to the blog.');
      navigate(`/blog/${response.post.slug}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not publish the report.'));
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !data?.report) {
    return (
      <div>
        <Alert tone="error" title="Report unavailable">
          {error || 'This report could not be found.'}
        </Alert>
        <Button as={Link} to="/instructor/reports" variant="secondary" className="mt-4">
          Back to review queue
        </Button>
      </div>
    );
  }

  const { report, screenshots = [], completedSteps = [] } = data;
  const status = REPORT_STATUS[report.status] || REPORT_STATUS.draft;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/instructor/reports" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-300">
          <IconArrowLeft size={13} /> Review queue
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {report.published_slug && (
            <Button as={Link} to={`/blog/${report.published_slug}`} size="sm" variant="secondary">
              <IconExternalLink size={13} /> View article
            </Button>
          )}
        </div>
      </div>

      <Card className="p-6">
        <h1 className="font-display text-2xl font-semibold">{report.title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">{report.summary}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-4 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1"><IconTerminal size={11} /> {report.lab_title}</span>
          <span>{report.course_title || 'Independent lab'}</span>
          <span>By {report.author_name} ({report.author_email})</span>
          <span>Generated {formatDateTime(report.created_at)}</span>
          {report.reviewed_at && <span>Reviewed {formatDateTime(report.reviewed_at)}</span>}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[11px]">
          <span className="inline-flex items-center gap-1 text-emerald-300">
            <IconCheckCircle size={12} /> {completedSteps.length} verified steps
          </span>
          <span className="inline-flex items-center gap-1 text-brand-300">
            <IconCamera size={12} /> {screenshots.length} screenshots
          </span>
          <span className="text-slate-500">{report.sections?.length ?? 0} report sections</span>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden">
          <div className="flex gap-1 border-b border-white/10 p-2">
            {[
              { id: 'content', label: 'Report' },
              { id: 'steps', label: 'Verified steps' },
              { id: 'evidence', label: 'Screenshots' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${tab === item.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'content' && (
            <div className="p-6">
              <Markdown>{report.content}</Markdown>
            </div>
          )}

          {tab === 'steps' && (
            <ul className="divide-y divide-white/5">
              {completedSteps.map((step) => (
                <li key={`${step.position}-${step.title}`} className="px-5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-slate-200">
                      <span className="mr-2 font-mono text-[10px] text-slate-500">{String(step.position + 1).padStart(2, '0')}</span>
                      {step.title}
                    </p>
                    <Badge tone="emerald">verified</Badge>
                  </div>
                  {step.command_used && (
                    <code className="mt-1.5 block break-words rounded border border-white/5 bg-night-950/70 px-2 py-1 font-mono text-[11px] text-emerald-300">
                      $ {step.command_used}
                    </code>
                  )}
                  {step.completed_at && <p className="mt-1 text-[10px] text-slate-600">{formatDateTime(step.completed_at)}</p>}
                </li>
              ))}
              {completedSteps.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-500">No verified steps recorded.</li>}
            </ul>
          )}

          {tab === 'evidence' && (
            <div className="p-5">
              {screenshots.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No screenshots were attached to this session.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {screenshots.map((shot) => (
                    <a key={shot.id} href={shot.file_path} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-xl border border-white/10 hover:border-brand-400/40">
                      <img src={shot.file_path} alt={shot.original_name || 'Screenshot'} className="h-32 w-full object-cover transition group-hover:scale-105" />
                      <p className="truncate px-2 py-1.5 text-[10px] text-slate-500">{shot.original_name}</p>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          {report.status === 'submitted' && (
            <Card className="p-5">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <IconEdit size={15} className="text-brand-300" /> Review decision
              </h2>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">Approve the report to make it eligible for publishing, or return it with feedback.</p>
              <Textarea
                label="Feedback to the learner"
                className="mt-3"
                rows={5}
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="Highlight what was done well and what needs more detail…"
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="danger" onClick={() => review('reject')} loading={reviewing}>
                  <IconXCircle size={14} /> Return
                </Button>
                <Button onClick={() => review('approve')} loading={reviewing}>
                  <IconCheckCircle size={14} /> Approve
                </Button>
              </div>
            </Card>
          )}

          {report.status === 'approved' && (
            <Card className="p-5">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <IconSend size={15} className="text-emerald-300" /> Publish as article
              </h2>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">Approved. Publishing creates a public blog post authored by the learner.</p>
              <form onSubmit={publish} className="mt-3 space-y-3">
                <Input label="Article title" value={publishForm.title} onChange={(event) => setPublishForm((current) => ({ ...current, title: event.target.value }))} required />
                <Textarea label="Excerpt" rows={3} value={publishForm.excerpt} onChange={(event) => setPublishForm((current) => ({ ...current, excerpt: event.target.value }))} />
                <Input label="Tags" value={publishForm.tags} onChange={(event) => setPublishForm((current) => ({ ...current, tags: event.target.value }))} placeholder="linux, troubleshooting, lab-report" hint="Comma separated, up to 10." />
                <Input label="Cover image URL (optional)" value={publishForm.coverImage} onChange={(event) => setPublishForm((current) => ({ ...current, coverImage: event.target.value }))} />
                <Button type="submit" loading={publishing} className="w-full">
                  <IconFileText size={14} /> Publish article
                </Button>
              </form>
            </Card>
          )}

          {report.status === 'rejected' && (
            <Card className="border-rose-400/25 bg-rose-400/[0.04] p-5">
              <h2 className="text-sm font-semibold text-rose-200">Returned for changes</h2>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-slate-300">{report.instructor_feedback || 'No feedback recorded.'}</p>
              <p className="mt-2 text-[10px] text-slate-500">The learner must revise and resubmit before this can be reviewed again.</p>
            </Card>
          )}

          {report.status === 'published' && (
            <Card className="border-emerald-400/25 bg-emerald-400/[0.04] p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
                <IconCheckCircle size={15} /> Published
              </h2>
              <p className="mt-1 text-xs leading-6 text-slate-300">This report is live on the CyberITA+ blog.</p>
              {report.published_slug && (
                <Button as={Link} to={`/blog/${report.published_slug}`} variant="secondary" size="sm" className="mt-3 w-full">
                  <IconExternalLink size={13} /> Open article
                </Button>
              )}
            </Card>
          )}

          {report.instructor_feedback && report.status !== 'rejected' && (
            <Card className="p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Last feedback</h2>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-300">{report.instructor_feedback}</p>
            </Card>
          )}

          <Card className="p-4">
            <p className="text-[11px] leading-5 text-slate-500">
              Need the raw markdown? The learner can edit it from their report page. Staff can copy this report for the blog during publishing.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
