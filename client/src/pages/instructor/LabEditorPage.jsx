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
  IconClipboard,
  IconEdit,
  IconEye,
  IconPlus,
  IconServer,
  IconTerminal,
  IconTrash,
} from '../../components/icons';
import PasteStepsModal from '../../components/lab/PasteStepsModal';
import { DIFFICULTIES, LAB_MODES, VPS_LAB_PROFILES } from '../../lib/constants';
import { useConfirm } from '../../components/ConfirmDialog';

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
  const [confirmNode, askConfirm] = useConfirm();
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
  const [pasteOpen, setPasteOpen] = useState(false);

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
        objectives: response.lab.objectives || '',
        submissionRequirements: response.lab.submission_requirements || '',
        difficulty: response.lab.difficulty || 'beginner',
        estimatedMinutes: response.lab.estimated_minutes ?? 30,
        timeLimitMinutes: response.lab.time_limit_minutes ?? 0,
        terminalWelcome: response.lab.terminal_welcome || 'Welcome to your CyberITA+ lab environment.',
        initialCwd: response.lab.initial_cwd || '/home/student',
        containerImage: response.lab.container_image || '',
        networkEnabled: Boolean(response.lab.network_enabled),
        labMode: response.lab.lab_mode === 'vps' ? 'vps' : response.lab.lab_mode === 'real' ? 'real' : 'practice',
        vpsProfile: response.lab.vps_profile || 'ubuntu-basic-linode',
        taskBrief: response.lab.task_brief || '',
        minEvidence: response.lab.min_evidence ?? 1,
        isPractice: Boolean(response.lab.is_practice),
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

  const buildPayload = (overrides = {}) => ({
    title: form.title,
    summary: form.summary,
    description: form.description,
    objectives: form.objectives,
    submissionRequirements: form.submissionRequirements,
    difficulty: form.difficulty,
    estimatedMinutes: Number(form.estimatedMinutes) || 30,
    timeLimitMinutes: Math.max(0, Number(form.timeLimitMinutes) || 0),
    terminalWelcome: form.terminalWelcome,
    initialCwd: form.initialCwd,
    containerImage: form.containerImage.trim() || null,
    networkEnabled: Boolean(form.networkEnabled),
    labMode: form.labMode,
    vpsProfile: form.vpsProfile || 'ubuntu-basic-linode',
    taskBrief: form.taskBrief,
    minEvidence: Number(form.minEvidence) || 1,
    isPractice: form.labMode === 'practice' ? Boolean(form.isPractice) : false,
    status: form.status,
    ...overrides,
  });

  const saveLab = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.put(`/labs/${id}`, buildPayload());
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
      // Save the form too, so a freshly written task brief is part of the
      // published lab instead of being discarded by a status-only update.
      await api.put(`/labs/${id}`, buildPayload({ status: next }));
      toast.success(next === 'published' ? 'Lab published.' : 'Lab unpublished.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not change the lab status.'));
    } finally {
      setSaving(false);
    }
  };

  const removeLab = async () => {
    if (!(await askConfirm({ title: 'Delete lab?', message: 'Delete this lab and all its steps and sessions? This cannot be undone.', confirmLabel: 'Delete lab', danger: true }))) return;
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
    if (!(await askConfirm({ title: 'Delete step?', message: `Delete step "${step.title}"?`, confirmLabel: 'Delete step', danger: true }))) return;
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
        {confirmNode}
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
  const isRealMode = form.labMode === 'real';
  const isVpsMode = form.labMode === 'vps';
  const isAssessmentMode = isRealMode || isVpsMode;
  const canPublish = isAssessmentMode ? form.taskBrief.trim().length >= 10 : steps.length > 0;

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
            <Badge tone={LAB_MODES[lab.lab_mode]?.tone || 'sky'}>
              {LAB_MODES[lab.lab_mode]?.label || 'Guided practice'}
            </Badge>
            {lab.is_practice && <Badge tone="brand">Open to all</Badge>}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span>
              {lab.course_id ? `Course #${lab.course_id}` : 'Standalone lab'} · slug{' '}
              <span className="font-mono">{lab.slug}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <IconServer size={11} />
              {lab.lab_server_name ? (
                <>
                  Server: <span className="text-slate-300">{lab.lab_server_name}</span>
                  <span className="text-slate-600">(assigned by admin)</span>
                </>
              ) : (
                <>Default lab host (no server assigned)</>
              )}
            </span>
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
        isAssessmentMode ? (
          <Alert tone="warning" title="Add the task brief">
            {isVpsMode
              ? 'A Real VPS lab is a question-only assessment on a dedicated cloud server. Write the task learners must solve before publishing it.'
              : 'A real lab is a question-only assessment. Write the task learners must solve before publishing it.'}
          </Alert>
        ) : (
          <Alert tone="warning" title="Add at least one step">
            Learners can't start a guided lab without steps. Publish it once the checklist is ready.
          </Alert>
        )
      )}

      {isAssessmentMode && steps.length > 0 && (
        <Alert tone="info" title="Guided steps are hidden">
          This lab still has {steps.length} step{steps.length === 1 ? '' : 's'} from guided mode. Assessment labs hide all steps
          and hints from learners; switch back to guided practice to edit them.
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
          <p className="text-[10px] uppercase tracking-wider text-slate-500">{isAssessmentMode ? 'Delivery' : 'Steps completed'}</p>
          <p className="mt-1 font-display text-2xl font-semibold text-white">
            {isAssessmentMode ? 'Question' : stats?.steps_completed ?? 0}
          </p>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="font-display text-lg font-semibold">Lab settings</h2>
        <form onSubmit={saveLab} className="mt-4 space-y-4">
          <div className="rounded-xl border border-brand-400/20 bg-brand-400/[0.04] p-4">
            <Select
              label="Lab mode"
              value={form.labMode}
              onChange={(event) => setForm((current) => ({
                ...current,
                labMode: event.target.value,
                isPractice: event.target.value === 'practice' ? current.isPractice : false,
              }))}
              hint={LAB_MODES[form.labMode]?.description}
            >
              <option value="practice">Guided practice: steps, hints and automatic verification</option>
              <option value="real">Real assessment: question only, screenshot evidence</option>
              <option value="vps">Real VPS Lab: dedicated cloud server, screenshot evidence</option>
            </Select>
          </div>
          <Input label="Title" value={form.title} onChange={update('title')} required />
          <Textarea label="Summary" rows={2} value={form.summary} onChange={update('summary')} />
          <Textarea
            label={isAssessmentMode ? 'Context / scenario (optional)' : 'Description (markdown)'}
            rows={5}
            value={form.description}
            onChange={update('description')}
            hint={isAssessmentMode ? 'Extra background shown on the lab page. The question itself lives in the task brief below.' : undefined}
          />
          {isAssessmentMode && (
            <>
              <Textarea
                label="Task brief / question"
                rows={8}
                value={form.taskBrief}
                onChange={update('taskBrief')}
                required
                placeholder="Enter the task brief"
                hint="This is the only task text learners see. Do not include step-by-step instructions, commands or hints."
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Minimum screenshots required"
                  type="number"
                  min="1"
                  max="20"
                  value={form.minEvidence}
                  onChange={update('minEvidence')}
                  hint="Submission is blocked until the learner attaches this many screenshots."
                />
                {isVpsMode && (
                  <Select
                    label="VPS profile"
                    value={form.vpsProfile || 'ubuntu-basic-linode'}
                    onChange={update('vpsProfile')}
                    hint="The fixed server profile this lab is provisioned with. Learners cannot change it."
                  >
                    {VPS_LAB_PROFILES.filter((profile) => profile.providerName === 'Linode' || profile.key === form.vpsProfile).map((profile) => (
                      <option key={profile.key} value={profile.key}>{profile.label}{profile.providerName ? ` · ${profile.providerName}` : ''}</option>
                    ))}
                  </Select>
                )}
                <Textarea
                  label="Submission requirements"
                  rows={4}
                  value={form.submissionRequirements}
                  onChange={update('submissionRequirements')}
                  placeholder="Enter submission requirements"
                  hint="Shown to learners together with the task brief."
                />
              </div>
            </>
          )}
          {!isAssessmentMode && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Textarea
                label="Learning objectives"
                rows={4}
                value={form.objectives}
                onChange={update('objectives')}
                placeholder="Enter learning objectives"
                hint="One objective per line. Shown to learners before they start the lab."
              />
              <Textarea
                label="Submission requirements"
                rows={4}
                value={form.submissionRequirements}
                onChange={update('submissionRequirements')}
                placeholder="Enter submission requirements"
                hint={
                  form.isPractice
                    ? 'Open labs are not graded and require no practical report, so this text is not shown.'
                    : 'What learners must include in the practical report for this lab.'
                }
                disabled={Boolean(form.isPractice)}
              />
            </div>
          )}
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
            <Input
              label="Lab time limit (minutes)"
              type="number"
              min="0"
              max="600"
              value={form.timeLimitMinutes}
              onChange={update('timeLimitMinutes')}
              hint="How long learners get once they start. Set 0 for no custom limit. The timer ends the session automatically at zero."
            />
            <div className="flex items-end pb-2">
              <p className="text-[11px] leading-5 text-slate-500 dark:text-slate-400">
                {Number(form.timeLimitMinutes) > 0
                  ? `Learners see a ${form.timeLimitMinutes}-minute countdown and can finish early once required work is complete.`
                  : 'No custom timer. Sessions still end at the platform safety limit if one is configured.'}
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Textarea label="Terminal welcome message" rows={2} value={form.terminalWelcome} onChange={update('terminalWelcome')} />
            <Input label="Initial working directory" value={form.initialCwd} onChange={update('initialCwd')} className="font-mono text-xs" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Container image"
              value={form.containerImage}
              onChange={update('containerImage')}
              className="font-mono text-xs"
              placeholder="Enter Docker image"
              hint="Leave blank to use the server default. The image must provide /bin/sh and coreutils."
            />
            <div className="flex items-end pb-2">
              <Checkbox
                label="Allow outbound network access in this lab's container"
                checked={form.networkEnabled}
                onChange={(event) => setForm((current) => ({ ...current, networkEnabled: event.target.checked }))}
              />
            </div>
          </div>
          {!isAssessmentMode && (
            <div className="rounded-xl border border-brand-400/20 bg-brand-400/[0.04] p-4">
              <Checkbox
                label="Open to all learners (no enrollment, not graded)"
                checked={form.isPractice}
                onChange={(event) => setForm((current) => ({ ...current, isPractice: event.target.checked }))}
              />
              <p className="mt-1.5 text-[11px] leading-5 text-slate-400">
                Open labs skip course enrollment, practical reports and grading. Learners can start as many sessions as
                they like. The lab still runs in a real, isolated Docker container.
              </p>
            </div>
          )}
          <div className="flex justify-end">
            <Button type="submit" loading={saving}>Save lab settings</Button>
          </div>
        </form>
      </Card>

      {!isAssessmentMode ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="font-display text-base font-semibold">Steps</h2>
              <p className="text-[11px] text-slate-500">Commands are matched exactly; output patterns are case-insensitive regular expressions.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPasteOpen(true)}>
                <IconClipboard size={13} /> Paste steps
              </Button>
              <Button size="sm" variant="secondary" onClick={() => openStep(null)}>
                <IconPlus size={13} /> Add step
              </Button>
            </div>
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
      ) : (
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-semibold">Question-only assessment</h2>
              <p className="mt-1 max-w-2xl text-[11px] leading-5 text-slate-500">
                {isVpsMode
                  ? 'Real VPS labs hide steps, hints and progress from learners. They read the task brief, solve the challenge on their own dedicated cloud server and upload screenshot evidence. You review the evidence from the lab submissions queue.'
                  : 'Real labs hide steps, hints and progress from learners. They read the task brief, solve the challenge in the terminal and upload screenshot evidence. You review the evidence from the lab submissions queue.'}
              </p>
            </div>
            <Badge tone={isVpsMode ? 'accent' : 'rose'}>{isVpsMode ? 'Real VPS' : 'Real'}</Badge>
          </div>
          <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs leading-6 text-slate-400">
            <p><span className="font-medium text-slate-200">Task brief:</span> {form.taskBrief.trim() ? 'ready' : 'not written yet'}</p>
            <p><span className="font-medium text-slate-200">Minimum evidence:</span> {Math.max(1, Number(form.minEvidence) || 1)} screenshot{(Math.max(1, Number(form.minEvidence) || 1)) === 1 ? '' : 's'}</p>
            {isVpsMode && (
              <p><span className="font-medium text-slate-200">VPS profile:</span> {VPS_LAB_PROFILES.find((profile) => profile.key === form.vpsProfile)?.label || 'CyberITA Lab (Ubuntu)'}</p>
            )}
            {steps.length > 0 && (
              <p className="text-amber-300/80">{steps.length} guided step{steps.length === 1 ? '' : 's'} are stored but hidden from learners.</p>
            )}
          </div>
        </Card>
      )}

      <PasteStepsModal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        labId={id}
        onImported={() => load({ silent: true })}
      />

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
                placeholder="Enter expected command"
                hint="Whitespace is normalised and matching is case-insensitive."
              />
            )}
            {stepModal.verification === 'output' && (
              <Input
                label="Output pattern (regex)"
                value={stepModal.expectedOutputPattern}
                onChange={(event) => setStepModal((current) => ({ ...current, expectedOutputPattern: event.target.value }))}
                className="font-mono text-xs"
                placeholder="Enter output pattern"
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
