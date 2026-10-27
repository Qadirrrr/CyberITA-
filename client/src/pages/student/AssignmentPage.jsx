import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import Markdown from '../../components/Markdown';
import { Alert, Badge, Button, Card, Skeleton, Textarea } from '../../components/ui';
import {
  IconArrowLeft,
  IconCheckCircle,
  IconClock,
  IconDownload,
  IconExternalLink,
  IconFileText,
  IconSend,
  IconTrash,
  IconUpload,
} from '../../components/icons';
import { formatDateTime } from '../../lib/format';
import { SUBMISSION_STATUS } from '../../lib/constants';

const ALLOWED_EXTS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx', '.txt'];

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function AssignmentPage() {
  const { id } = useParams();
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [data, setData] = useState(null);
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
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

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;
    const ext = `.${selectedFile.name.split('.').pop().toLowerCase()}`;
    if (!ALLOWED_EXTS.includes(ext)) {
      toast.error('Unsupported file format. Please upload a PDF, image (PNG, JPG, WEBP), or Word document.');
      return;
    }
    if (selectedFile.size > 25 * 1024 * 1024) {
      toast.error('File size exceeds the 25 MB limit.');
      return;
    }

    setFile(selectedFile);
    if (selectedFile.type.startsWith('image/')) {
      const url = URL.createObjectURL(selectedFile);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  const removeSelectedFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = async (event) => {
    event.preventDefault();
    const hasText = Boolean(content.trim());
    const hasNewFile = Boolean(file);
    const hasExistingFile = Boolean(data?.submission?.file_path);

    if (!hasText && !hasNewFile && !hasExistingFile) {
      toast.error('Please write an answer or upload your handwritten assignment file.');
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('content', content);
      if (file) {
        formData.append('file', file);
      }

      const { data: response } = await api.post(`/assignments/${id}/submit`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setData((current) => ({ ...current, submission: response.submission }));
      removeSelectedFile();
      toast.success('Assignment submitted successfully with your work.');
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

  const isImageFile = (path) => {
    if (!path) return false;
    const lower = path.toLowerCase();
    return lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp');
  };

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
          <p className="mt-2 text-[11px] text-slate-500">Revise your work or upload an updated file below and resubmit.</p>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold">{submission ? 'Your submission' : 'Submit your work'}</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              You can submit handwritten work via file upload (scan/photo/PDF), typed text, or both.
            </p>
          </div>
          {submission?.submitted_at && (
            <span className="text-[11px] text-slate-500">Last submitted {formatDateTime(submission.submitted_at)}</span>
          )}
        </div>

        {/* Previous Uploaded File Indicator */}
        {submission?.file_path && (
          <div className="mt-4 rounded-xl border border-brand-400/25 bg-brand-400/[0.04] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-400/10 text-brand-300">
                  <IconFileText size={18} />
                </span>
                <div>
                  <p className="text-xs font-semibold text-white">Current Submitted File</p>
                  <p className="text-[11px] text-slate-400">Handwritten / document file already uploaded</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={submission.file_path}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand-400/30 bg-brand-400/10 px-3 py-1.5 text-xs font-medium text-brand-300 transition hover:bg-brand-400/20"
                >
                  <IconExternalLink size={13} /> View File
                </a>
                <a
                  href={submission.file_path}
                  download
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10"
                >
                  <IconDownload size={13} /> Download
                </a>
              </div>
            </div>

            {isImageFile(submission.file_path) && (
              <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-night-950/60 p-2">
                <img
                  src={submission.file_path}
                  alt="Submitted handwritten work"
                  className="max-h-64 w-auto rounded object-contain"
                />
              </div>
            )}
          </div>
        )}

        <form onSubmit={submit} className="mt-5 space-y-5">
          {/* ── HANDWRITTEN / FILE UPLOAD SECTION ── */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Upload Handwritten Work / Document
            </label>
            <p className="text-[11px] text-slate-500">
              If your assignment is handwritten, upload photos of your notebook, scanned PDF, or document (PNG, JPG, WEBP, PDF, DOCX up to 25MB).
            </p>

            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.txt"
              className="hidden"
              onChange={(e) => handleFileSelect(e.target.files?.[0])}
            />

            {!file ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  handleFileSelect(e.dataTransfer.files?.[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
                  isDragging
                    ? 'border-brand-400 bg-brand-400/10'
                    : 'border-white/15 bg-white/[0.02] hover:border-brand-400/50 hover:bg-white/[0.04]'
                }`}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-400/10 text-brand-300 transition group-hover:scale-110">
                  <IconUpload size={22} />
                </span>
                <p className="mt-3 text-sm font-medium text-slate-200">
                  Click to upload or drag & drop your handwritten file
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  PDF, Photos (JPG, PNG), or Word Docs · Max 25 MB
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-brand-400/30 bg-brand-400/[0.06] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-400/20 text-brand-300">
                      <IconFileText size={20} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{file.name}</p>
                      <p className="text-[11px] text-slate-400">{formatBytes(file.size)} · Ready to upload</p>
                    </div>
                  </div>
                  <Button type="button" size="sm" variant="ghost" onClick={removeSelectedFile} aria-label="Remove selected file">
                    <IconTrash size={15} className="text-rose-400" />
                  </Button>
                </div>

                {previewUrl && (
                  <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-night-950/60 p-2">
                    <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">Image Preview</p>
                    <img src={previewUrl} alt="Preview" className="max-h-48 w-auto rounded object-contain" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── WRITTEN ANSWER / NOTES TEXTAREA ── */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
              Written Answer & Notes {file || submission?.file_path ? '(Optional)' : ''}
            </label>
            <Textarea
              rows={7}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Type your answer, explanations, steps performed, or any notes accompanying your upload…"
              className="font-mono text-[13px]"
              hint="Markdown supported. You can submit typed answers, attach a handwritten file, or both."
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
            <p className="text-[11px] text-slate-500">
              You can resubmit until graded. Resubmitting updates your file and answer.
            </p>
            <Button type="submit" loading={submitting}>
              <IconSend size={15} /> {submission ? 'Resubmit Assignment' : 'Submit Assignment'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
