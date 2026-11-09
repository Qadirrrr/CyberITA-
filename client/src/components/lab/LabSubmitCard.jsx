import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, ProgressBar, Textarea } from '../../components/ui';
import {
  IconCheckCircle,
  IconClock,
  IconFileText,
  IconPaperclip,
  IconServer,
  IconUpload,
  IconX,
  IconXCircle,
} from '../../components/icons';
import { LAB_SUBMISSION_STATUS } from '../../lib/constants';
import { formatDateTime } from '../../lib/format';

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Student-facing submission card.
 *
 * Once every required step is verified the student can upload the finished lab
 * (optional screenshot/PDF + a note). The server captures the evidence snapshot
 * at submit time; this card only mirrors what the API returns.
 */
export default function LabSubmitCard({
  submission,
  requirements,
  allRequiredCompleted,
  progressPercent = 0,
  serverName,
  onSubmit,
  submitting,
}) {
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (submission?.status === 'changes_requested') {
      setNote(submission.student_note || '');
    }
  }, [submission?.id, submission?.status]);

  const resetFile = () => {
    setFile(null);
    setFileError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const onPickFile = (event) => {
    const picked = event.target.files?.[0] || null;
    setFileError('');
    if (!picked) {
      setFile(null);
      return;
    }
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
    if (!allowed.includes(picked.type)) {
      setFileError('Attach a PNG, JPEG, WEBP screenshot or a PDF.');
      event.target.value = '';
      return;
    }
    if (picked.size > MAX_BYTES) {
      setFileError('The attachment must be 8 MB or smaller.');
      event.target.value = '';
      return;
    }
    setFile(picked);
  };

  const submit = async () => {
    const ok = await onSubmit?.({ note: note.trim(), file });
    if (ok === false) return;
    resetFile();
    setNote('');
  };

  const status = submission ? LAB_SUBMISSION_STATUS[submission.status] : null;
  const editable = !submission || submission.status === 'changes_requested';

  // Already submitted / approved: show status, feedback, and next steps.
  if (submission && !editable) {
    const approved = submission.status === 'approved';
    return (
      <Card className={`p-4 ${approved ? 'border-emerald-400/25 bg-emerald-400/[0.04]' : 'border-amber-400/25 bg-amber-400/[0.04]'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                approved ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-300'
              }`}
            >
              {approved ? <IconCheckCircle size={18} /> : <IconClock size={18} />}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-sm font-semibold ${approved ? 'text-emerald-200' : 'text-amber-200'}`}>
                  {approved ? 'Lab approved by your instructor' : 'Submitted, awaiting instructor review'}
                </p>
                {status && <Badge tone={status.tone}>{status.label}</Badge>}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Submitted {formatDateTime(submission.submitted_at)}
                {submission.attachment_name ? ` · with ${submission.attachment_name}` : ' · checklist evidence attached'}
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                A record of this submission is kept for the platform administrator.
              </p>
            </div>
          </div>
        </div>
        {submission.instructor_feedback && (
          <div className="mt-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Instructor feedback</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-slate-300">{submission.instructor_feedback}</p>
          </div>
        )}
        {submission.student_note && (
          <p className="mt-3 whitespace-pre-wrap text-[11px] text-slate-500">Your note: {submission.student_note}</p>
        )}
      </Card>
    );
  }

  // Changes requested: explain and allow resubmission of the same session.
  const changesRequested = submission?.status === 'changes_requested';

  return (
    <Card className={`p-4 ${changesRequested ? 'border-rose-400/25 bg-rose-400/[0.04]' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              changesRequested ? 'bg-rose-400/15 text-rose-300' : 'bg-brand-400/15 text-brand-300'
            }`}
          >
            {changesRequested ? <IconXCircle size={18} /> : <IconUpload size={18} />}
          </span>
          <div>
            <p className="text-sm font-semibold text-white">
              {changesRequested ? 'Your instructor requested changes' : 'Finish and upload this lab'}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              {changesRequested
                ? 'Address the feedback below, then resubmit the same session.'
                : 'Once all required steps are verified, upload your finished lab for instructor review.'}
            </p>
          </div>
        </div>
        {serverName && (
          <Badge tone="slate">
            <span className="inline-flex items-center gap-1">
              <IconServer size={11} /> {serverName}
            </span>
          </Badge>
        )}
      </div>

      {changesRequested && submission.instructor_feedback && (
        <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-rose-300/80">Instructor feedback</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-slate-200">{submission.instructor_feedback}</p>
        </div>
      )}

      {requirements && (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
            <IconFileText size={11} /> What to upload
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[11px] text-slate-400">{requirements}</p>
        </div>
      )}

      {!allRequiredCompleted && (
        <div className="mt-3">
          <p className="text-[11px] text-amber-300">Finish every required step to unlock submission.</p>
          <ProgressBar value={progressPercent} size="sm" tone="amber" className="mt-2" />
        </div>
      )}

      {allRequiredCompleted && (
        <div className="mt-3 space-y-3">
          <Textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional note for your instructor (what you did, anything they should check)"
            maxLength={4000}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="hidden"
                onChange={onPickFile}
              />
              <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
                <IconPaperclip size={14} /> {file ? 'Change file' : 'Attach screenshot / PDF'}
              </Button>
              {file && (
                <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-slate-400">
                  <span className="max-w-[180px] truncate">{file.name}</span>
                  <button type="button" onClick={resetFile} className="text-slate-500 hover:text-rose-300" aria-label="Remove file">
                    <IconX size={12} />
                  </button>
                </span>
              )}
            </div>
            <Button size="sm" onClick={submit} loading={submitting} disabled={submitting}>
              <IconCheckCircle size={14} /> {changesRequested ? 'Resubmit lab' : 'Submit lab'}
            </Button>
          </div>
          {fileError && <p className="text-[11px] text-rose-300">{fileError}</p>}
          <p className="text-[10px] text-slate-500">
            Your checklist progress, commands, screenshots and the lab server are captured automatically when you submit.
            Your instructor reviews it and the administrator keeps a read-only record.
          </p>
        </div>
      )}
    </Card>
  );
}
