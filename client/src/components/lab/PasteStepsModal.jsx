import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { Alert, Badge, Button, Input, Modal, Select, Textarea } from '../../components/ui';
import { IconClipboard, IconPlus, IconTrash } from '../../components/icons';
import { parseSteps, SAMPLE_STEPS_TEXT } from '../../lib/pasteSteps';

/**
 * "Paste content -> steps" importer UI.
 *
 * The deterministic parsing itself lives in lib/pasteSteps.js. The extracted
 * steps are shown in an editable preview before they are saved sequentially.
 */
export default function PasteStepsModal({ open, onClose, labId, onImported }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [steps, setSteps] = useState([]);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setText('');
    setSteps([]);
    setError('');
  }, [open]);

  const extract = () => {
    if (!text.trim()) {
      setError('Paste your step content first.');
      setSteps([]);
      return;
    }
    const parsed = parseSteps(text);
    if (!parsed.length) {
      setError('Could not find any steps in that text.');
      setSteps([]);
      return;
    }
    setSteps(parsed);
    setError('');
  };

  const updateStep = (index, field, value) => {
    setSteps((current) => current.map((step, stepIndex) => (
      stepIndex === index ? { ...step, [field]: value } : step
    )));
  };

  const removeStep = (index) => {
    setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index));
  };

  const apply = async () => {
    if (!steps.length) return;
    if (steps.some((step) => !step.title.trim() || !step.instruction.trim())) {
      setError('Every step needs a title and an instruction before it can be added.');
      return;
    }
    setImporting(true);
    try {
      for (const step of steps) {
        // Sequential on purpose: positions are assigned by the server in order.
        // eslint-disable-next-line no-await-in-loop
        await api.post(`/labs/${labId}/steps`, {
          title: step.title.trim(),
          instruction: step.instruction.trim(),
          hint: step.hint.trim() || null,
          verification: step.verification,
          expectedCommand: step.verification === 'command' ? step.expectedCommand.trim() || null : null,
          expectedOutputPattern: step.verification === 'output' ? step.expectedOutputPattern.trim() || null : null,
          points: Number(step.points) || 10,
          isOptional: Boolean(step.isOptional),
        });
      }
      toast.success(`${steps.length} step${steps.length === 1 ? '' : 's'} added.`);
      onImported?.();
      onClose?.();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not add the parsed steps.'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => !importing && onClose?.()}
      title="Paste steps"
      description="Paste a guide, checklist or notes. CyberITA+ extracts the steps deterministically. No AI service is used."
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={importing}>Cancel</Button>
          <Button variant="secondary" onClick={extract} disabled={!text.trim() || importing}>
            <IconClipboard size={14} /> Extract steps
          </Button>
          <Button onClick={apply} loading={importing} disabled={!steps.length}>
            <IconPlus size={14} /> Add {steps.length || ''} step{steps.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Textarea
          label="Paste your content"
          rows={8}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={SAMPLE_STEPS_TEXT}
          hint="Recognised structure: markdown headings, numbered lists, --- separators, then blank-line paragraphs."
        />

        {error && <Alert tone="error">{error}</Alert>}

        {steps.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-200">
                Preview · {steps.length} step{steps.length === 1 ? '' : 's'}
              </p>
              <p className="text-[11px] text-slate-500">Edit anything before adding it to the lab.</p>
            </div>

            {steps.map((step, index) => (
              <div key={index} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone="brand">Step {index + 1}</Badge>
                    <Badge tone={step.verification === 'command' ? 'brand' : step.verification === 'output' ? 'accent' : 'amber'}>
                      {step.verification}
                    </Badge>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => removeStep(index)} aria-label={`Remove step ${index + 1}`}>
                    <IconTrash size={13} className="text-slate-500" />
                  </Button>
                </div>

                <div className="space-y-3">
                  <Input
                    label="Title"
                    value={step.title}
                    onChange={(event) => updateStep(index, 'title', event.target.value)}
                    required
                  />
                  <Textarea
                    label="Instruction (markdown)"
                    rows={3}
                    value={step.instruction}
                    onChange={(event) => updateStep(index, 'instruction', event.target.value)}
                    required
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Hint (optional)"
                      value={step.hint}
                      onChange={(event) => updateStep(index, 'hint', event.target.value)}
                    />
                    <Select
                      label="Verification"
                      value={step.verification}
                      onChange={(event) => updateStep(index, 'verification', event.target.value)}
                    >
                      <option value="command">Exact command</option>
                      <option value="output">Output pattern</option>
                      <option value="manual">Manual confirmation</option>
                    </Select>
                  </div>
                  {step.verification === 'command' && (
                    <Input
                      label="Expected command"
                      value={step.expectedCommand}
                      onChange={(event) => updateStep(index, 'expectedCommand', event.target.value)}
                      className="font-mono text-xs"
                      placeholder="Enter expected command"
                    />
                  )}
                  {step.verification === 'output' && (
                    <Input
                      label="Output pattern (regex)"
                      value={step.expectedOutputPattern}
                      onChange={(event) => updateStep(index, 'expectedOutputPattern', event.target.value)}
                      className="font-mono text-xs"
                      placeholder="Enter output pattern"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
