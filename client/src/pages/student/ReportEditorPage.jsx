import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import Markdown from '../../components/Markdown';
import { Alert, Badge, Button, Card, Input, Skeleton, Textarea } from '../../components/ui';
import {
  IconArrowLeft,
  IconCamera,
  IconCheckCircle,
  IconClipboard,
  IconExternalLink,
  IconFileText,
  IconSave,
  IconSend,
  IconTerminal,
} from '../../components/icons';
import { REPORT_STATUS } from '../../lib/constants';
import { formatDate, formatDateTime } from '../../lib/format';

function buildContent({ title, summary, sections, report }) {
  const lines = [];
  lines.push(`# ${title}`, '');
  if (summary) lines.push(`> ${summary}`, '');
  lines.push(
    `**Lab:** ${report.lab_title}  `,
    `**Course:** ${report.course_title || 'Independent lab'}  `,
    `**Prepared by:** ${report.author_name || ''}  `,
    `**Date:** ${new Date(report.created_at).toISOString().slice(0, 10)}`,
    '',
    '---',
    ''
  );
  sections.forEach((section, index) => {
    lines.push(`## ${index + 1}. ${section.title}`, '');
    if (section.instruction) lines.push(`${section.instruction}`, '');
    if (section.command) lines.push('```bash', section.command, '```', '');
    if (section.output) lines.push('**Output:**', '', '```', section.output.slice(0, 4000), '```', '');
    if (section.result) lines.push(`**Result:** ${section.result}`, '');
    if (section.notes) lines.push(`**Notes:** ${section.notes}`, '');
    if (section.screenshots?.length) {
      lines.push('**Screenshots:**', '');
      section.screenshots.forEach((shot) => lines.push(`![screenshot](${shot})`));
      lines.push('');
    }
    lines.push('---', '');
  });
  return lines.join('\n');
}

export default function ReportEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [sections, setSections] = useState([]);
  const [tab, setTab] = useState('edit');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get(`/reports/${id}`)
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setTitle(res.data.report.title);
        setSummary(res.data.report.summary || '');
        setSections(Array.isArray(res.data.report.sections) ? res.data.report.sections : []);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load this report.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const report = data?.report;
  const editable = report && ['draft', 'rejected'].includes(report.status);
  const status = report ? REPORT_STATUS[report.status] : null;

  const content = useMemo(() => {
    if (!report) return '';
    return buildContent({ title, summary, sections, report });
  }, [report, title, summary, sections]);

  const updateSection = (index, field, value) => {
    setSections((current) => current.map((section, itemIndex) => (itemIndex === index ? { ...section, [field]: value } : section)));
  };

  const persist = async () => {
    const { data: response } = await api.put(`/reports/${id}`, { title, summary, sections, content });
    setData((current) => ({ ...current, report: response.report }));
    return response.report;
  };

  const save = async () => {
    setSaving(true);
    try {
      await persist();
      toast.success('Report saved.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the report.'));
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!title.trim() || title.trim().length < 3) {
      toast.error('Give your report a descriptive title first.');
      return;
    }
    setSubmitting(true);
    try {
      await persist();
      const { data: response } = await api.post(`/reports/${id}/submit`);
      setData((current) => ({ ...current, report: response.report }));
      toast.success('Report submitted for instructor review.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not submit the report.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div>
        <Alert tone="error" title="Report unavailable">
          {error || 'This report could not be found.'}
        </Alert>
        <Button as={Link} to="/student/reports" variant="secondary" className="mt-4">
          Back to reports
        </Button>
      </div>
    );
  }

  const screenshots = data.screenshots || [];
  const completedSteps = data.completedSteps || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/student/reports" className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-brand-300">
          <IconArrowLeft size={13} /> Back to reports
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {status && <Badge tone={status.tone}>{status.label}</Badge>}
          {editable && (
            <>
              <Button variant="secondary" size="sm" onClick={save} loading={saving}>
                <IconSave size={13} /> Save draft
              </Button>
              <Button size="sm" onClick={submit} loading={submitting}>
                <IconSend size={13} /> Submit for review
              </Button>
            </>
          )}
          {report.published_slug && (
            <Button as={Link} to={`/blog/${report.published_slug}`} size="sm" variant="secondary">
              <IconExternalLink size={13} /> View published article
            </Button>
          )}
        </div>
      </div>

      {report.status === 'rejected' && report.instructor_feedback && (
        <Card className="border-rose-400/25 bg-rose-400/[0.05] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-300">Instructor feedback</p>
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-200">{report.instructor_feedback}</p>
          <p className="mt-2 text-[11px] text-slate-500">Revise the sections below — the report returns to draft as soon as you save.</p>
        </Card>
      )}

      {report.status === 'submitted' && (
        <Alert tone="info" title="Awaiting review">
          Your instructor is reviewing this report. You'll get a notification once it's approved or returned for changes.
        </Alert>
      )}

      {report.status === 'approved' && (
        <Alert tone="success" title="Approved">
          Your report passed review. An instructor may publish it to the CyberITA+ blog.
        </Alert>
      )}

      <Card className="p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
          <div className="space-y-4">
            {editable ? (
              <>
                <div>
                  <label htmlFor="report-title" className="label">
                    Report title
                  </label>
                  <Input id="report-title" value={title} onChange={(event) => setTitle(event.target.value)} className="mt-1.5" />
                </div>
                <div>
                  <label htmlFor="report-summary" className="label">
                    Summary
                  </label>
                  <Textarea
                    id="report-summary"
                    rows={2}
                    value={summary}
                    onChange={(event) => setSummary(event.target.value)}
                    className="mt-1.5"
                    placeholder="One or two sentences describing what you achieved in this lab."
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">Report</p>
                  <h1 className="mt-1 font-display text-2xl font-semibold">{report.title}</h1>
                  {report.summary && <p className="mt-2 text-sm leading-6 text-slate-400">{report.summary}</p>}
                </div>
              </>
            )}
          </div>
          <div className="rounded-xl border border-white/10 bg-night-950/50 p-4 text-xs">
            <dl className="space-y-2">
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-slate-500">Lab</dt>
                <dd className="mt-0.5 flex items-start gap-1.5 text-slate-300">
                  <IconTerminal size={12} className="mt-0.5 shrink-0 text-brand-300" /> {report.lab_title}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-slate-500">Course</dt>
                <dd className="mt-0.5 text-slate-300">{report.course_title || 'Independent lab'}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-slate-500">Evidence</dt>
                <dd className="mt-0.5 flex items-center gap-3 text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    <IconCheckCircle size={12} className="text-emerald-400" /> {completedSteps.length} steps
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <IconCamera size={12} className="text-brand-300" /> {screenshots.length} shots
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-wider text-slate-500">Created</dt>
                <dd className="mt-0.5 text-slate-400">{formatDate(report.created_at)}</dd>
              </div>
              {report.reviewed_at && (
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-slate-500">Reviewed</dt>
                  <dd className="mt-0.5 text-slate-400">{formatDateTime(report.reviewed_at)}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </Card>

      <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-night-900/60 p-1 sm:w-fit">
        <button
          type="button"
          onClick={() => setTab('edit')}
          className={`flex-1 rounded-lg px-4 py-1.5 text-xs font-medium transition sm:flex-none ${
            tab === 'edit' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <IconClipboard size={13} className="mr-1 inline" /> {editable ? 'Edit sections' : 'Sections'}
        </button>
        <button
          type="button"
          onClick={() => setTab('preview')}
          className={`flex-1 rounded-lg px-4 py-1.5 text-xs font-medium transition sm:flex-none ${
            tab === 'preview' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <IconFileText size={13} className="mr-1 inline" /> Preview
        </button>
      </div>

      {tab === 'preview' ? (
        <Card className="p-6 sm:p-8">
          <div className="mx-auto max-w-3xl">
            <Markdown>{content}</Markdown>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {sections.map((section, index) => (
            <Card key={section.stepId || index} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-display text-sm font-semibold text-white">
                  <span className="mr-1.5 font-mono text-xs text-brand-300">{String(index + 1).padStart(2, '0')}</span>
                  {section.title}
                </h2>
                <Badge tone="slate">Step {index + 1}</Badge>
              </div>
              {section.instruction && <p className="mt-1.5 text-xs leading-5 text-slate-500">{section.instruction}</p>}

              {section.command && (
                <pre className="mt-3 overflow-x-auto rounded-lg border border-white/5 bg-night-950/70 px-3 py-2 font-mono text-[11px] text-emerald-300">
                  $ {section.command}
                </pre>
              )}
              {section.output && (
                <details className="mt-2 rounded-lg border border-white/5 bg-night-950/40 px-3 py-2">
                  <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-slate-500">Captured output</summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-5 text-slate-400">
                    {section.output}
                  </pre>
                </details>
              )}

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor={`result-${index}`} className="label">
                    Result
                  </label>
                  {editable ? (
                    <Input
                      id={`result-${index}`}
                      value={section.result || ''}
                      onChange={(event) => updateSection(index, 'result', event.target.value)}
                      className="mt-1.5"
                      placeholder="What did this step prove?"
                    />
                  ) : (
                    <p className="mt-1 text-sm text-slate-300">{section.result || '—'}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor={`notes-${index}`} className="label">
                    Notes & observations
                  </label>
                  {editable ? (
                    <Textarea
                      id={`notes-${index}`}
                      rows={2}
                      value={section.notes || ''}
                      onChange={(event) => updateSection(index, 'notes', event.target.value)}
                      className="mt-1.5"
                      placeholder="Explain your reasoning, issues you hit, and how you resolved them."
                    />
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-300">{section.notes || '—'}</p>
                  )}
                </div>
              </div>

              {section.screenshots?.length > 0 && (
                <div className="mt-4">
                  <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                    <IconCamera size={11} /> Evidence
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {section.screenshots.map((shot, shotIndex) => (
                      <a
                        key={`${shot}-${shotIndex}`}
                        href={shot}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-20 w-28 overflow-hidden rounded-lg border border-white/10 transition hover:border-brand-400/40"
                      >
                        <img src={shot} alt={`Step ${index + 1} screenshot ${shotIndex + 1}`} className="h-full w-full object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          ))}
          {sections.length === 0 && (
            <Card className="p-6 text-center">
              <p className="text-sm text-slate-400">No verified steps were captured for this report yet.</p>
              <Button as={Link} to="/student/labs" size="sm" variant="secondary" className="mt-3">
                Go back to the lab
              </Button>
            </Card>
          )}
        </div>
      )}

      {screenshots.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold">All session screenshots</h2>
            <span className="text-[11px] text-slate-500">{screenshots.length} total</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {screenshots.map((shot) => (
              <a
                key={shot.id}
                href={shot.file_path}
                target="_blank"
                rel="noreferrer"
                className="group overflow-hidden rounded-lg border border-white/10 transition hover:border-brand-400/40"
              >
                <img src={shot.file_path} alt={shot.original_name || 'Screenshot'} className="h-20 w-full object-cover transition group-hover:scale-105" />
              </a>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
