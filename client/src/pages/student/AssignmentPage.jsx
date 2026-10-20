import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import Markdown from '../../components/Markdown';
import { Alert, Badge, Button, Card, Skeleton, Textarea } from '../../components/ui';
import { IconArrowLeft, IconCheckCircle, IconClock, IconFileText, IconSend } from '../../components/icons';
import { formatDateTime } from '../../lib/format';
import { SUBMISSION_STATUS } from '../../lib/constants';

export default function AssignmentPage() {
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    api
      .get(`/assignments/${id}`)
      .then((res) => {
        setData(res.data);
        setContent(res.data.submission?.content || '');
      })
      .catch((err) => setError(getErrorMessage(err, 'Unable to load this assignment.')))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [id]);

  const submit = async (event) => {
    event.preventDefault();
    if (!content.trim()) {
      toast.error('Write your answer before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const { data: response } = await api.post(`/assignments/${id}/submit`, { content });
      setData((current) => ({ ...current, submission: response.submission }));
      toast.success('Assignment submitted. Your instructor will review it.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not submit your assignment.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (error || !data?.assignment) {
    return (
      <div>
        <Alert tone="error" title="Assignment unavailable">
          {error || 'This assignment could not be found.'}
        </Alert>
        <Button as={Link} to="/student/courses" variant="secondary" className="mt-4">
          Back to my courses
        </Button>
      </div>
    );
  }

  const { assignment, submission } = data;
  const status = submission ? SUBMISSION_STATUS[submission.status] : null;
  const href = assignment.course_slug ? `/learn/${assignment.course_slug}` : '/student/courses';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link to={href} className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-brand-300">
          <IconArrowLeft size={13} /> Back to course
        </Link>
        <Badge tone="amber">
          <IconFileText size={12} /> Assignment
        </Badge>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">{assignment.course_title}</p>
            <h1 className="mt-1 font-display text-2xl font-semibold">{assignment.title}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="slate">{assignment.points} points</Badge>
            {assignment.due_at && (
              <Badge tone={new Date(assignment.due_at) < new Date() ? 'rose' : 'brand'}>
                <IconClock size={11} /> Due {formatDateTime(assignment.due_at)}
              </Badge>
            )}
            {status && <Badge tone={status.tone}>{status.label}</Badge>}
          </div>
        </div>
        <div className="mt-5 border-t border-white/10 pt-5">
          <Markdown>{assignment.description || 'Your instructor has not added a description yet.'}</Markdown>
        </div>
      </Card>

      {submission?.status === 'graded' && (
        <Card className="border-emerald-400/25 bg-emerald-400/[0.04] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-200">
              <IconCheckCircle size={17} /> Graded
            </div>
            <p className="font-display text-xl font-semibold text-white">
              {submission.grade}
              <span className="text-sm font-normal text-slate-500">/{assignment.points}</span>
            </p>
          </div>
          {submission.feedback && (
            <div className="mt-3 rounded-lg border border-white/10 bg-night-950/40 p-3 text-sm leading-6 text-slate-300">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Feedback</span>
              <p className="mt-1 whitespace-pre-wrap">{submission.feedback}</p>
            </div>
          )}
          <p className="mt-2 text-[11px] text-slate-500">Graded {formatDateTime(submission.graded_at)}</p>
        </Card>
      )}

      {submission?.status === 'returned' && (
        <Card className="border-rose-400/25 bg-rose-400/[0.04] p-5">
          <p className="text-sm font-semibold text-rose-200">Returned for changes</p>
          {submission.feedback && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{submission.feedback}</p>
          )}
          <p className="mt-2 text-[11px] text-slate-500">Revise your work below and resubmit.</p>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">{submission ? 'Your submission' : 'Submit your work'}</h2>
          {submission?.submitted_at && (
            <span className="text-[11px] text-slate-500">Last submitted {formatDateTime(submission.submitted_at)}</span>
          )}
        </div>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <Textarea
            rows={10}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Write your answer, include commands you ran and explain your reasoning…"
            className="font-mono text-[13px]"
            hint="Markdown is supported. Include exact commands and outputs where relevant."
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500">
              You can resubmit until the assignment is graded. Resubmitting resets the grade.
            </p>
            <Button type="submit" loading={submitting}>
              <IconSend size={15} /> {submission ? 'Resubmit' : 'Submit assignment'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
