import { useEffect, useState } from 'react';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Badge, Button, Card, EmptyState, Modal, Skeleton } from '../../components/ui';
import { IconMail, IconMessage, IconSearch } from '../../components/icons';
import { formatDateTime } from '../../lib/format';

const statusTone = { new: 'amber', read: 'brand', replied: 'emerald' };

export default function MessagesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [updating, setUpdating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/contact', { params: status === 'all' ? {} : { status } });
      setMessages(data.messages || []);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load messages.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const filtered = messages.filter((message) => {
    if (!search.trim()) return true;
    const term = search.trim().toLowerCase();
    return `${message.name} ${message.email} ${message.subject || ''} ${message.message}`.toLowerCase().includes(term);
  });

  const setMessageStatus = async (message, next) => {
    setUpdating(true);
    try {
      const { data } = await api.patch(`/contact/${message.id}`, { status: next });
      setMessages((current) => current.map((item) => (item.id === message.id ? { ...item, ...data.message } : item)));
      setSelected((current) => (current ? { ...current, ...data.message } : current));
      toast.success(next === 'replied' ? 'Marked as replied.' : 'Marked as read.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not update the message.'));
    } finally {
      setUpdating(false);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Contact inbox</h1>
          <p className="mt-1 text-sm text-slate-400">Questions and leads submitted through the public contact form.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['all', 'new', 'read', 'replied'].map((item) => (
            <button key={item} type="button" onClick={() => setStatus(item)} className={`chip capitalize ${status === item ? 'chip-active' : ''}`}>
              {item}
            </button>
          ))}
        </div>
      </div>

      <Card className="p-4">
        <div className="relative">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search messages…" className="input pl-9" aria-label="Search messages" />
        </div>
      </Card>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={IconMail} title="Inbox is clear" message={status === 'new' ? 'No unread messages right now.' : 'No messages match this view.'} />
      ) : (
        <div className="space-y-3">
          {filtered.map((message) => (
            <Card key={message.id} className="p-4 transition hover:border-brand-400/25">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone[message.status] || 'slate'}>{message.status}</Badge>
                    <p className="text-sm font-semibold text-white">{message.name}</p>
                    <a href={`mailto:${message.email}`} className="text-[11px] text-brand-300 hover:text-brand-200">{message.email}</a>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-slate-200">{message.subject || 'No subject'}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{message.message}</p>
                  <p className="mt-2 text-[10px] text-slate-600">
                    {formatDateTime(message.created_at)}
                    {message.handled_by_name ? ` · handled by ${message.handled_by_name}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {isAdmin && message.status === 'new' && (
                    <Button size="sm" variant="secondary" onClick={() => setMessageStatus(message, 'read')} loading={updating}>
                      Mark read
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setSelected(message)}>
                    <IconMessage size={13} /> Open
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.subject || 'Contact message'}
        description={selected ? `${selected.name} · ${selected.email}` : ''}
        size="lg"
        footer={
          isAdmin && selected ? (
            <>
              <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
              {selected.status !== 'replied' && (
                <Button onClick={() => setMessageStatus(selected, 'replied')} loading={updating}>Mark replied</Button>
              )}
            </>
          ) : (
            <Button variant="ghost" onClick={() => setSelected(null)}>Close</Button>
          )
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <Badge tone={statusTone[selected.status] || 'slate'}>{selected.status}</Badge>
              <span className="text-slate-500">Received {formatDateTime(selected.created_at)}</span>
              {selected.phone && <span className="text-slate-500">· {selected.phone}</span>}
            </div>
            <div className="whitespace-pre-wrap rounded-xl border border-white/10 bg-night-950/50 p-4 text-sm leading-6 text-slate-300">
              {selected.message}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button as="a" href={`mailto:${selected.email}?subject=Re: ${encodeURIComponent(selected.subject || 'CyberITA+ enquiry')}`} size="sm" variant="secondary">
                <IconMail size={13} /> Reply by email
              </Button>
              {isAdmin && selected.status === 'new' && (
                <Button size="sm" variant="ghost" onClick={() => setMessageStatus(selected, 'read')} loading={updating}>
                  Mark read
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
