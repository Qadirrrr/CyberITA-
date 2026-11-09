import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
} from '../../components/ui';
import {
  IconArrowRight,
  IconPlay,
  IconPlus,
  IconSearch,
  IconTerminal,
  IconTrash,
  IconZap,
} from '../../components/icons';
import { DIFFICULTIES, LAB_MODES } from '../../lib/constants';
import { useConfirm } from '../../components/ConfirmDialog';

const statusTone = { published: 'emerald', draft: 'amber' };

export default function ManageLabsPage() {
  const [confirmNode, askConfirm] = useConfirm();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [labs, setLabs] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [practiceOnly, setPracticeOnly] = useState(false);
  const [modeFilter, setModeFilter] = useState('all');
  const [autoModal, setAutoModal] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get('/labs', { params: { limit: 60 } }), api.get('/courses', { params: { all: true, limit: 60 } })])
      .then(([labsResponse, coursesResponse]) => {
        if (cancelled) return;
        setLabs(labsResponse.data.labs || []);
        const list = coursesResponse.data.courses || [];
        setCourses(user?.role === 'admin' ? list : list.filter((course) => course.instructor_id === user?.id));
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load labs.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const removeLab = async (lab) => {
    if (!(await askConfirm({ title: 'Delete lab?', message: `Delete lab "${lab.title}" permanently? Its steps, sessions, student progress, screenshots and submissions will be removed too. This cannot be undone.`, confirmLabel: 'Delete lab', danger: true }))) return;
    setDeletingId(lab.id);
    try {
      await api.delete(`/labs/${lab.id}`);
      setLabs((prev) => prev.filter((item) => item.id !== lab.id));
      toast.success(`Lab "${lab.title}" deleted.`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete the lab.'));
    } finally {
      setDeletingId(null);
    }
  };

  const courseIds = useMemo(() => new Set(courses.map((course) => course.id)), [courses]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return labs.filter((lab) => {
      if (user?.role !== 'admin' && ((lab.course_id && !courseIds.has(lab.course_id)) || (!lab.course_id && lab.created_by && lab.created_by !== user?.id))) return false;
      if (status !== 'all' && lab.status !== status) return false;
      if (modeFilter !== 'all' && (lab.lab_mode || 'practice') !== modeFilter) return false;
      if (practiceOnly && !lab.is_practice) return false;
      if (!term) return true;
      return `${lab.title} ${lab.summary} ${lab.course_title || ''}`.toLowerCase().includes(term);
    });
  }, [labs, status, search, practiceOnly, modeFilter, user?.role, user?.id, courseIds]);

  const createLab = async (event) => {
    event.preventDefault();
    const isReal = modal.labMode === 'real';
    if (isReal && modal.taskBrief.trim().length < 10) {
      toast.error('Write the task brief (the question learners must solve) first.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/labs', {
        title: modal.title,
        summary: modal.summary,
        description: modal.description,
        difficulty: modal.difficulty,
        estimatedMinutes: Number(modal.estimatedMinutes) || 30,
        timeLimitMinutes: Math.max(0, Number(modal.timeLimitMinutes) || 0),
        courseId: modal.courseId ? Number(modal.courseId) : null,
        status: modal.status,
        labMode: modal.labMode,
        taskBrief: isReal ? modal.taskBrief : '',
        minEvidence: isReal ? Math.max(1, Number(modal.minEvidence) || 1) : 1,
        isPractice: isReal ? false : Boolean(modal.isPractice),
        dueAt: (!isReal && modal.isPractice) || !modal.dueAt ? null : new Date(modal.dueAt).toISOString(),
      });
      toast.success(
        isReal
          ? 'Real lab created. Review the task brief and publish it when ready.'
          : 'Lab created. Add its steps now.'
      );
      navigate(`/instructor/labs/${data.lab.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not create the lab.'));
    } finally {
      setSaving(false);
    }
  };

  const openAutoGenerate = () => {
    setAutoModal({
      title: '',
      details: '',
      difficulty: 'beginner',
      stepCount: 8,
      timeLimitMinutes: 0,
      labMode: 'practice',
      minEvidence: 1,
      labPractice: false,
      courseId: courses[0]?.id || '',
      status: 'draft',
    });
  };

  const runAutoGenerate = async (event) => {
    event.preventDefault();
    const isReal = autoModal.labMode === 'real';
    if (!autoModal.title.trim()) {
      toast.error('Give the lab a title.');
      return;
    }
    if (isReal && autoModal.details.trim().length < 10) {
      toast.error('Describe the task learners must solve (the question).');
      return;
    }
    if (!isReal && !autoModal.labPractice && !autoModal.courseId) {
      toast.error('Choose a course or mark the lab as open to all learners.');
      return;
    }
    setGenerating(true);
    try {
      const { data } = await api.post(
        '/labs/generate',
        {
          title: autoModal.title.trim(),
          details: autoModal.details.trim(),
          difficulty: autoModal.difficulty,
          stepCount: Math.max(3, Number(autoModal.stepCount) || 8),
          timeLimitMinutes: Math.max(0, Number(autoModal.timeLimitMinutes) || 0),
          labMode: autoModal.labMode,
          minEvidence: Math.max(1, Number(autoModal.minEvidence) || 1),
          isPractice: isReal ? false : Boolean(autoModal.labPractice),
          courseId: autoModal.labPractice && !isReal ? null : Number(autoModal.courseId) || null,
          status: autoModal.status,
          autoSave: true,
        },
        { timeout: 120000 }
      );
      toast.success(
        isReal
          ? 'Real lab generated with a task brief. Review it and publish when ready.'
          : `Lab generated with ${data.steps?.length || 0} verified steps. Review the steps and publish.`
      );
      navigate(`/instructor/labs/${data.lab.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not generate the lab.'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      {confirmNode}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {user?.role === 'admin' ? 'All labs' : 'Lab builder'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Build guided labs with steps and automatic verification, or question-only real labs reviewed from screenshot evidence.
          </p>
        </div>
        {user?.role === 'instructor' && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={openAutoGenerate}
            className="border-brand-400/30 bg-brand-400/10 text-brand-300 hover:bg-brand-400/20"
          >
            <IconZap size={14} /> Auto-generate lab
          </Button>
          <Button
            size="sm"
            onClick={() =>
              setModal({
                title: '', summary: '', description: '', difficulty: 'beginner', estimatedMinutes: 30,
                timeLimitMinutes: 0,
                dueAt: '', courseId: '', status: 'draft', isPractice: false,
                labMode: 'practice', taskBrief: '', minEvidence: 1,
              })
            }
          >
            <IconPlus size={14} /> New lab
          </Button>
        </div>
        )}
      </div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search labs…" className="input pl-9" aria-label="Search labs" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['all', 'draft', 'published'].map((item) => (
            <button key={item} type="button" onClick={() => setStatus(item)} className={`chip capitalize ${status === item ? 'chip-active' : ''}`}>
              {item}
            </button>
          ))}
          {['all', 'practice', 'real'].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setModeFilter(item)}
              className={`chip ${modeFilter === item ? 'chip-active' : ''}`}
            >
              {item === 'all' ? 'All modes' : LAB_MODES[item]?.short || item}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPracticeOnly((value) => !value)}
            className={`chip ${practiceOnly ? 'chip-active' : ''}`}
          >
            Open to all
          </button>
        </div>
      </Card>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={IconTerminal}
          title="No labs found"
          message="Create a lab, then add steps with expected commands or output patterns."
          action={
            user?.role === 'instructor' ? (
            <Button
              size="sm"
              onClick={() =>
                setModal({
                  title: '', summary: '', description: '', difficulty: 'beginner', estimatedMinutes: 30,
                  timeLimitMinutes: 0,
                  dueAt: '', courseId: '', status: 'draft', isPractice: false,
                  labMode: 'practice', taskBrief: '', minEvidence: 1,
                })
              }
            >
              <IconPlus size={13} /> New lab
            </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((lab) => (
            <Card key={lab.id} className="flex flex-wrap items-center gap-4 p-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-400/20 bg-brand-400/10 text-brand-300">
                <IconTerminal size={19} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/instructor/labs/${lab.id}`} className="text-sm font-semibold text-slate-900 hover:text-brand-600 dark:text-white dark:hover:text-brand-200">
                    {lab.title}
                  </Link>
                  <Badge tone={statusTone[lab.status]}>{lab.status}</Badge>
                  <Badge tone={LAB_MODES[lab.lab_mode]?.tone || 'sky'}>
                    {LAB_MODES[lab.lab_mode]?.short || 'Guided'}
                  </Badge>
                  {lab.is_practice && <Badge tone="emerald">open to all</Badge>}
                  <Badge tone={DIFFICULTIES[lab.difficulty]?.tone || 'slate'}>{DIFFICULTIES[lab.difficulty]?.label || lab.difficulty}</Badge>
                </div>
                <p className="mt-1 line-clamp-1 text-[11px] text-slate-600 dark:text-slate-400">
                  {lab.lab_mode === 'real'
                    ? `Question-only · ${lab.min_evidence || 1}+ screenshot${(lab.min_evidence || 1) === 1 ? '' : 's'}`
                    : `${lab.is_practice ? 'Open to all learners' : lab.course_title || 'Standalone lab'} · ${lab.step_count} steps`}
                  {' · '}{lab.estimated_minutes} min
                  {lab.time_limit_minutes > 0 ? ` · ${lab.time_limit_minutes} min limit` : ''}
                </p>
                <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-500">
                  {lab.session_count} sessions started
                  {lab.last_started_at ? ` · last ${new Date(lab.last_started_at).toLocaleDateString()}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm" variant="ghost"
                  className="text-rose-500 hover:text-rose-400"
                  onClick={() => removeLab(lab)}
                  loading={deletingId === lab.id}
                  title="Delete lab permanently"
                  aria-label={`Delete ${lab.title}`}
                >
                  <IconTrash size={13} />
                </Button>
                <Button as={Link} to={`/labs/${lab.id}`} size="sm" variant="ghost">
                  <IconPlay size={13} /> Preview
                </Button>
                <Button as={Link} to={`/instructor/labs/${lab.id}`} size="sm" variant="secondary">
                  Edit <IconArrowRight size={13} />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title="New lab"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={createLab} loading={saving}>Create lab</Button>
          </>
        }
      >
        {modal && (
          <form onSubmit={createLab} className="space-y-4">
            <Select
              label="Lab mode"
              value={modal.labMode}
              onChange={(event) => setModal((current) => ({
                ...current,
                labMode: event.target.value,
                isPractice: event.target.value === 'real' ? false : current.isPractice,
              }))}
              hint={LAB_MODES[modal.labMode]?.description}
            >
              <option value="practice">Guided practice: steps, hints and automatic verification</option>
              <option value="real">Real assessment: question only, screenshot evidence</option>
            </Select>
            <Input label="Lab title" value={modal.title} onChange={(event) => setModal((current) => ({ ...current, title: event.target.value }))} required />
            <Textarea label="Summary" rows={2} value={modal.summary} onChange={(event) => setModal((current) => ({ ...current, summary: event.target.value }))} />
            <Textarea
              label={modal.labMode === 'real' ? 'Context / scenario (optional)' : 'Description (markdown)'}
              rows={4}
              value={modal.description}
              onChange={(event) => setModal((current) => ({ ...current, description: event.target.value }))}
            />
            {modal.labMode === 'real' && (
              <>
                <Textarea
                  label="Task brief / question"
                  rows={6}
                  value={modal.taskBrief}
                  onChange={(event) => setModal((current) => ({ ...current, taskBrief: event.target.value }))}
                  required
                  placeholder={'## Your task\nInvestigate the suspicious login attempts and report the attacking IP, the number of attempts and whether any succeeded.'}
                  hint="Learners only see this question. No steps or hints."
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Minimum screenshots"
                    type="number"
                    min="1"
                    max="20"
                    value={modal.minEvidence}
                    onChange={(event) => setModal((current) => ({ ...current, minEvidence: event.target.value }))}
                    hint="Submission is blocked until this many screenshots are attached."
                  />
                  <Input label="Due date (optional)" type="datetime-local" value={modal.dueAt || ''} onChange={(event) => setModal((current) => ({ ...current, dueAt: event.target.value }))} />
                </div>
              </>
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Select label="Difficulty" value={modal.difficulty} onChange={(event) => setModal((current) => ({ ...current, difficulty: event.target.value }))}>
                {Object.entries(DIFFICULTIES).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </Select>
              <Input label="Minutes" type="number" min="5" value={modal.estimatedMinutes} onChange={(event) => setModal((current) => ({ ...current, estimatedMinutes: event.target.value }))} />
              <Select label="Status" value={modal.status} onChange={(event) => setModal((current) => ({ ...current, status: event.target.value }))}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </Select>
            </div>
            <Input
              label="Lab time limit (minutes)"
              type="number"
              min="0"
              max="600"
              value={modal.timeLimitMinutes}
              onChange={(event) => setModal((current) => ({ ...current, timeLimitMinutes: event.target.value }))}
              hint="How long learners get once they start. 0 means no custom limit. The lab ends automatically when the timer reaches zero."
            />
            {modal.labMode !== 'real' && (
              <Input label="Due date (optional)" type="datetime-local" value={modal.dueAt || ''} disabled={modal.isPractice} onChange={(event) => setModal((current) => ({ ...current, dueAt: event.target.value }))} />
            )}
            <Select
              label="Course"
              value={modal.isPractice && modal.labMode !== 'real' ? '' : modal.courseId}
              disabled={Boolean(modal.isPractice) && modal.labMode !== 'real'}
              onChange={(event) => setModal((current) => ({ ...current, courseId: event.target.value }))}
            >
              <option value="">
                {modal.isPractice && modal.labMode !== 'real' ? 'Open labs are not attached to a course' : 'Standalone lab'}
              </option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.title}</option>
              ))}
            </Select>
            {modal.labMode !== 'real' && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <Checkbox
                  label="Open to all learners (no enrollment, not graded)"
                  checked={Boolean(modal.isPractice)}
                  onChange={(event) => setModal((current) => ({ ...current, isPractice: event.target.checked }))}
                />
              </div>
            )}
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(autoModal)}
        onClose={() => !generating && setAutoModal(null)}
        title="Auto-generate a lab"
        description="Describe the topic. Guided mode builds verified steps; real mode builds a question-only task with screenshot evidence. Review the result before publishing."
        size="lg"
        footer={
          <>
            <Button variant="ghost" disabled={generating} onClick={() => setAutoModal(null)}>Cancel</Button>
            <Button onClick={runAutoGenerate} loading={generating} disabled={!autoModal?.title.trim()}>
              <IconZap size={14} /> Generate lab
            </Button>
          </>
        }
      >
        {autoModal && (
          <form onSubmit={runAutoGenerate} className="space-y-4">
            <Select
              label="Lab mode"
              value={autoModal.labMode}
              onChange={(event) => setAutoModal((current) => ({
                ...current,
                labMode: event.target.value,
                labPractice: event.target.value === 'real' ? false : current.labPractice,
              }))}
              hint={LAB_MODES[autoModal.labMode]?.description}
            >
              <option value="practice">Guided practice: steps, hints and automatic verification</option>
              <option value="real">Real assessment: question only, screenshot evidence</option>
            </Select>
            <Input
              label="Lab title / topic"
              placeholder="Enter lab title / topic"
              value={autoModal.title}
              onChange={(event) => setAutoModal((current) => ({ ...current, title: event.target.value }))}
              required
              autoFocus
            />
            <Textarea
              label={autoModal.labMode === 'real' ? 'Task / question' : 'Details and scope'}
              rows={4}
              value={autoModal.details}
              onChange={(event) => setAutoModal((current) => ({ ...current, details: event.target.value }))}
              placeholder={autoModal.labMode === 'real'
                ? 'Describe the question learners must answer and the evidence they should capture. No steps or hints are generated.'
                : 'What should the learner practise? Mention tools, scenario and expected outcome. Keywords select the command blueprint.'}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Select label="Difficulty" value={autoModal.difficulty} onChange={(event) => setAutoModal((current) => ({ ...current, difficulty: event.target.value }))}>
                {Object.entries(DIFFICULTIES).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </Select>
              {autoModal.labMode === 'real' ? (
                <Input
                  label="Minimum screenshots"
                  type="number"
                  min="1"
                  max="20"
                  value={autoModal.minEvidence}
                  onChange={(event) => setAutoModal((current) => ({ ...current, minEvidence: event.target.value }))}
                />
              ) : (
                <Input
                  label="Steps"
                  type="number"
                  min="3"
                  max="12"
                  value={autoModal.stepCount}
                  onChange={(event) => setAutoModal((current) => ({ ...current, stepCount: event.target.value }))}
                />
              )}
              <Select label="Status" value={autoModal.status} onChange={(event) => setAutoModal((current) => ({ ...current, status: event.target.value }))}>
                <option value="draft">Save as draft</option>
                <option value="published">Publish now</option>
              </Select>
            </div>
            <Input
              label="Lab time limit (minutes)"
              type="number"
              min="0"
              max="600"
              value={autoModal.timeLimitMinutes}
              onChange={(event) => setAutoModal((current) => ({ ...current, timeLimitMinutes: event.target.value }))}
              hint="How long learners get once they start. 0 means no custom limit. The lab ends automatically when the timer reaches zero."
            />
            <Select
              label="Course"
              value={autoModal.labPractice && autoModal.labMode !== 'real' ? '' : autoModal.courseId}
              disabled={Boolean(autoModal.labPractice) && autoModal.labMode !== 'real'}
              onChange={(event) => setAutoModal((current) => ({ ...current, courseId: event.target.value }))}
            >
              <option value="">
                {autoModal.labPractice && autoModal.labMode !== 'real' ? 'Open labs are not attached to a course' : 'Standalone lab'}
              </option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.title}</option>
              ))}
            </Select>
            {autoModal.labMode !== 'real' && (
              <div className="rounded-xl border border-brand-400/20 bg-brand-400/[0.04] p-4">
                <Checkbox
                  label="Open to all learners (no enrollment, not graded)"
                  checked={autoModal.labPractice}
                  onChange={(event) => setAutoModal((current) => ({ ...current, labPractice: event.target.checked }))}
                />
                <p className="mt-1.5 text-[11px] leading-5 text-slate-400">
                  No enrollment, practical report or grading. The lab still runs in a real, isolated Docker container with an
                  unlimited number of sessions.
                </p>
              </div>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
