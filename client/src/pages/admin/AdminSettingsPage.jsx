import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  Select,
  Skeleton,
} from '../../components/ui';
import {
  IconCheckCircle,
  IconClock,
  IconCpu,
  IconFileText,
  IconRefresh,
  IconShield,
  IconTerminal,
  IconZap,
} from '../../components/icons';

export default function AdminSettingsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [general, setGeneral] = useState({
    platformName: 'CyberITA+',
    supportEmail: 'support@cyberita.local',
    maintenanceMode: false,
    registrationOpen: true,
  });
  const [labs, setLabs] = useState({
    defaultTimeoutMinutes: 60,
    maxActiveLabsPerUser: 1,
    autoCleanupIntervalMinutes: 5,
    requireScreenshots: true,
  });
  const [content, setContent] = useState({
    blogAutoPublish: false,
    requireReportReview: true,
    certificateAutoIssue: true,
  });

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/settings');
      if (data.settings?.general?.value) setGeneral(data.settings.general.value);
      if (data.settings?.labs?.value) setLabs(data.settings.labs.value);
      if (data.settings?.content?.value) setContent(data.settings.content.value);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to load platform settings.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const saveSection = async (key, value) => {
    setSavingKey(key);
    try {
      await api.put(`/admin/settings/${key}`, { value });
      toast.success(`${key.charAt(0).toUpperCase() + key.slice(1)} settings updated.`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save settings.'));
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Platform Settings & Policies</h1>
        <p className="mt-1 text-xs text-slate-400">
          Configure platform branding, practical lab runtime parameters, and editorial publication policies.
        </p>
      </div>

      {general.maintenanceMode && (
        <Alert tone="rose" title="Maintenance Mode Active">
          The platform is currently flagged for maintenance. Non-admin users will see an advisory notice.
        </Alert>
      )}

      {/* General Settings */}
      <Card className="p-6">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">General Platform Config</h2>
            <p className="text-xs text-slate-400">Branding, contact points, and learner registration status</p>
          </div>
          <Button
            size="sm"
            onClick={() => saveSection('general', general)}
            loading={savingKey === 'general'}
          >
            Save General
          </Button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label="Platform Name"
            value={general.platformName || ''}
            onChange={(e) => setGeneral({ ...general, platformName: e.target.value })}
          />
          <Input
            label="Support Email"
            type="email"
            value={general.supportEmail || ''}
            onChange={(e) => setGeneral({ ...general, supportEmail: e.target.value })}
          />
        </div>

        <div className="mt-5 space-y-3 pt-3 border-t border-white/5">
          <Checkbox
            label="Allow new student registrations (open registration)"
            checked={Boolean(general.registrationOpen)}
            onChange={(e) => setGeneral({ ...general, registrationOpen: e.target.checked })}
          />
          <Checkbox
            label="Enable Maintenance Mode (warns non-admin visitors)"
            checked={Boolean(general.maintenanceMode)}
            onChange={(e) => setGeneral({ ...general, maintenanceMode: e.target.checked })}
          />
        </div>
      </Card>

      {/* Lab Settings */}
      <Card className="p-6">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">Practical Lab Runtime Policies</h2>
            <p className="text-xs text-slate-400">Time limits, concurrency, and screenshot requirements</p>
          </div>
          <Button
            size="sm"
            onClick={() => saveSection('labs', labs)}
            loading={savingKey === 'labs'}
          >
            Save Lab Policies
          </Button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input
            label="Default Session Timeout (minutes)"
            type="number"
            min="10"
            max="480"
            value={labs.defaultTimeoutMinutes || 60}
            onChange={(e) => setLabs({ ...labs, defaultTimeoutMinutes: Number(e.target.value) })}
          />
          <Input
            label="Max Active Labs Per Student"
            type="number"
            min="1"
            max="5"
            value={labs.maxActiveLabsPerUser || 1}
            onChange={(e) => setLabs({ ...labs, maxActiveLabsPerUser: Number(e.target.value) })}
          />
        </div>

        <div className="mt-5 space-y-3 pt-3 border-t border-white/5">
          <Checkbox
            label="Require step screenshots for real lab report submission"
            checked={Boolean(labs.requireScreenshots)}
            onChange={(e) => setLabs({ ...labs, requireScreenshots: e.target.checked })}
          />
        </div>
      </Card>

      {/* Content & Editorial Policies */}
      <Card className="p-6">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-100">Editorial & Evaluation Policies</h2>
            <p className="text-xs text-slate-400">Report review workflows and technical blog publishing authority</p>
          </div>
          <Button
            size="sm"
            onClick={() => saveSection('content', content)}
            loading={savingKey === 'content'}
          >
            Save Editorial Policies
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          <Checkbox
            label="Require instructor review & grade before student lab report can be published"
            checked={Boolean(content.requireReportReview)}
            onChange={(e) => setContent({ ...content, requireReportReview: e.target.checked })}
          />
          <Checkbox
            label="Auto-generate course completion certificate at 100% progress"
            checked={Boolean(content.certificateAutoIssue)}
            onChange={(e) => setContent({ ...content, certificateAutoIssue: e.target.checked })}
          />
          <Checkbox
            label="Allow instructors to directly publish blog posts without admin approval"
            checked={Boolean(content.blogAutoPublish)}
            onChange={(e) => setContent({ ...content, blogAutoPublish: e.target.checked })}
          />
        </div>
      </Card>
    </div>
  );
}
