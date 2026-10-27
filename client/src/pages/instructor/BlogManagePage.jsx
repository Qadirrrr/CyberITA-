import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import Markdown from '../../components/Markdown';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
} from '../../components/ui';
import {
  IconBookOpen,
  IconEdit,
  IconEye,
  IconPlus,
  IconSearch,
  IconSend,
  IconTrash,
} from '../../components/icons';
import { formatDate } from '../../lib/format';

const emptyPost = { title: '', excerpt: '', content: '', coverImage: '', tags: '', status: 'draft' };

export default function BlogManagePage() {
  const toast = useToast();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('draft');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/posts', { params: { status, limit: 60 } });
      setPosts(data.posts || []);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load blog posts.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return posts;
    return posts.filter((post) => `${post.title} ${post.excerpt}`.toLowerCase().includes(term));
  }, [posts, search]);

  const openPost = async (post) => {
    if (!post) {
      setModal({ ...emptyPost, status: 'draft' });
      return;
    }
    setModalLoading(true);
    try {
      const { data } = await api.get(`/posts/${post.slug}`);
      const full = data.post;
      setModal({
        id: full.id,
        title: full.title,
        excerpt: full.excerpt || '',
        content: full.content || '',
        coverImage: full.cover_image || '',
        tags: Array.isArray(full.tags) ? full.tags.join(', ') : '',
        status: full.status,
      });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not open that article.'));
    } finally {
      setModalLoading(false);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    const payload = {
      title: modal.title,
      excerpt: modal.excerpt,
      content: modal.content,
      coverImage: modal.coverImage.trim() || null,
      tags: modal.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      status: modal.status,
    };
    try {
      if (modal.id) await api.put(`/posts/${modal.id}`, payload);
      else await api.post('/posts', payload);
      toast.success(modal.id ? 'Article saved.' : 'Article created.');
      setModal(null);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the article.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (post) => {
    const next = post.status === 'published' ? 'draft' : 'published';
    try {
      await api.post(`/posts/${post.id}/status`, { status: next });
      toast.success(next === 'published' ? 'Article published.' : 'Article unpublished.');
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not change the article status.'));
    }
  };

  const remove = async (post) => {
    if (!window.confirm(`Delete "${post.title}"?`)) return;
    try {
      await api.delete(`/posts/${post.id}`);
      toast.success('Article deleted.');
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete the article.'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Articles</h1>
          <p className="mt-1 text-sm text-slate-400">Write technical articles or refine drafts created from approved practical reports.</p>
        </div>
        <Button size="sm" onClick={() => openPost(null)}>
          <IconPlus size={14} /> New article
        </Button>
      </div>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search articles…" className="input pl-9" aria-label="Search posts" />
        </div>
        <div className="flex gap-1.5">
          {['draft', 'published'].map((item) => (
            <button key={item} type="button" onClick={() => setStatus(item)} className={`chip capitalize ${status === item ? 'chip-active' : ''}`}>
              {item}
            </button>
          ))}
        </div>
      </Card>

      {error && <p className="text-sm text-rose-300">{error}</p>}

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={IconBookOpen}
          title="No articles here"
          message={status === 'draft' ? 'Draft articles you create will appear here. Approved reports become drafts you can edit before publishing.' : 'Nothing published yet.'}
          action={<Button size="sm" onClick={() => openPost(null)}><IconPlus size={13} /> New article</Button>}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((post) => (
            <Card key={post.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-night-950">
                {post.cover_image ? (
                  <img src={post.cover_image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <IconBookOpen size={18} className="text-slate-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/blog/${post.slug}`} className="text-sm font-semibold text-white hover:text-brand-200">{post.title}</Link>
                  <Badge tone={post.status === 'published' ? 'emerald' : 'amber'}>{post.status}</Badge>
                  {post.report_id && <Badge tone="accent">from report</Badge>}
                </div>
                <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">{post.excerpt}</p>
                <p className="mt-1 text-[10px] text-slate-600">
                  {post.author_name || 'CyberITA+'} · {post.status === 'published' ? `published ${formatDate(post.published_at)}` : `updated ${formatDate(post.updated_at)}`}
                  {post.status === 'published' ? ` · ${post.view_count ?? 0} views` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button as={Link} to={`/blog/${post.slug}`} size="sm" variant="ghost">
                  <IconEye size={13} /> View
                </Button>
                <Button size="sm" variant="secondary" onClick={() => openPost(post)} disabled={modalLoading}>
                  <IconEdit size={13} /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => toggleStatus(post)}>
                  {post.status === 'published' ? 'Unpublish' : 'Publish'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove(post)} aria-label="Delete article">
                  <IconTrash size={13} className="text-slate-500" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(modal)}
        onClose={() => setModal(null)}
        title={modal?.id ? 'Edit article' : 'New article'}
        size="xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}>{modal?.id ? 'Save article' : 'Create article'}</Button>
          </>
        }
      >
        {modalLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : modal ? (
          <form onSubmit={save} className="space-y-4">
            <Input label="Title" value={modal.title} onChange={(event) => setModal((current) => ({ ...current, title: event.target.value }))} required />
            <Textarea label="Excerpt" rows={2} value={modal.excerpt} onChange={(event) => setModal((current) => ({ ...current, excerpt: event.target.value }))} hint="Shown on blog cards and in search results." />
            <Textarea
              label="Content (markdown)"
              rows={14}
              value={modal.content}
              onChange={(event) => setModal((current) => ({ ...current, content: event.target.value }))}
              className="font-mono text-[12px]"
              required
            />
            <details className="rounded-xl border border-white/10 bg-night-950/40 p-3">
              <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-slate-500">Preview markdown</summary>
              <div className="mt-3 max-h-72 overflow-y-auto">
                <Markdown>{modal.content}</Markdown>
              </div>
            </details>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Cover image URL" value={modal.coverImage} onChange={(event) => setModal((current) => ({ ...current, coverImage: event.target.value }))} />
              <Input label="Tags" value={modal.tags} onChange={(event) => setModal((current) => ({ ...current, tags: event.target.value }))} hint="Comma separated, up to 10." />
            </div>
            <Select label="Status" value={modal.status} onChange={(event) => setModal((current) => ({ ...current, status: event.target.value }))}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </Select>
            {modal.status === 'published' && (
              <p className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                <IconSend size={12} /> Saving will make this article publicly visible.
              </p>
            )}
          </form>
        ) : null}
      </Modal>
    </div>
  );
}
