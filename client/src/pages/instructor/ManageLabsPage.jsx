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
  IconZap,
} from '../../components/icons';
import { DIFFICULTIES } from '../../lib/constants';

const statusTone = { published: 'emerald', draft: 'amber' };

export default function ManageLabsPage() {
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
  const [autoModal, setAutoModal] = useState(null);
  const [generating, setGenerating] = useState(false);

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

  const courseIds = useMemo(() => new Set(courses.map((course) => course.id)), [courses]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return labs.filter((lab) => {
      if (user?.role !== 'admin' && ((lab.course_id && !courseIds.has(lab.course_id)) || (!lab.course_id && lab.created_by && lab.created_by !== user?.id))) return false;
      if (status !== 'all' && lab.status !== status) return false;
      if (practiceOnly && !lab.is_practice) return false;
      if (!term) return true;
      return `${lab.title} ${lab.summary} ${lab.course_title || ''}`.toLowerCase().includes(term);
    });
  }, [labs, status, search, practiceOnly, user?.role, user?.id, courseIds]);

  const createLab = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.post('/labs', {
        title: modal.title,
        summary: modal.summary,
        description: modal.description,
        difficulty: modal.difficulty,
        estimatedMinutes: Number(modal.estimatedMinutes) || 30,
        courseId: modal.courseId ? Number(modal.courseId) : null,
        status: modal.status,
        isPractice: Boolean(modal.isPractice),
      });
      toast.success('Lab created. Add its steps now.');
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
      labPractice: false,
      courseId: courses[0]?.id || '',
      status: 'draft',
    });
  };

  const runAutoGenerate = async (event) => {
    event.preventDefault();
    if (!autoModal.title.trim()) {
      toast.error('Give the lab a title.');
      return;
    }
    if (!autoModal.labPractice && !autoModal.courseId) {
      toast.error('Choose a course or mark the lab as practice.');
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
          isPractice: Boolean(autoModal.labPractice),
          courseId: autoModal.labPractice ? null : Number(autoModal.courseId) || null,
          status: autoModal.status,
          autoSave: true,
        },
        { timeout: 120000 }
      );
      toast.success(`Lab generated with ${data.steps?.length || 0} verified steps. Review the steps and publish.`);
      navigate(`/instructor/labs/${data.lab.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not generate the lab.'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {user?.role === 'admin' ? 'All labs' : 'Lab builder'}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Author guided terminal exercises with objectives, expected outputs and automatic step verification.
          </p>
        </div>
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
              setModal({ title: '', summary: '', description: '', difficulty: 'beginner', estimatedMinutes: 30, courseId: '', status: 'draft', isPractice: false })
            }
          >
            <IconPlus size={14} /> New lab
          </Button>
        </div>
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
          <button
            type="button"
            onClick={() => setPracticeOnly((value) => !value)}
            className={`chip ${practiceOnly ? 'chip-active' : ''}`}
          >
            Practice
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
            <Button
              size="sm"
              onClick={() =>
                setModal({ title: '', summary: '', description: '', difficulty: 'beginner', estimatedMinutes: 30, courseId: '', status: 'draft' })
              }
            >
              <IconPlus size={13} /> New lab
            </Button>
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
                  <Link to={`/instructor/labs/${lab.id}`} className="text-sm font-semibold text-white hover:text-brand-200">
                    {lab.title}
                  </Link>
                  <Badge tone={statusTone[lab.status]}>{lab.status}</Badge>
                  {lab.is_practice && <Badge tone="brand">practice</Badge>}
                  <Badge tone={DIFFICULTIES[lab.difficulty]?.tone || 'slate'}>{DIFFICULTIES[lab.difficulty]?.label || lab.difficulty}</Badge>
                </div>
                <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">
                  {lab.is_practice ? 'Practice lab · open to all learners' : lab.course_title || 'Standalone lab'} · {lab.step_count} steps · {lab.estimated_minutes} min
                </p>
                <p className="mt-0.5 text-[10px] text-slate-600">
                  {lab.session_count} sessions started
                  {lab.last_started_at ? ` · last ${new Date(lab.last_started_at).toLocaleDateString()}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
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
            <Input label="Lab title" value={modal.title} onChange={(event) => setModal((current) => ({ ...current, title: event.target.value }))} required />
            <Textarea label="Summary" rows={2} value={modal.summary} onChange={(event) => setModal((current) => ({ ...current, summary: event.target.value }))} />
            <Textarea label="Description (markdown)" rows={4} value={modal.description} onChange={(event) => setModal((current) => ({ ...current, description: event.target.value }))} />
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
            <Select
              label="Course"
              value={modal.isPractice ? '' : modal.courseId}
              disabled={Boolean(modal.isPractice)}
              onChange={(event) => setModal((current) => ({ ...current, courseId: event.target.value }))}
            >
              <option value="">{modal.isPractice ? 'Practice labs are not attached to a course' : 'Standalone lab'}</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.title}</option>
              ))}
            </Select>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
              <Checkbox
                label="Practice lab (open to all learners, not graded)"
                checked={Boolean(modal.isPractice)}
                onChange={(event) => setModal((current) => ({ ...current, isPractice: event.target.checked }))}
              />
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(autoModal)}
        onClose={() => !generating && setAutoModal(null)}
        title="Auto-generate a lab"
        description="Describe the topic and CyberITA+ builds a runnable lab with objectives and verified steps. Review the result before publishing."
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
            <Input
              label="Lab title / topic"
              placeholder="e.g. Analyse a web access log for brute force"
              value={autoModal.title}
              onChange={(event) => setAutoModal((current) => ({ ...current, title: event.target.value }))}
              required
              autoFocus
            />
            <Textarea
              label="Details and scope"
              rows={4}
              value={autoModal.details}
              onChange={(event) => setAutoModal((current) => ({ ...current, details: event.target.value }))}
              placeholder="What should the learner practise? Mention tools, scenario and expected outcome. Keywords select the command blueprint."
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <Select label="Difficulty" value={autoModal.difficulty} onChange={(event) => setAutoModal((current) => ({ ...current, difficulty: event.target.value }))}>
                {Object.entries(DIFFICULTIES).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </Select>
              <Input
                label="Steps"
                type="number"
                min="3"
                max="12"
                value={autoModal.stepCount}
                onChange={(event) => setAutoModal((current) => ({ ...current, stepCount: event.target.value }))}
              />
              <Select label="Status" value={autoModal.status} onChange={(event) => setAutoModal((current) => ({ ...current, status: event.target.value }))}>
                <option value="draft">Save as draft</option>
                <option value="published">Publish now</option>
              </Select>
            </div>
            <Select
              label="Course"
              value={autoModal.labPractice ? '' : autoModal.courseId}
              disabled={Boolean(autoModal.labPractice)}
              onChange={(event) => setAutoModal((current) => ({ ...current, courseId: event.target.value }))}
            >
              <option value="">{autoModal.labPractice ? 'Practice labs are not attached to a course' : 'Select a course'}</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.title}</option>
              ))}
            </Select>
            <div className="rounded-xl border border-brand-400/20 bg-brand-400/[0.04] p-4">
              <Checkbox
                label="Practice lab — open to everyone, not graded"
                checked={autoModal.labPractice}
                onChange={(event) => setAutoModal((current) => ({ ...current, labPractice: event.target.checked }))}
              />
              <p className="mt-1.5 text-[11px] leading-5 text-slate-400">
                No enrollment, practical report or grading. The lab still runs in a real, isolated Docker container with an
                unlimited number of sessions.
              </p>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
