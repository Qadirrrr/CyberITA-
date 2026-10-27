import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Modal,
  Skeleton,
  Spinner,
  cx,
} from '../../components/ui';
import {
  IconArrowLeft,
  IconArrowRight,
  IconChatBubble,
  IconDownload,
  IconFileText,
  IconPaperclip,
  IconPlus,
  IconSearch,
  IconSend,
  IconX,
} from '../../components/icons';
import { formatDate, formatDateTime, timeAgo } from '../../lib/format';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_FILES =
  '.pdf,.doc,.docx,.txt,.md,.csv,.zip,.json,.log,.png,.jpg,.jpeg,.webp,.gif,.xls,.xlsx,.ppt,.pptx';

function formatFileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function roleLabel(role) {
  if (role === 'instructor') return 'Instructor';
  if (role === 'student') return 'Student';
  return 'Member';
}

function dayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  return formatDate(date, { year: undefined });
}

export default function ChatPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const isInstructor = user?.role === 'instructor';

  const [conversations, setConversations] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [conversationDetail, setConversationDetail] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [listLoaded, setListLoaded] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');
  const [composer, setComposer] = useState('');
  const [file, setFile] = useState(null);
  const [sending, setSending] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const fileInputRef = useRef(null);
  const endRef = useRef(null);
  const messagesRef = useRef([]);
  const queryConversation = searchParams.get('conversation');

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const loadConversations = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setListLoaded(false);
    try {
      const { data } = await api.get('/messages/conversations');
      setConversations(data.conversations || []);
      setListError('');
      return data.conversations || [];
    } catch (err) {
      if (!silent) setListError(getErrorMessage(err, 'Unable to load your conversations.'));
      return [];
    } finally {
      setListLoaded(true);
    }
  }, []);

  const loadContacts = useCallback(async () => {
    try {
      const { data } = await api.get('/messages/contacts');
      setContacts(data.contacts || []);
    } catch {
      /* contact list is optional until the user starts a new chat */
    }
  }, []);

  useEffect(() => {
    loadConversations();
    loadContacts();
    const timer = window.setInterval(() => loadConversations({ silent: true }), 20000);
    return () => window.clearInterval(timer);
  }, [loadConversations, loadContacts]);

  useEffect(() => {
    const requested = Number(queryConversation);
    if (requested) {
      if (requested !== selectedId) setSelectedId(requested);
      if (listLoaded && !conversations.some((item) => item.id === requested)) {
        setSelectedId(null);
        setSearchParams({}, { replace: true });
      }
      return;
    }
    if (!selectedId && conversations.length > 0) {
      setSelectedId(conversations[0].id);
    }
  }, [queryConversation, conversations, listLoaded, selectedId, setSearchParams]);

  const selectConversation = (id) => {
    if (id == null) {
      setSelectedId(null);
      setSearchParams({}, { replace: true });
      setNewChatOpen(false);
      return;
    }
    setSelectedId(id);
    setSearchParams({ conversation: String(id) }, { replace: true });
    setNewChatOpen(false);
  };

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setConversationDetail(null);
      return undefined;
    }
    let active = true;
    setLoadingMessages(true);
    setError('');

    const fetchMessages = async () => {
      try {
        const { data } = await api.get(`/messages/conversations/${selectedId}/messages`);
        if (!active) return;
        setMessages(data.messages || []);
        setConversationDetail(data.conversation);
        window.dispatchEvent(new CustomEvent('chat:read'));
      } catch (err) {
        if (active) setError(getErrorMessage(err, 'Unable to open this conversation.'));
      } finally {
        if (active) setLoadingMessages(false);
      }
    };

    fetchMessages();

    const timer = window.setInterval(async () => {
      const lastId = messagesRef.current.length ? messagesRef.current[messagesRef.current.length - 1].id : 0;
      try {
        const { data } = await api.get(`/messages/conversations/${selectedId}/messages`, {
          params: lastId ? { after: lastId } : {},
        });
        if (!active) return;
        if (data.messages?.length) {
          setMessages((current) => {
            const seen = new Set(current.map((item) => item.id));
            const incoming = data.messages.filter((item) => !seen.has(item.id));
            return incoming.length ? [...current, ...incoming] : current;
          });
          window.dispatchEvent(new CustomEvent('chat:read'));
        }
      } catch {
        /* polling is best-effort */
      }
    }, 5000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selectedId]);

  useEffect(() => {
    if (!loadingMessages) {
      endRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages.length, loadingMessages, selectedId]);

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    return conversations.filter((conversation) =>
      `${conversation.peer?.full_name || ''} ${conversation.course_title || ''} ${conversation.subject || ''}`
        .toLowerCase()
        .includes(term)
    );
  }, [conversations, search]);

  const filteredContacts = useMemo(() => {
    const term = contactSearch.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((contact) => {
      const courses = (contact.courses || []).map((course) => course.title).join(' ');
      return `${contact.full_name} ${contact.email} ${courses}`.toLowerCase().includes(term);
    });
  }, [contacts, contactSearch]);

  const openNewChat = () => {
    setContactSearch('');
    setNewChatOpen(true);
    if (contacts.length === 0) loadContacts();
  };

  const startConversation = async (contact) => {
    if (contact.conversation_id) {
      selectConversation(contact.conversation_id);
      return;
    }
    setCreating(true);
    try {
      const { data } = await api.post('/messages/conversations', {
        peerId: contact.id,
        courseId: contact.courses?.[0]?.id,
      });
      await loadConversations({ silent: true });
      selectConversation(data.conversation.id);
      toast.success(`Conversation started with ${contact.full_name}.`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not start this conversation.'));
    } finally {
      setCreating(false);
    }
  };

  const onFileChange = (event) => {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    if (chosen.size > MAX_FILE_BYTES) {
      toast.error('Attachments must be 8 MB or smaller.');
      event.target.value = '';
      return;
    }
    setFile(chosen);
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sendMessage = async (event) => {
    event?.preventDefault();
    if (!selectedId || sending) return;
    const body = composer.trim();
    if (!body && !file) {
      toast.error('Write a message or attach a document first.');
      return;
    }
    setSending(true);
    try {
      const formData = new FormData();
      if (body) formData.append('body', body);
      if (file) formData.append('file', file);
      const { data } = await api.post(`/messages/conversations/${selectedId}/messages`, formData);
      setMessages((current) =>
        current.some((message) => message.id === data.message.id) ? current : [...current, data.message]
      );
      setComposer('');
      clearFile();
      loadConversations({ silent: true });
      window.dispatchEvent(new CustomEvent('chat:read'));
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not send your message.'));
    } finally {
      setSending(false);
    }
  };

  const peer = conversationDetail?.peer || conversations.find((item) => item.id === selectedId)?.peer;
  const selectedConversation = conversations.find((item) => item.id === selectedId);
  const courseTitle = conversationDetail?.course_title || selectedConversation?.course_title;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">{isInstructor ? 'Messages' : 'Chat with your instructors'}</h1>
          <p className="mt-1 text-sm text-slate-400">
            {isInstructor
              ? 'Reply to student questions and keep course support in one place.'
              : 'Ask questions, share screenshots or upload documents. Your instructor replies in the same thread.'}
          </p>
        </div>
        <Button size="sm" onClick={openNewChat}>
          <IconPlus size={14} /> New conversation
        </Button>
      </div>

      {listError && <Alert tone="error">{listError}</Alert>}

      <Card className="flex h-[calc(100vh-11.5rem)] min-h-[560px] overflow-hidden p-0">
        {/* Conversation list */}
        <aside
          className={cx(
            'w-full shrink-0 flex-col border-r border-white/10 bg-night-900/40 lg:flex lg:w-[320px]',
            selectedId ? 'hidden lg:flex' : 'flex'
          )}
        >
          <div className="shrink-0 border-b border-white/10 p-3">
            <div className="relative">
              <IconSearch size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search conversations…"
                className="input !py-2 pl-8 text-xs"
                aria-label="Search conversations"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {!listLoaded ? (
              <div className="space-y-2 p-3">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <IconChatBubble size={26} className="mx-auto text-slate-600" />
                <p className="mt-3 text-sm font-medium text-slate-300">
                  {conversations.length === 0 ? 'No conversations yet' : 'No matches'}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {conversations.length === 0
                    ? 'Start a new conversation to ask a question.'
                    : 'Try a different name or course.'}
                </p>
                {conversations.length === 0 && (
                  <Button size="sm" variant="secondary" className="mt-3" onClick={openNewChat}>
                    <IconPlus size={13} /> Start chatting
                  </Button>
                )}
              </div>
            ) : (
              <ul className="divide-y divide-white/5">
                {filteredConversations.map((conversation) => {
                  const active = conversation.id === selectedId;
                  const preview = conversation.last_message
                    ? conversation.last_message.body || `Attachment: ${conversation.last_message.attachment_name}`
                    : 'No messages yet';
                  return (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        onClick={() => selectConversation(conversation.id)}
                        className={cx(
                          'flex w-full items-start gap-3 px-3 py-3 text-left transition',
                          active ? 'bg-brand-400/[0.08]' : 'hover:bg-white/[0.03]'
                        )}
                      >
                        <Avatar name={conversation.peer?.full_name} src={conversation.peer?.avatar_url} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className={cx('truncate text-sm', active ? 'font-semibold text-white' : 'font-medium text-slate-200')}>
                              {conversation.peer?.full_name}
                            </span>
                            <span className="shrink-0 text-[10px] text-slate-500">
                              {conversation.last_message ? timeAgo(conversation.last_message.created_at) : ''}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-brand-300/80">
                            {conversation.course_title || roleLabel(conversation.peer?.role)}
                          </span>
                          <span className="mt-0.5 flex items-center gap-2">
                            <span className={cx('min-w-0 flex-1 truncate text-[11px]', conversation.unread ? 'text-slate-300' : 'text-slate-500')}>
                              {preview}
                            </span>
                            {conversation.unread > 0 && (
                              <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-brand-400 px-1 text-[9px] font-bold text-night-950">
                                {conversation.unread > 9 ? '9+' : conversation.unread}
                              </span>
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Thread */}
        <section className={cx('min-w-0 flex-1 flex-col', selectedId ? 'flex' : 'hidden lg:flex')}>
          {selectedId && peer ? (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-night-900/50 px-3 py-3 sm:px-4">
                <IconButton label="Back to conversations" className="lg:hidden" onClick={() => selectConversation(null)}>
                  <IconArrowLeft size={17} />
                </IconButton>
                <Avatar name={peer.full_name} src={peer.avatar_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-white">{peer.full_name}</p>
                    <Badge tone={peer.role === 'instructor' ? 'brand' : 'accent'} className="!px-2 !py-0 !text-[9px]">
                      {roleLabel(peer.role)}
                    </Badge>
                  </div>
                  <p className="truncate text-[11px] text-slate-500">
                    {courseTitle || conversationDetail?.subject || 'Course support'}
                  </p>
                </div>
                <a
                  href={`mailto:${peer.email}`}
                  className="hidden text-[11px] text-slate-500 transition hover:text-brand-300 sm:block"
                >
                  {peer.email}
                </a>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-night-950/30 px-3 py-4 sm:px-5">
                {loadingMessages ? (
                  <div className="flex h-full items-center justify-center">
                    <Spinner className="h-6 w-6 text-brand-400" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-400/10 text-brand-300">
                      <IconChatBubble size={22} />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-white">Start the conversation</p>
                    <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
                      Ask about a lesson, lab, quiz or assignment. You can attach PDFs, documents and screenshots.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((message, index) => {
                      const isOwn = Number(message.sender_id) === Number(user.id);
                      const previous = messages[index - 1];
                      const showDay =
                        !previous || new Date(message.created_at).toDateString() !== new Date(previous.created_at).toDateString();
                      const isImage = String(message.attachment_mime || '').startsWith('image/');
                      return (
                        <div key={message.id}>
                          {showDay && (
                            <div className="my-4 flex items-center gap-3">
                              <span className="h-px flex-1 bg-white/5" />
                              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-600">
                                {dayLabel(message.created_at)}
                              </span>
                              <span className="h-px flex-1 bg-white/5" />
                            </div>
                          )}
                          <div className={cx('flex gap-2', isOwn ? 'justify-end' : 'justify-start')}>
                            {!isOwn && (
                              <Avatar name={message.sender_name} src={message.sender_avatar} size="xs" className="mt-auto" />
                            )}
                            <div className={cx('max-w-[82%] sm:max-w-[70%]', isOwn ? 'items-end' : 'items-start')}>
                              {!isOwn && (
                                <p className="mb-1 px-1 text-[10px] text-slate-500">
                                  {message.sender_name} · {roleLabel(message.sender_role)}
                                </p>
                              )}
                              <div
                                className={cx(
                                  'rounded-2xl border px-3.5 py-2.5 text-sm leading-6 shadow-sm',
                                  isOwn
                                    ? 'rounded-br-md border-brand-400/30 bg-brand-400/15 text-brand-50'
                                    : 'rounded-bl-md border-white/10 bg-night-800/90 text-slate-200'
                                )}
                              >
                                {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
                                {message.attachment_path && (
                                  <div className={cx(message.body && 'mt-2.5', 'overflow-hidden rounded-xl border border-white/10 bg-night-950/50')}>
                                    {isImage ? (
                                      <a href={message.attachment_path} target="_blank" rel="noreferrer" className="block">
                                        <img
                                          src={message.attachment_path}
                                          alt={message.attachment_name || 'Attachment'}
                                          className="max-h-56 w-full object-cover"
                                        />
                                      </a>
                                    ) : null}
                                    <a
                                      href={message.attachment_path}
                                      target="_blank"
                                      rel="noreferrer"
                                      download={message.attachment_name}
                                      className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-white/5"
                                    >
                                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 text-slate-300">
                                        <IconFileText size={15} />
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-xs font-medium text-slate-200">
                                          {message.attachment_name}
                                        </span>
                                        <span className="block text-[10px] text-slate-500">
                                          {formatFileSize(message.attachment_size)}
                                        </span>
                                      </span>
                                      <IconDownload size={14} className="shrink-0 text-slate-500" />
                                    </a>
                                  </div>
                                )}
                              </div>
                              <p className={cx('mt-1 px-1 text-[9px] text-slate-600', isOwn ? 'text-right' : '')}>
                                {formatDateTime(message.created_at)}
                                {isOwn && <span className="ml-1.5">{message.read_at ? '· Read' : '· Sent'}</span>}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={endRef} />
                  </div>
                )}
              </div>

              <form onSubmit={sendMessage} className="shrink-0 border-t border-white/10 bg-night-900/50 p-3 sm:p-4">
                {file && (
                  <div className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2">
                    <IconFileText size={14} className="shrink-0 text-brand-300" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-slate-200">{file.name}</p>
                      <p className="text-[10px] text-slate-500">{formatFileSize(file.size)}</p>
                    </div>
                    <IconButton label="Remove attachment" onClick={clearFile}>
                      <IconX size={14} />
                    </IconButton>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_FILES}
                    onChange={onFileChange}
                    className="hidden"
                    aria-label="Attach a document"
                  />
                  <IconButton
                    label="Attach a document"
                    className="mb-0.5 h-10 w-10 shrink-0 rounded-xl border border-white/10 bg-white/[0.03]"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <IconPaperclip size={17} />
                  </IconButton>
                  <textarea
                    value={composer}
                    onChange={(event) => setComposer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        sendMessage();
                      }
                    }}
                    rows={1}
                    placeholder="Write a message… (Enter to send, Shift+Enter for a new line)"
                    className="input max-h-32 min-h-[42px] flex-1 resize-none py-2.5"
                    aria-label="Message"
                  />
                  <Button type="submit" size="sm" loading={sending} className="mb-0.5 h-10 shrink-0">
                    <IconSend size={15} /> <span className="hidden sm:inline">Send</span>
                  </Button>
                </div>
                <p className="mt-1.5 text-[10px] text-slate-600">
                  Attach PDF, Office, text, archive or image files up to 8 MB.
                </p>
              </form>
            </>
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <EmptyState
                icon={IconChatBubble}
                title={isInstructor ? 'Select a student conversation' : 'Start a conversation'}
                message={
                  isInstructor
                    ? 'Choose a student from your inbox or start a new conversation to answer a question.'
                    : 'Ask your instructor about a lesson, lab, quiz or assignment. You can attach documents and screenshots.'
                }
                action={
                  <Button onClick={openNewChat}>
                    <IconPlus size={15} /> New conversation
                  </Button>
                }
                className="border-0"
              />
            </div>
          )}
        </section>
      </Card>

      <Modal
        open={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        title={isInstructor ? 'Message a student' : 'Message an instructor'}
        description={
          isInstructor
            ? 'Students enrolled in your courses are listed below.'
            : 'Only instructors of courses you are enrolled in can be messaged.'
        }
        size="md"
      >
        <div className="relative">
          <IconSearch size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={contactSearch}
            onChange={(event) => setContactSearch(event.target.value)}
            placeholder="Search people or courses…"
            className="input py-2 pl-8 text-sm"
            aria-label="Search contacts"
          />
        </div>

        <div className="mt-3 max-h-[320px] space-y-1.5 overflow-y-auto">
          {filteredContacts.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">
              {contacts.length === 0
                ? isInstructor
                  ? 'No enrolled students yet. Students appear here once they join one of your courses.'
                  : 'No instructors available yet. Enrol in a course to contact its instructor.'
                : 'No contacts match your search.'}
            </p>
          ) : (
            filteredContacts.map((contact) => (
              <button
                key={contact.id}
                type="button"
                disabled={creating}
                onClick={() => startConversation(contact)}
                className="flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-left transition hover:border-brand-400/25 hover:bg-white/[0.04] disabled:opacity-50"
              >
                <Avatar name={contact.full_name} src={contact.avatar_url} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-100">{contact.full_name}</span>
                    <Badge tone={contact.role === 'instructor' ? 'brand' : 'accent'} className="!px-1.5 !py-0 !text-[9px]">
                      {roleLabel(contact.role)}
                    </Badge>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                    {contact.headline || (contact.courses || []).map((course) => course.title).join(' · ') || contact.email}
                  </span>
                </span>
                {contact.conversation_id ? (
                  <Badge tone="emerald" className="shrink-0">
                    Open
                  </Badge>
                ) : (
                  <IconArrowRight size={14} className="shrink-0 text-slate-500" />
                )}
              </button>
            ))
          )}
        </div>
      </Modal>
    </div>
  );
}
