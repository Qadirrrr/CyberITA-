import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  Alert,
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
  IconArrowLeft,
  IconCheckCircle,
  IconEdit,
  IconEye,
  IconPlus,
  IconTerminal,
  IconTrash,
} from '../../components/icons';
import { DIFFICULTIES } from '../../lib/constants';

const verificationTone = { command: 'brand', output: 'accent', manual: 'amber' };

const emptyStep = {
  title: '',
  instruction: '',
  hint: '',
  verification: 'command',
  expectedCommand: '',
  expectedOutputPattern: '',
  points: 10,
  isOptional: false,
};

export default function LabEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [steps, setSteps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [stepModal, setStepModal] = useState(null);
  const [stepSaving, setStepSaving] = useState(false);

  const load = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data: response } = await api.get(`/labs/${id}/manage`);
      setData(response);
      setSteps(response.steps || []);
      setForm({
        title: response.lab.title || '',
        summary: response.lab.summary || '',
        description: response.lab.description || '',
        difficulty: response.lab.difficulty || 'beginner',
        estimatedMinutes: response.lab.estimated_minutes ?? 30,
        terminalWelcome: response.lab.terminal_welcome || 'Welcome to your CyberITA+ lab environment.',
        initialCwd: response.lab.initial_cwd || '/home/student',
        status: response.lab.status || 'draft',
      });
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load this lab.'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const saveLab = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.put(`/labs/${id}`, {
        title: form.title,
        summary: form.summary,
        description: form.description,
        difficulty: form.difficulty,
        estimatedMinutes: Number(form.estimatedMinutes) || 30,
        terminalWelcome: form.terminalWelcome,
        initialCwd: form.initialCwd,
        status: form.status,
      });
      toast.success('Lab saved.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the lab.'));
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async () => {
    const next = data.lab.status === 'published' ? 'draft' : 'published';
    setSaving(true);
    try {
      await api.put(`/labs/${id}`, { status: next });
      toast.success(next === 'published' ? 'Lab published.' : 'Lab unpublished.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not change the lab status.'));
    } finally {
      setSaving(false);
    }
  };

  const removeLab = async () => {
    if (!window.confirm('Delete this lab and all its steps and sessions? This cannot be undone.')) return;
    try {
      await api.delete(`/labs/${id}`);
      toast.success('Lab deleted.');
      navigate('/instructor/labs');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete the lab.'));
    }
  };

  const openStep = (step) =>
    setStepModal(
      step
        ? {
            id: step.id,
            title: step.title,
            instruction: step.instruction,
            hint: step.hint || '',
            verification: step.verification,
            expectedCommand: step.expected_command || '',
            expectedOutputPattern: step.expected_output_pattern || '',
            points: step.points,
            isOptional: Boolean(step.is_optional),
          }
        : { ...emptyStep }
    );

  const saveStep = async (event) => {
    event.preventDefault();
    setStepSaving(true);
    const payload = {
      title: stepModal.title,
      instruction: stepModal.instruction,
      hint: stepModal.hint || null,
      verification: stepModal.verification,
      expectedCommand: stepModal.expectedCommand || null,
      expectedOutputPattern: stepModal.expectedOutputPattern || null,
      points: Number(stepModal.points) || 0,
      isOptional: Boolean(stepModal.isOptional),
    };
    try {
      if (stepModal.id) await api.put(`/labs/steps/${stepModal.id}`, payload);
      else await api.post(`/labs/${id}/steps`, payload);
      toast.success(stepModal.id ? 'Step updated.' : 'Step added.');
      setStepModal(null);
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the step.'));
    } finally {
      setStepSaving(false);
    }
  };

  const deleteStep = async (step) => {
    if (!window.confirm(`Delete step "${step.title}"?`)) return;
    try {
      await api.delete(`/labs/steps/${step.id}`);
      toast.success('Step deleted.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete the step.'));
    }
  };

  const moveStep = async (step, direction) => {
    const index = steps.findIndex((item) => item.id === step.id);
    const target = steps[index + direction];
    if (!target) return;
    try {
      await Promise.all([
        api.put(`/labs/steps/${step.id}`, { position: target.position }),
        api.put(`/labs/steps/${target.id}`, { position: step.position }),
      ]);
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not reorder steps.'));
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-1/2" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (error || !data || !form) {
    return (
      <div>
        <Alert tone="error" title="Lab unavailable">
          {error || 'This lab could not be found.'}
        </Alert>
        <Button as={Link} to="/instructor/labs" variant="secondary" className="mt-4">
          Back to labs
        </Button>
      </div>
    );
  }

  const { lab, stats } = data;
  const canPublish = steps.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/instructor/labs" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-300">
            <IconArrowLeft size={13} /> All labs
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-2xl font-semibold">
            {lab.title}
            <Badge tone={lab.status === 'published' ? 'emerald' : 'amber'}>{lab.status}</Badge>
          </h1>
          <p className="mt-1 text-[11px] text-slate-500">
            {lab.course_id ? `Course #${lab.course_id}` : 'Standalone lab'} · slug <span className="font-mono">{lab.slug}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button as={Link} to={`/labs/${lab.id}`} size="sm" variant="ghost">
            <IconEye size={13} /> Preview
          </Button>
          <Button size="sm" variant={lab.status === 'published' ? 'secondary' : 'primary'} onClick={togglePublish} loading={saving} disabled={!canPublish && lab.status !== 'published'}>
            {lab.status === 'published' ? 'Unpublish' : 'Publish'}
          </Button>
          <Button size="sm" variant="danger" onClick={removeLab}>
            <IconTrash size={13} /> Delete
          </Button>
        </div>
      </div>

      {!canPublish && (
        <Alert tone="warning" title="Add at least one step">
          Learners can't start a lab without steps. Publish it once the checklist is ready.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Sessions</p>
          <p className="mt-1 font-display text-2xl font-semibold text-white">{stats?.sessions ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Learners</p>
          <p className="mt-1 font-display text-2xl font-semibold text-white">{stats?.learners ?? 0}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-slate-500">Steps completed</p>
          <p className="mt-1 font-display text-2xl font-semibold text-white">{stats?.steps_completed ?? 0}</p>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold">Lab settings</h2>
        <form onSubmit={saveLab} className="mt-4 space-y-4">
          <Input label="Title" value={form.title} onChange={update('title')} required />
          <Textarea label="Summary" rows={2} value={form.summary} onChange={update('summary')} />
          <Textarea label="Description (markdown)" rows={5} value={form.description} onChange={update('description')} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Select label="Difficulty" value={form.difficulty} onChange={update('difficulty')}>
              {Object.entries(DIFFICULTIES).map(([key, value]) => (
                <option key={key} value={key}>{value.label}</option>
              ))}
            </Select>
            <Input label="Estimated minutes" type="number" min="5" value={form.estimatedMinutes} onChange={update('estimatedMinutes')} />
            <Select label="Status" value={form.status} onChange={update('status')}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Textarea label="Terminal welcome message" rows={2} value={form.terminalWelcome} onChange={update('terminalWelcome')} />
            <Input label="Initial working directory" value={form.initialCwd} onChange={update('initialCwd')} className="font-mono text-xs" />
          </div>
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>Save lab settings</Button>
          </div>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="font-display text-base font-semibold">Steps</h2>
            <p className="text-[11px] text-slate-500">Commands are matched exactly; output patterns are case-insensitive regular expressions.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => openStep(null)}>
            <IconPlus size={13} /> Add step
          </Button>
        </div>

        {steps.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={IconTerminal}
              title="No steps yet"
              message="Add your first step with an instruction and a verification rule."
              action={<Button size="sm" onClick={() => openStep(null)}><IconPlus size={13} /> Add step</Button>}
            />
          </div>
        ) : (
          <ol className="divide-y divide-white/5">
            {steps.map((step, index) => (
              <li key={step.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 font-mono text-[10px] text-slate-400">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-slate-200">{step.title}</p>
                    <Badge tone={verificationTone[step.verification]}>{step.verification}</Badge>
                    {step.is_optional && <Badge tone="slate">optional</Badge>}
                    <span className="text-[10px] text-slate-500">{step.points} pts</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">{step.instruction}</p>
                  {step.expected_command && (
                    <code className="mt-1.5 inline-block rounded border border-white/5 bg-night-950/70 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                      {step.expected_command}
                    </code>
                  )}
                  {step.expected_output_pattern && (
                    <code className="mt-1.5 ml-1.5 inline-block rounded border border-white/5 bg-night-950/70 px-2 py-0.5 font-mono text-[10px] text-brand-300">
                      /{step.expected_output_pattern}/i
                    </code>
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  <Button size="sm" variant="ghost" onClick={() => moveStep(step, -1)} disabled={index === 0} aria-label="Move up">↑</Button>
                  <Button size="sm" variant="ghost" onClick={() => moveStep(step, 1)} disabled={index === steps.length - 1} aria-label="Move down">↓</Button>
                  <Button size="sm" variant="ghost" onClick={() => openStep(step)} aria-label="Edit step"><IconEdit size={13} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteStep(step)} aria-label="Delete step"><IconTrash size={13} className="text-slate-500" /></Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Modal
        open={Boolean(stepModal)}
        onClose={() => setStepModal(null)}
        title={stepModal?.id ? 'Edit step' : 'Add step'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setStepModal(null)}>Cancel</Button>
            <Button onClick={saveStep} loading={stepSaving}>{stepModal?.id ? 'Save step' : 'Add step'}</Button>
          </>
        }
      >
        {stepModal && (
          <form onSubmit={saveStep} className="space-y-4">
            <Input label="Step title" value={stepModal.title} onChange={(event) => setStepModal((current) => ({ ...current, title: event.target.value }))} required />
            <Textarea label="Instruction (markdown)" rows={4} value={stepModal.instruction} onChange={(event) => setStepModal((current) => ({ ...current, instruction: event.target.value }))} required />
            <Textarea label="Hint (optional)" rows={2} value={stepModal.hint} onChange={(event) => setStepModal((current) => ({ ...current, hint: event.target.value }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Verification" value={stepModal.verification} onChange={(event) => setStepModal((current) => ({ ...current, verification: event.target.value }))}>
                <option value="command">Exact command</option>
                <option value="output">Output pattern</option>
                <option value="manual">Manual confirmation</option>
              </Select>
              <Input label="Points" type="number" min="0" value={stepModal.points} onChange={(event) => setStepModal((current) => ({ ...current, points: event.target.value }))} />
            </div>
            {stepModal.verification === 'command' && (
              <Input
                label="Expected command"
                value={stepModal.expectedCommand}
                onChange={(event) => setStepModal((current) => ({ ...current, expectedCommand: event.target.value }))}
                className="font-mono text-xs"
                placeholder="e.g. ls -la ~"
                hint="Whitespace is normalised and matching is case-insensitive."
              />
            )}
            {stepModal.verification === 'output' && (
              <Input
                label="Output pattern (regex)"
                value={stepModal.expectedOutputPattern}
                onChange={(event) => setStepModal((current) => ({ ...current, expectedOutputPattern: event.target.value }))}
                className="font-mono text-xs"
                placeholder="e.g. Welcome to your CyberITA\\+ lab environment"
                hint="Case-insensitive JavaScript regular expression tested against the command output."
              />
            )}
            <Checkbox label="Optional step (doesn't block lab completion)" checked={stepModal.isOptional} onChange={(event) => setStepModal((current) => ({ ...current, isOptional: event.target.checked }))} />
            {stepModal.verification === 'command' && !stepModal.expectedCommand && (
              <p className="text-[11px] text-amber-300/80">Without an expected command this step can never auto-complete.</p>
            )}
          </form>
        )}
      </Modal>
    </div>
  );
}
