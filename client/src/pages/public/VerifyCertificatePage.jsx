import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Alert, Badge, Button, Card } from '../../components/ui';
import { IconAward, IconCheckCircle, IconSearch, IconShield, IconXCircle } from '../../components/icons';
import { formatDate } from '../../lib/format';
import { DIFFICULTIES } from '../../lib/constants';

export default function VerifyCertificatePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [serial, setSerial] = useState(searchParams.get('serial') || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const verify = async (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      setError('Enter the certificate serial number printed on the certificate.');
      return;
    }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const { data } = await api.get(`/certificates/verify/${encodeURIComponent(trimmed)}`);
      setResult(data.certificate);
      setSearchParams({ serial: trimmed }, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'No certificate matches this serial number.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initial = searchParams.get('serial');
    if (initial) verify(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (event) => {
    event.preventDefault();
    verify(serial);
  };

  const level = result ? DIFFICULTIES[result.level] || DIFFICULTIES.beginner : null;

  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="container-page relative py-12 lg:py-16">
          <Badge tone="brand" className="mb-4">
            <IconShield size={13} /> Public verification
          </Badge>
          <h1 className="max-w-2xl text-balance font-display text-3xl font-semibold sm:text-4xl">
            Verify a CyberITA+ certificate
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">
            Employers and institutions can confirm a certificate using its serial number. Verification is public and
            does not require an account.
          </p>
        </div>
      </section>

      <section className="container-page py-10 lg:py-14">
        <div className="mx-auto max-w-2xl">
          <Card className="p-6 sm:p-8">
            <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label htmlFor="serial" className="label">
                  Certificate serial number
                </label>
                <input
                  id="serial"
                  value={serial}
                  onChange={(event) => setSerial(event.target.value)}
                  placeholder="Enter certificate serial"
                  className="input font-mono uppercase tracking-wider"
                  autoComplete="off"
                />
              </div>
              <Button type="submit" loading={loading} size="lg">
                Verify <IconSearch size={16} />
              </Button>
            </form>
            <p className="mt-3 text-[11px] leading-5 text-slate-500">
              The serial is printed at the bottom of every issued certificate and is also visible in the learner's
              certificate dashboard.
            </p>
          </Card>

          {error && (
            <Alert tone="error" title="Verification failed" className="mt-6">
              {error}
            </Alert>
          )}

          {result && (
            <Card className="mt-6 overflow-hidden border-emerald-400/25">
              <div className="flex items-center gap-3 border-b border-emerald-400/20 bg-emerald-400/[0.07] px-6 py-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                  <IconCheckCircle size={22} />
                </span>
                <div>
                  <p className="font-display text-lg font-semibold text-white">Certificate is valid</p>
                  <p className="text-xs text-emerald-300/80">Serial {result.serial} · Issued by CyberITA+</p>
                </div>
              </div>
              <div className="space-y-5 p-6">
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">Awarded to</p>
                  <p className="mt-1 font-display text-xl font-semibold text-white">{result.student_name}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500">For successfully completing</p>
                  <p className="mt-1 text-base font-medium text-slate-200">{result.course_title}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone="brand">{level?.label || result.level}</Badge>
                    <Badge tone="slate">{result.duration_hours} hours</Badge>
                    <Badge tone="emerald">Final progress {result.final_progress}%</Badge>
                  </div>
                </div>
                <div className="grid gap-4 border-t border-white/10 pt-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">Issue date</p>
                    <p className="mt-1 text-slate-300">{formatDate(result.issued_at)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500">Verification status</p>
                    <p className="mt-1 inline-flex items-center gap-1.5 text-emerald-300">
                      <IconCheckCircle size={14} /> Authentic record
                    </p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <IconAward size={17} className="text-brand-400" /> For learners
              </div>
              <p className="mt-2 text-xs leading-6 text-slate-400">
                Find your serial in <Link to="/student/certificates" className="link">Certificates</Link> and share the
                verification link on your CV or LinkedIn.
              </p>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <IconXCircle size={17} className="text-rose-400" /> Not sure it's genuine?
              </div>
              <p className="mt-2 text-xs leading-6 text-slate-400">
                If a serial does not verify, contact{' '}
                <a href="mailto:security@cyberita.plus" className="link">
                  security@cyberita.plus
                </a>{' '}
                before relying on the document.
              </p>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
