import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, Textarea } from '../../components/ui';
import Markdown from '../Markdown';
import {
  IconCheckCircle,
  IconDownload,
  IconExternalLink,
  IconFileText,
  IconServer,
  IconTerminal,
  IconXCircle,
} from '../../components/icons';
import { LAB_SUBMISSION_STATUS } from '../../lib/constants';
import { formatDateTime } from '../../lib/format';

/**
 * Full evidence view for a lab submission.
 *
 * Shared by the instructor review queue and the admin record so both always
 * show exactly what the student submitted (a snapshot captured by the server
 * at submit time, not editable afterwards).
 */
export default function LabSubmissionDetail({
  submission,
  canReview = false,
  onReview,
  reviewing = false,
  adminMode = false,
  onAcknowledge,
  acknowledging = false,
}) {
  const [feedback, setFeedback] = useState('');
  const [action, setAction] = useState('');

  if (!submission) return null;

  const status = LAB_SUBMISSION_STATUS[submission.status] || { label: submission.status, tone: 'slate' };
  const evidence = submission.evidence || {};
  const steps = Array.isArray(evidence.steps) ? evidence.steps : [];
  const screenshots = Array.isArray(evidence.screenshots) ? evidence.screenshots : [];
  const server = evidence.lab_server;
  const progress = evidence.progress || {};
  const isRealLab = evidence.lab_mode === 'real' || evidence.lab_mode === 'vps';
  const minEvidence = Math.max(1, Number(evidence.min_evidence) || 1);

  const submitReview = (nextStatus) => {
    if (nextStatus === 'changes_requested' && !feedback.trim()) return;
    setAction(nextStatus);
    Promise.resolve(onReview?.(nextStatus, feedback.trim())).finally(() => {
      setAction('');
      if (nextStatus === 'approved') setFeedback('');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-semibold text-white">{submission.lab_title}</h3>
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge tone={evidence.lab_mode === 'vps' ? 'accent' : isRealLab ? 'rose' : 'sky'}>{evidence.lab_mode === 'vps' ? 'Real VPS lab' : isRealLab ? 'Real lab' : 'Guided practice'}</Badge>
            {adminMode && submission.admin_acknowledged && <Badge tone="brand">Acknowledged</Badge>}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {submission.student_name}
            {submission.student_email ? ` · ${submission.student_email}` : ''}
            {submission.course_title ? ` · ${submission.course_title}` : ' · Standalone lab'}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Submitted {formatDateTime(submission.submitted_at)}
            {submission.reviewed_at ? ` · Reviewed ${formatDateTime(submission.reviewed_at)}` : ''}
            {submission.instructor_name ? ` by ${submission.instructor_name}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button as={Link} to={`/labs/session/${submission.session_id}`} size="sm" variant="ghost" target="_blank">
            <IconExternalLink size={14} /> Open session
          </Button>
          {submission.has_attachment && (
            <a
              href={`/api/lab-submissions/${submission.id}/attachment`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
            >
              <IconDownload size={14} /> {submission.attachment_name || 'Attachment'}
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Lab server</p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-200">
            <IconServer size={14} className="text-brand-300" />
            {server?.name || 'Default host'}
          </p>
          {server?.location && <p className="mt-0.5 text-[11px] text-slate-500">{server.location}</p>}
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">
            {isRealLab ? 'Evidence required' : 'Required steps'}
          </p>
          <p className="mt-1 text-sm text-slate-200">
            {isRealLab
              ? `${screenshots.length}/${minEvidence} screenshot${minEvidence === 1 ? '' : 's'}`
              : `${progress.completed_required ?? 0}/${progress.required_total ?? steps.length} completed`}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Evidence</p>
          <p className="mt-1 text-sm text-slate-200">
            {isRealLab
              ? `${screenshots.length} screenshot${screenshots.length === 1 ? '' : 's'}`
              : `${steps.filter((step) => step.completed).length} steps · ${screenshots.length} screenshot${screenshots.length === 1 ? '' : 's'}`}
            {submission.attachment_name ? ' · 1 file' : ''}
          </p>
        </div>
      </div>

      {submission.student_note && (
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Student note</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{submission.student_note}</p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-white/10 px-4 py-3">
          <p className="flex items-center gap-2 text-xs font-medium text-slate-300">
            {isRealLab ? <IconFileText size={14} /> : <IconTerminal size={14} />}
            {isRealLab ? 'Task brief' : 'Checklist evidence'}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">
            {isRealLab
              ? 'The question the student answered. Review the screenshots below as the evidence.'
              : 'Captured automatically when the student submitted. Students cannot edit this afterwards.'}
          </p>
        </div>
        {isRealLab ? (
          <div className="px-4 py-4 text-xs leading-6 text-slate-300">
            {evidence.task_brief ? (
              <div className="markdown max-w-none">
                <Markdown>{evidence.task_brief}</Markdown>
              </div>
            ) : (
              <p className="text-slate-500">No task brief was captured.</p>
            )}
          </div>
        ) : steps.length === 0 ? (
          <p className="px-4 py-4 text-xs text-slate-500">This lab has no checklist steps.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {steps.map((step, index) => (
              <li key={`${step.title}-${index}`} className="flex items-start gap-3 px-4 py-3">
                {step.completed ? (
                  <IconCheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-300" />
                ) : (
                  <IconXCircle size={16} className="mt-0.5 shrink-0 text-slate-600" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-200">
                    {index + 1}. {step.title}
                    {step.is_optional && <span className="ml-2 text-[10px] font-normal text-slate-500">optional</span>}
                  </p>
                  {step.command_used && (
                    <p className="mt-1 rounded-md bg-black/30 px-2 py-1 font-mono text-[11px] text-emerald-200/90 break-all">
                      {step.command_used}
                    </p>
                  )}
                  {step.output_excerpt && (
                    <p className="mt-1 whitespace-pre-wrap font-mono text-[10px] text-slate-500 line-clamp-4">
                      {step.output_excerpt}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {screenshots.length > 0 && (
        <Card className="p-4">
          <p className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <IconFileText size={14} /> Screenshots
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {screenshots.map((shot) => (
              <a
                key={shot.id}
                href={shot.url || '#'}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-300 transition hover:bg-white/10"
              >
                {shot.name || `Screenshot #${shot.id}`}
              </a>
            ))}
          </div>
        </Card>
      )}

      {submission.instructor_feedback && !canReview && (
        <Card className={`p-4 ${submission.status === 'approved' ? 'border-emerald-400/20' : 'border-rose-400/20'}`}>
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Instructor feedback</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{submission.instructor_feedback}</p>
        </Card>
      )}

      {canReview && (
        <Card className="p-4">
          <p className="text-xs font-medium text-slate-300">Review this submission</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Approve to close the submission, or request changes so the student can resubmit the same session.
          </p>
          <Textarea
            className="mt-3"
            rows={3}
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            placeholder="Feedback for the student (required when requesting changes)"
            maxLength={5000}
          />
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-300 hover:text-rose-200"
              onClick={() => submitReview('changes_requested')}
              loading={reviewing || action === 'changes_requested'}
              disabled={!feedback.trim() || reviewing}
            >
              <IconXCircle size={14} /> Request changes
            </Button>
            <Button
              size="sm"
              onClick={() => submitReview('approved')}
              loading={reviewing || action === 'approved'}
              disabled={reviewing}
            >
              <IconCheckCircle size={14} /> Approve
            </Button>
          </div>
        </Card>
      )}

      {adminMode && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-xs font-medium text-slate-300">Admin record</p>
            <p className="mt-1 text-[11px] text-slate-500">
              {submission.admin_acknowledged
                ? `Acknowledged ${formatDateTime(submission.admin_acknowledged_at)}`
                : 'Acknowledge this submission to confirm the platform record was reviewed.'}
            </p>
          </div>
          <Button
            size="sm"
            variant={submission.admin_acknowledged ? 'ghost' : 'secondary'}
            onClick={onAcknowledge}
            loading={acknowledging}
            disabled={submission.admin_acknowledged || acknowledging}
          >
            <IconCheckCircle size={14} /> {submission.admin_acknowledged ? 'Acknowledged' : 'Acknowledge'}
          </Button>
        </Card>
      )}
    </div>
  );
}
