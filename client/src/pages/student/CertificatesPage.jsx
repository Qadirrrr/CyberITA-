import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { Badge, Button, Card, EmptyState, Skeleton } from '../../components/ui';
import {
  IconArrowRight,
  IconAward,
  IconCheckCircle,
  IconCopy,
  IconExternalLink,
  IconGraduationCap,
} from '../../components/icons';
import { formatDate } from '../../lib/format';

export default function CertificatesPage() {
  const toast = useToast();
  const [certificates, setCertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .get('/certificates/mine')
      .then((res) => {
        if (!cancelled) setCertificates(res.data.certificates || []);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load your certificates.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const copySerial = async (serial) => {
    try {
      await navigator.clipboard.writeText(serial);
      toast.success('Certificate serial copied.');
    } catch {
      toast.error('Could not copy the serial.');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Certificates</h1>
        <p className="mt-1 text-sm text-slate-400">
          Verifiable proof of completion. Share the serial or link with employers. No account is needed to verify.
        </p>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-64 w-full" />
          ))}
        </div>
      ) : certificates.length === 0 ? (
        <EmptyState
          icon={IconAward}
          title="No certificates yet"
          message="Complete every lesson and lab assignment in a course to earn a verifiable certificate."
          action={
            <Button as={Link} to="/student/courses" size="sm">
              Continue learning <IconArrowRight size={14} />
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {certificates.map((certificate) => (
            <Card key={certificate.id} className="relative overflow-hidden p-0">
              <div className="relative overflow-hidden bg-gradient-to-br from-night-800 via-night-900 to-night-950 p-6">
                <div className="pointer-events-none absolute -right-12 -top-16 h-52 w-52 rounded-full bg-brand-500/15 blur-3xl" />
                <div className="pointer-events-none absolute inset-0 opacity-[0.06] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:18px_18px]" />
                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-brand-400/30 bg-brand-400/10 text-brand-300">
                        <IconGraduationCap size={20} />
                      </span>
                      <div>
                        <p className="font-display text-sm font-semibold tracking-wide text-white">CyberITA+</p>
                        <p className="text-[10px] uppercase tracking-[0.2em] text-brand-300/70">Certificate of completion</p>
                      </div>
                    </div>
                    <Badge tone="emerald">
                      <IconCheckCircle size={11} /> Verified
                    </Badge>
                  </div>

                  <p className="mt-6 text-[10px] uppercase tracking-wider text-slate-500">Awarded to</p>
                  <p className="font-display text-xl font-semibold text-white">{certificate.student_name}</p>
                  <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-500">For successfully completing</p>
                  <p className="mt-1 text-sm font-medium leading-6 text-brand-200">{certificate.course_title}</p>

                  <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4 text-[10px]">
                    <div>
                      <p className="uppercase tracking-wider text-slate-500">Issued</p>
                      <p className="mt-0.5 text-slate-300">{formatDate(certificate.issued_at)}</p>
                    </div>
                    <div>
                      <p className="uppercase tracking-wider text-slate-500">Duration</p>
                      <p className="mt-0.5 text-slate-300">{certificate.duration_hours} hours</p>
                    </div>
                    <div>
                      <p className="uppercase tracking-wider text-slate-500">Final score</p>
                      <p className="mt-0.5 text-slate-300">{Math.round(Number(certificate.final_progress))}%</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 bg-night-950/60 px-4 py-3">
                <button
                  type="button"
                  onClick={() => copySerial(certificate.serial)}
                  className="group inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-400 transition hover:text-brand-300"
                  title="Copy serial number"
                >
                  {certificate.serial}
                  <IconCopy size={11} className="opacity-50 group-hover:opacity-100" />
                </button>
                <div className="flex items-center gap-2">
                  <Button as={Link} to={`/courses/${certificate.course_slug}`} size="sm" variant="ghost">
                    Course
                  </Button>
                  <Button as={Link} to={`/verify?serial=${encodeURIComponent(certificate.serial)}`} size="sm" variant="secondary">
                    <IconExternalLink size={13} /> Verify
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-xs text-slate-400">
          Need to check someone else's certificate?{' '}
          <Link to="/verify" className="text-brand-300 hover:text-brand-200">
            Use the public verification tool
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
