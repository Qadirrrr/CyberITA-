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
  cx,
} from '../../components/ui';
import {
  IconArrowLeft,
  IconCamera,
  IconCheckCircle,
  IconEdit,
  IconExternalLink,
  IconFileText,
  IconSave,
  IconSend,
  IconTerminal,
  IconXCircle,
} from '../../components/icons';
import { REPORT_STATUS } from '../../lib/constants';
import { formatDateTime } from '../../lib/format';

const EDITABLE_STATUSES = ['submitted', 'approved', 'rejected'];

const num = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function normalizeRubric(steps, report) {
  const existing = Array.isArray(report?.rubric) ? report.rubric : [];
  if (existing.length > 0) {
    return existing.map((entry, index) => ({
      key: entry.stepId ?? `rubric-${index}`,
      stepId: entry.stepId ?? null,
      title: entry.title || steps[index]?.title || `Step ${index + 1}`,
      points: num(entry.points),
      maxPoints: num(entry.maxPoints ?? entry.max_points, num(steps[index]?.points)),
      comment: entry.comment || '',
    }));
  }
  return steps.map((step) => ({
    key: step.id,
    stepId: step.id,
    title: step.title,
    points: 0,
    maxPoints: num(step.points),
    comment: '',
  }));
}

export default function ReportReviewDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [score, setScore] = useState('');
  const [maxScore, setMaxScore] = useState('');
  const [rubric, setRubric] = useState([]);
  const [reviewing, setReviewing] = useState(false);
  const [publishForm, setPublishForm] = useState({ title: '', excerpt: '', tags: '', coverImage: '' });
  const [publishing, setPublishing] = useState(false);
  const [tab, setTab] = useState('content');

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data: response } = await api.get(`/reports/${id}`);
      setData(response);
      const rows = normalizeRubric(response.steps || [], response.report);
      setRubric(rows);
      setScore(response.report.score != null ? String(num(response.report.score)) : '');
      setMaxScore(
        response.report.max_score != null
          ? String(num(response.report.max_score))
          : String(rows.reduce((sum, row) => sum + num(row.maxPoints), 0))
      );
      setPublishForm({
        title: response.report.title,
        excerpt: response.report.summary || '',
        tags: 'lab-report',
        coverImage: '',
      });
      if (!silent) setFeedback('');
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

  const updateRubric = (index, field, value) => {
    setRubric((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row))
    );
  };

  const fillFullMarks = () => {
    setRubric((current) => current.map((row) => ({ ...row, points: num(row.maxPoints) })));
    setMaxScore(String(rubric.reduce((sum, row) => sum + num(row.maxPoints), 0)));
  };

  const buildRubricPayload = () =>
    rubric.map((row) => ({
      stepId: row.stepId,
      title: row.title,
      points: num(row.points),
      maxPoints: num(row.maxPoints),
      comment: row.comment || '',
    }));

  const review = async (action) => {
    setReviewing(true);
    try {
      const payload = {
        action,
        feedback,
        score: score === '' ? null : num(score),
        maxScore: maxScore === '' ? null : num(maxScore),
        rubric: buildRubricPayload(),
      };
      const { data: response } = await api.post(`/reports/${id}/review`, payload);
      const detail = response?.report;
      toast.success(
        action === 'approve'
          ? detail?.score != null
            ? `Report approved with ${num(detail.score)}/${num(detail.max_score)} marks.`
            : 'Report approved.'
          : 'Correction request sent to the learner.'
      );
      setFeedback('');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the review.'));
    } finally {
      setReviewing(false);
    }
  };

  const saveArticle = async (status) => {
    setPublishing(true);
    try {
      const { data: response } = await api.post(`/reports/${id}/publish`, {
        title: publishForm.title,
        excerpt: publishForm.excerpt,
        tags: publishForm.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        coverImage: publishForm.coverImage.trim() || null,
        status,
      });
      if (status === 'published') {
        toast.success('Article published to the blog.');
        navigate(`/blog/${response.post.slug}`);
        return;
      }
      toast.success('Draft article saved in Articles.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the article.'));
    } finally {
      setPublishing(false);
    }
  };

  const publishDraft = async () => {
    if (!data?.report?.published_post_id) return;
    setPublishing(true);
    try {
      const { data: response } = await api.post(`/posts/${data.report.published_post_id}/status`, {
        status: 'published',
      });
      toast.success('Article published.');
      if (response?.post?.slug) {
        navigate(`/blog/${response.post.slug}`);
        return;
      }
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not publish the draft.'));
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
          Back to submission review
        </Button>
      </div>
    );
  }

  const { report, screenshots = [], steps = [], completedSteps = [] } = data;
  const status = REPORT_STATUS[report.status] || REPORT_STATUS.draft;
  const awarded = rubric.reduce((sum, row) => sum + num(row.points), 0);
  const possible = rubric.reduce((sum, row) => sum + num(row.maxPoints), 0);
  const articleSaved = Boolean(report.published_post_id);
  const articlePublished = report.published_post_status === 'published' || report.status === 'published';
  const articleDraft = articleSaved && !articlePublished;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/instructor/reports"
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-300"
        >
          <IconArrowLeft size={13} /> Submission review
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          {report.score != null && (
            <Badge tone="emerald">
              {num(report.score)}
              {report.max_score != null ? ` / ${num(report.max_score)}` : ''} marks
            </Badge>
          )}
          {articlePublished && report.published_slug && (
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
          <span className="inline-flex items-center gap-1">
            <IconTerminal size={11} /> {report.lab_title}
          </span>
          <span>{report.course_title || 'Independent lab'}</span>
          <span>
            By {report.author_name} ({report.author_email})
          </span>
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
          <span className="text-slate-500">{steps.length} total steps</span>
          <span className="text-slate-500">{report.sections?.length ?? 0} report sections</span>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="overflow-hidden">
          <div className="flex flex-wrap gap-1 border-b border-white/10 p-2">
            {[
              { id: 'content', label: 'Report' },
              { id: 'steps', label: 'Step evidence' },
              { id: 'article', label: 'Solution article' },
              { id: 'evidence', label: 'Screenshots' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-xs font-medium transition',
                  tab === item.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'content' && (
            <div className="p-6">
              {report.content ? (
                <Markdown>{report.content}</Markdown>
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">No report narrative was submitted.</p>
              )}
            </div>
          )}

          {tab === 'steps' && (
            <ul className="divide-y divide-white/5">
              {steps.length === 0 && (
                <li className="px-5 py-8 text-center text-sm text-slate-500">
                  This lab has no recorded steps.
                </li>
              )}
              {steps.map((step) => (
                <li key={step.id ?? `${step.position}-${step.title}`} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-slate-200">
                      <span className="mr-2 font-mono text-[10px] text-slate-500">
                        {String(Number(step.position) + 1).padStart(2, '0')}
                      </span>
                      {step.title}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="slate">{step.verification}</Badge>
                      {step.is_optional && <Badge tone="slate">optional</Badge>}
                      <Badge tone={step.completed ? 'emerald' : 'amber'}>
                        {step.completed ? 'verified' : 'not completed'}
                      </Badge>
                      <span className="text-[10px] text-slate-500">{num(step.points)} pts</span>
                    </div>
                  </div>

                  {step.instruction && (
                    <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-5 text-slate-400">
                      {step.instruction}
                    </p>
                  )}

                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-lg border border-white/5 bg-night-950/60 px-3 py-2">
                      <p className="text-[9px] uppercase tracking-wider text-slate-600">Learner answer</p>
                      {step.command_used ? (
                        <code className="mt-0.5 block break-words font-mono text-[11px] text-emerald-300">
                          $ {step.command_used}
                        </code>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-slate-600">No command recorded.</p>
                      )}
                    </div>
                    {step.expected_command || step.expected_output_pattern ? (
                      <div className="rounded-lg border border-brand-400/10 bg-brand-400/[0.04] px-3 py-2">
                        <p className="text-[9px] uppercase tracking-wider text-brand-300/70">Expected</p>
                        {step.expected_command && (
                          <code className="mt-0.5 block break-words font-mono text-[11px] text-brand-300">
                            {step.expected_command}
                          </code>
                        )}
                        {step.expected_output_pattern && (
                          <code className="mt-0.5 block break-words font-mono text-[10px] text-brand-300/80">
                            /{step.expected_output_pattern}/i
                          </code>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {step.output_excerpt && (
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-white/5 bg-night-950/70 px-3 py-2 font-mono text-[10px] text-slate-400">
                      {step.output_excerpt}
                    </pre>
                  )}

                  {step.screenshots?.length > 0 && (
                    <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {(step?.screenshots || []).map((shot) => (
                        <a
                          key={`${step.id}-${shot.id}`}
                          href={shot.file_path}
                          target="_blank"
                          rel="noreferrer"
                          className="group overflow-hidden rounded-lg border border-white/10 hover:border-brand-400/40"
                        >
                          <img
                            src={shot.file_path}
                            alt={shot.original_name || 'Step screenshot'}
                            className="h-20 w-full object-cover transition group-hover:scale-105"
                          />
                        </a>
                      ))}
                    </div>
                  )}

                  {step.completed_at && (
                    <p className="mt-1.5 text-[10px] text-slate-600">
                      Completed {formatDateTime(step.completed_at)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {tab === 'article' && (
            <div className="p-6">
              {report.solution_article ? (
                <Markdown>{report.solution_article}</Markdown>
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">
                  The learner has not written a final solution article yet.
                </p>
              )}
            </div>
          )}

          {tab === 'evidence' && (
            <div className="p-5">
              {screenshots.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  No screenshots were attached to this session.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {screenshots.map((shot) => (
                    <a
                      key={shot.id}
                      href={shot.file_path}
                      target="_blank"
                      rel="noreferrer"
                      className="group overflow-hidden rounded-xl border border-white/10 hover:border-brand-400/40"
                    >
                      <img
                        src={shot.file_path}
                        alt={shot.original_name || 'Screenshot'}
                        className="h-32 w-full object-cover transition group-hover:scale-105"
                      />
                      <p className="truncate px-2 py-1.5 text-[10px] text-slate-500">{shot.original_name}</p>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          {EDITABLE_STATUSES.includes(report.status) && (
            <Card className="p-5">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <IconEdit size={15} className="text-brand-300" /> Practical evaluation
              </h2>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                Score each step, leave specific feedback, then approve or ask for a correction.
              </p>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <Input
                  label="Marks awarded"
                  type="number"
                  min="0"
                  step="0.5"
                  value={score}
                  onChange={(event) => setScore(event.target.value)}
                />
                <Input
                  label="Out of"
                  type="number"
                  min="0"
                  step="0.5"
                  value={maxScore}
                  onChange={(event) => setMaxScore(event.target.value)}
                />
              </div>

              {rubric.length > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Step rubric
                    </p>
                    <button
                      type="button"
                      onClick={fillFullMarks}
                      className="text-[10px] text-brand-300 hover:text-brand-200"
                    >
                      Award all step points
                    </button>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {rubric.map((row, index) => (
                      <li key={row.key} className="rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 flex-1 truncate text-[11px] text-slate-200">
                            <span className="mr-1.5 font-mono text-[9px] text-slate-500">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            {row.title}
                          </p>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              max={row.maxPoints || undefined}
                              value={row.points}
                              onChange={(event) => updateRubric(index, 'points', event.target.value)}
                              aria-label={`Marks for ${row.title}`}
                              className="w-16 rounded-md border border-white/10 bg-night-900 px-2 py-1 text-right font-mono text-[11px] text-slate-200 focus:border-brand-400/50 focus:outline-none"
                            />
                            <span className="font-mono text-[10px] text-slate-500">
                              / {num(row.maxPoints)}
                            </span>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={row.comment}
                          onChange={(event) => updateRubric(index, 'comment', event.target.value)}
                          placeholder="Comment for this step (optional)"
                          aria-label={`Comment for ${row.title}`}
                          className="mt-1.5 w-full rounded-md border border-white/10 bg-night-900 px-2 py-1 text-[11px] text-slate-300 placeholder:text-slate-600 focus:border-brand-400/50 focus:outline-none"
                        />
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-right text-[10px] text-slate-500">
                    Rubric total{' '}
                    <span className="font-mono text-slate-300">
                      {awarded} / {possible}
                    </span>
                  </p>
                </div>
              )}

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
                  <IconXCircle size={14} /> Request correction
                </Button>
                <Button onClick={() => review('approve')} loading={reviewing}>
                  <IconCheckCircle size={14} /> Approve
                </Button>
              </div>
              <p className="mt-2 text-[10px] leading-4 text-slate-600">
                A correction request returns the report to the learner and clears the previous marks. Re-approving
                updates the marks and rubric.
              </p>
            </Card>
          )}

          {report.status === 'approved' && !articleSaved && (
            <Card className="p-5">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold">
                <IconSend size={15} className="text-emerald-300" /> Turn into an article
              </h2>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                Create an instructor-authored draft from the approved report. You can edit it in Articles before it
                goes public.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  saveArticle('draft');
                }}
                className="mt-3 space-y-3"
              >
                <Input
                  label="Article title"
                  value={publishForm.title}
                  onChange={(event) => setPublishForm((current) => ({ ...current, title: event.target.value }))}
                  required
                />
                <Textarea
                  label="Excerpt"
                  rows={3}
                  value={publishForm.excerpt}
                  onChange={(event) => setPublishForm((current) => ({ ...current, excerpt: event.target.value }))}
                />
                <Input
                  label="Tags"
                  value={publishForm.tags}
                  onChange={(event) => setPublishForm((current) => ({ ...current, tags: event.target.value }))}
                  placeholder="linux, troubleshooting, lab-report"
                  hint="Comma separated, up to 10."
                />
                <Input
                  label="Cover image URL (optional)"
                  value={publishForm.coverImage}
                  onChange={(event) => setPublishForm((current) => ({ ...current, coverImage: event.target.value }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <Button type="submit" variant="secondary" loading={publishing}>
                    <IconSave size={14} /> Save draft
                  </Button>
                  <Button type="button" loading={publishing} onClick={() => saveArticle('published')}>
                    <IconFileText size={14} /> Publish now
                  </Button>
                </div>
              </form>
            </Card>
          )}

          {articleDraft && (
            <Card className="border-brand-400/25 bg-brand-400/[0.04] p-5">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-brand-700 dark:text-brand-200">
                <IconFileText size={15} /> Article draft ready
              </h2>
              <p className="mt-1 text-xs leading-6 text-slate-300">
                This report is saved as an instructor-authored draft. Edit it in Articles, then publish when you are
                happy with it.
              </p>
              <div className="mt-3 grid gap-2">
                <Button as={Link} to="/instructor/blog" variant="secondary" size="sm">
                  <IconExternalLink size={13} /> Edit in Articles
                </Button>
                <Button onClick={publishDraft} loading={publishing} size="sm">
                  <IconSend size={13} /> Publish article
                </Button>
              </div>
            </Card>
          )}

          {articlePublished && (
            <Card className="border-emerald-400/25 bg-emerald-400/[0.04] p-5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-200">
                <IconCheckCircle size={15} /> Published
              </h2>
              <p className="mt-1 text-xs leading-6 text-slate-300">This report is live on the CyberITA+ blog.</p>
              {report.published_slug && (
                <Button
                  as={Link}
                  to={`/blog/${report.published_slug}`}
                  variant="secondary"
                  size="sm"
                  className="mt-3 w-full"
                >
                  <IconExternalLink size={13} /> Open article
                </Button>
              )}
            </Card>
          )}

          {report.status === 'rejected' && (
            <Card className="border-rose-400/25 bg-rose-400/[0.04] p-5">
              <h2 className="text-sm font-semibold text-rose-700 dark:text-rose-200">Correction requested</h2>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-slate-300">
                {report.instructor_feedback || 'No feedback recorded.'}
              </p>
              <p className="mt-2 text-[10px] text-slate-500">
                The learner must revise and resubmit before the report can be approved.
              </p>
            </Card>
          )}

          {report.instructor_feedback && report.status !== 'rejected' && (
            <Card className="p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Last feedback</h2>
              <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-slate-300">
                {report.instructor_feedback}
              </p>
            </Card>
          )}

          <Card className="p-4">
            <p className="text-[11px] leading-5 text-slate-500">
              Evidence, answers and screenshots belong to this learner&apos;s session. Only the course instructor and
              administrators can open them.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
