import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Alert, Badge, Button, Card, EmptyState, ProgressBar, Skeleton, Tabs } from '../../components/ui';
import { IconArrowRight, IconCamera, IconCheckCircle, IconClock, IconRefresh, IconSearch, IconSend, IconTerminal, IconTrash, IconUpload, IconXCircle } from '../../components/icons';
import { LAB_SUBMISSION_STATUS } from '../../lib/constants';
import { formatDateTime, timeAgo } from '../../lib/format';
import { useConfirm } from '../../components/ConfirmDialog';

function assignmentState(item) {
  if (!item.submission_id || item.submission_status === 'changes_requested') return 'pending';
  if (item.submission_status === 'approved') return 'approved';
  return 'submitted';
}

export default function LabAssignmentsPage() {
  const [confirmNode, askConfirm] = useConfirm();
  const [assignments, setAssignments] = useState([]);
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploadFor, setUploadFor] = useState(null);
  const [panel, setPanel] = useState({ loading: false, shots: [], error: '', uploading: false, submitting: false, note: '' });
  const fileRef = useRef(null);

  const loadAssignments = () => api.get('/me/lab-assignments')
    .then(({ data }) => setAssignments(data.labAssignments || []))
    .catch((err) => setError(getErrorMessage(err, 'Unable to load lab assignments.')));

  useEffect(() => {
    let active = true;
    loadAssignments().finally(() => active && setLoading(false));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleUpload = async (item) => {
    if (uploadFor === item.id) {
      setUploadFor(null);
      return;
    }
    setUploadFor(item.id);
    setPanel({ loading: Boolean(item.session_id), shots: [], error: '', uploading: false, submitting: false, note: '' });
    if (!item.session_id) return;
    try {
      const { data } = await api.get(`/labs/sessions/${item.session_id}`);
      setPanel((current) => ({ ...current, loading: false, shots: data.screenshots || [] }));
    } catch (err) {
      setPanel((current) => ({ ...current, loading: false, error: getErrorMessage(err, 'Could not load your screenshots.') }));
    }
  };

  const uploadFiles = async (item, files) => {
    const images = Array.from(files || []).filter((file) => file.type.startsWith('image/'));
    if (!images.length || !item.session_id) return;
    setPanel((current) => ({ ...current, uploading: true, error: '' }));
    try {
      for (const file of images) {
        const form = new FormData();
        form.append('file', file);
        form.append('note', 'Uploaded from Lab assignments');
        const { data } = await api.post(`/labs/sessions/${item.session_id}/screenshots`, form);
        if (data.screenshot) {
          setPanel((current) => ({ ...current, shots: [...current.shots, data.screenshot] }));
        }
      }
    } catch (err) {
      setPanel((current) => ({ ...current, error: getErrorMessage(err, 'A screenshot could not be uploaded.') }));
    } finally {
      setPanel((current) => ({ ...current, uploading: false }));
    }
  };

  const removeShot = async (shotId) => {
    if (!(await askConfirm({ title: 'Remove screenshot?', message: 'Remove this screenshot from your evidence?', confirmLabel: 'Remove screenshot', danger: true }))) return;
    try {
      await api.delete(`/labs/screenshots/${shotId}`);
      setPanel((current) => ({ ...current, shots: current.shots.filter((shot) => shot.id !== shotId) }));
    } catch (err) {
      setPanel((current) => ({ ...current, error: getErrorMessage(err, 'Could not remove that screenshot.') }));
    }
  };

  const submitFromPanel = async (item) => {
    if (!item.session_id) return;
    const minEvidence = Math.max(1, item.min_evidence || 1);
    const shortfall = Math.max(0, minEvidence - panel.shots.length);
    if (!(await askConfirm({ title: 'Submit lab for review?', message: `Submit this lab with ${panel.shots.length} screenshot evidence file${panel.shots.length === 1 ? '' : 's'} for instructor review?${shortfall > 0 ? ` That is ${shortfall} short of the required ${minEvidence}, so your instructor will see a partial submission.` : ''}`, confirmLabel: 'Submit lab' }))) return;
    setPanel((current) => ({ ...current, submitting: true, error: '' }));
    try {
      const form = new FormData();
      form.append('note', panel.note.trim() || 'Submitted from Lab assignments with screenshot evidence.');
      await api.post(`/labs/sessions/${item.session_id}/submit`, form);
      setUploadFor(null);
      setNotice(`"${item.title}" was submitted for instructor review.`);
      await loadAssignments();
    } catch (err) {
      setPanel((current) => ({ ...current, submitting: false, error: getErrorMessage(err, 'Could not submit this assignment.') }));
    }
  };

  const counts = useMemo(() => ({
    all: assignments.length,
    pending: assignments.filter((item) => assignmentState(item) === 'pending').length,
    submitted: assignments.filter((item) => assignmentState(item) === 'submitted').length,
    approved: assignments.filter((item) => assignmentState(item) === 'approved').length,
    overdue: assignments.filter((item) => item.is_overdue).length,
  }), [assignments]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assignments.filter((item) => {
      const state = assignmentState(item);
      if (tab !== 'all' && state !== tab) return false;
      return !term || `${item.title} ${item.course_title || ''} ${item.summary || ''}`.toLowerCase().includes(term);
    });
  }, [assignments, search, tab]);

  return (
    <div className="space-y-6">
      {confirmNode}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Lab assignments</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">Complete the verified lab steps, submit your evidence, and track instructor review here.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge tone={counts.pending ? 'amber' : 'emerald'}><IconTerminal size={12} /> {counts.pending} to complete</Badge>
          {counts.overdue > 0 && <Badge tone="rose">{counts.overdue} overdue</Badge>}
        </div>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {notice && <Alert tone="success">{notice}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'pending', label: 'To complete', count: counts.pending },
            { id: 'submitted', label: 'Submitted', count: counts.submitted },
            { id: 'approved', label: 'Approved', count: counts.approved },
            { id: 'all', label: 'All', count: counts.all },
          ]}
        />
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lab assignments…" className="input pl-9" aria-label="Search lab assignments" />
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((item) => <Skeleton key={item} className="h-32 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={IconTerminal}
          title={assignments.length ? 'Nothing in this list' : 'No lab assignments yet'}
          message={assignments.length ? 'Try another filter.' : 'Published course labs with a deadline will appear here.'}
          action={<Button as={Link} to="/student/labs" variant="secondary">Browse labs <IconArrowRight size={14} /></Button>}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const state = assignmentState(item);
            const status = item.submission_status ? LAB_SUBMISSION_STATUS[item.submission_status] : null;
            return (
              <Card key={item.id} className="p-4 transition hover:border-white/20 sm:p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${item.is_overdue ? 'bg-rose-400/10 text-rose-300' : state === 'approved' ? 'bg-emerald-400/10 text-emerald-300' : 'bg-brand-400/10 text-brand-300'}`}>
                    {state === 'approved' ? <IconCheckCircle size={19} /> : item.is_overdue ? <IconXCircle size={19} /> : <IconTerminal size={19} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="slate">{item.course_title}</Badge>
                      {item.lab_mode === 'real' ? (
                        <Badge tone="rose">Real lab · {item.min_evidence || 1}+ screenshots</Badge>
                      ) : (
                        <Badge tone="slate">{item.step_count} verified steps</Badge>
                      )}
                      {item.due_at ? <Badge tone={item.is_overdue ? 'rose' : 'brand'}><IconClock size={11} /> {item.is_overdue ? 'Overdue' : 'Due'} {formatDateTime(item.due_at)}</Badge> : <Badge tone="slate">No deadline</Badge>}
                      {Number(item.time_limit_minutes) > 0 && (
                        <Badge tone="brand"><IconClock size={11} /> {item.time_limit_minutes} min limit</Badge>
                      )}
                      {status && <Badge tone={status.tone}>{status.label}</Badge>}
                    </div>
                    <Link to={`/labs/${item.id}`} className="mt-2 block truncate font-display text-base font-semibold text-white hover:text-brand-200">{item.title}</Link>
                    {item.summary && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.summary}</p>}
                    {(item.is_completed || item.progress_percent > 0) && (
                      <div className="mt-3 flex max-w-sm items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <ProgressBar
                            value={item.is_completed ? 100 : item.progress_percent}
                            tone={item.is_completed ? 'emerald' : 'brand'}
                            size="sm"
                          />
                        </div>
                        <span className={`shrink-0 font-mono text-[11px] font-semibold ${item.is_completed ? 'text-emerald-300' : 'text-slate-400'}`}>
                          {item.is_completed ? 'Completed' : `${Math.round(item.progress_percent)}%`}
                        </span>
                      </div>
                    )}
                    {item.submission_status === 'changes_requested' && item.instructor_feedback && <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-rose-400/20 bg-rose-400/[0.05] px-2.5 py-2 text-[11px] leading-5 text-rose-200"><IconRefresh size={12} className="mt-0.5 shrink-0" />Changes requested: {item.instructor_feedback}</p>}
                    {item.submission_status === 'changes_requested' && <p className="mt-1.5 text-[11px] leading-5 text-slate-400">To fix it: start the lab again and redo the work in the new session, or add more screenshots below, then resubmit. Your new submission replaces the previous one.</p>}
                    {item.submitted_at && <p className="mt-2 text-[11px] text-slate-500">Submitted {timeAgo(item.submitted_at)}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {item.lab_mode === 'real' && state === 'pending' && (
                      <Button size="sm" variant="secondary" onClick={() => toggleUpload(item)} className="gap-1.5">
                        <IconUpload size={13} /> {uploadFor === item.id ? 'Close upload' : 'Upload evidence'}
                      </Button>
                    )}
                    <Button as={Link} to={`/labs/${item.id}`} size="sm" variant={state === 'pending' ? 'primary' : 'secondary'}>
                      {state === 'pending' ? (item.submission_id ? 'Revise lab' : 'Start lab') : 'View lab'} <IconArrowRight size={13} />
                    </Button>
                  </div>
                </div>

                {uploadFor === item.id && item.lab_mode === 'real' && (() => {
                  const minEvidence = Math.max(1, item.min_evidence || 1);
                  const remaining = Math.max(0, minEvidence - panel.shots.length);
                  return (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-night-900/40">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          <IconCamera size={12} /> Upload evidence
                        </p>
                        <Badge tone={panel.shots.length >= minEvidence ? 'emerald' : 'amber'}>
                          {panel.shots.length}/{minEvidence} screenshots
                        </Badge>
                      </div>

                      {!item.session_id ? (
                        <div className="mt-3">
                          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                            You have not started this lab yet. Start it once so your workspace is created. After
                            that you can upload your screenshots here, even after the session ends, and submit them
                            for review.
                          </p>
                          <Button as={Link} to={`/labs/${item.id}`} size="sm" className="mt-3 gap-1.5">
                            Start lab <IconArrowRight size={13} />
                          </Button>
                        </div>
                      ) : panel.loading ? (
                        <p className="mt-3 text-sm text-slate-500">Loading your screenshots…</p>
                      ) : (
                        <>
                          {item.session_status === 'running' && (
                            <p className="mt-3 text-[11px] leading-5 text-slate-500">
                              Your latest session is still running. Uploads attach to it, and submitting will end it.
                            </p>
                          )}
                          {panel.shots.length > 0 && (
                            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                              {panel.shots.map((shot, index) => (
                                <div key={shot.id} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-night-950">
                                  <a href={shot.file_path} target="_blank" rel="noreferrer" title={shot.original_name || `Screenshot ${index + 1}`}>
                                    <img src={shot.file_path} alt={shot.original_name || `Screenshot ${index + 1}`} className="h-16 w-full object-cover" />
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => removeShot(shot.id)}
                                    className="absolute right-1 top-1 rounded-md bg-slate-950/80 p-1 text-slate-300 opacity-0 transition hover:text-rose-300 group-hover:opacity-100"
                                    aria-label="Remove screenshot"
                                  >
                                    <IconTrash size={11} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <input
                            ref={fileRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            multiple
                            className="hidden"
                            onChange={(event) => {
                              uploadFiles(item, event.target.files);
                              event.target.value = '';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            disabled={panel.uploading}
                            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white py-2.5 text-xs font-medium text-slate-600 transition hover:border-cyan-400 hover:bg-cyan-50 hover:text-cyan-800 disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:border-brand-400/50 dark:hover:bg-brand-400/[0.06] dark:hover:text-brand-300"
                          >
                            <IconUpload size={13} /> {panel.uploading ? 'Uploading…' : 'Add screenshots (PNG, JPG or WEBP)'}
                          </button>
                          <input
                            value={panel.note}
                            onChange={(event) => setPanel((current) => ({ ...current, note: event.target.value }))}
                            placeholder="Note for your instructor (optional)"
                            className="input mt-3"
                            maxLength={500}
                          />
                          {panel.error && <p className="mt-2 text-xs leading-5 text-rose-500 dark:text-rose-300">{panel.error}</p>}
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-[11px] leading-5 text-slate-500">
                              {remaining > 0
                                ? `You can submit now with ${panel.shots.length} screenshot${panel.shots.length === 1 ? '' : 's'}, or attach ${remaining} more to reach the required ${minEvidence}.`
                                : 'Your evidence is complete. Submit it to your instructor for review.'}
                            </p>
                            <Button size="sm" onClick={() => submitFromPanel(item)} loading={panel.submitting} className="gap-1.5">
                              <IconSend size={13} /> {item.submission_status === 'changes_requested' ? 'Resubmit for review' : 'Submit for review'}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
