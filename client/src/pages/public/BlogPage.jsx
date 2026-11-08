import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { Alert, Avatar, Badge, Button, Card, EmptyState, Pagination, Skeleton } from '../../components/ui';
import { IconArrowRight, IconFileText, IconSearch, IconUsers } from '../../components/icons';
import { formatDate } from '../../lib/format';

function coverFor(post) {
  if (post.cover_image) {
    return (
      <img
        src={post.cover_image}
        alt=""
        loading="lazy"
        className="h-44 w-full object-cover opacity-85 transition duration-500 group-hover:scale-105"
      />
    );
  }
  return (
    <div className="relative flex h-44 items-center justify-center bg-slate-900">
      <IconFileText size={44} className="text-brand-300/40" strokeWidth={1.2} />
    </div>
  );
}

export default function BlogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [tag, setTag] = useState(searchParams.get('tag') || '');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const [data, setData] = useState({ posts: [], total: 0, tags: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .get('/posts', { params: { search: search || undefined, tag: tag || undefined, page, limit: 9 } })
      .then((res) => active && setData(res.data))
      .catch((err) => active && setError(getErrorMessage(err, 'Unable to load articles.')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [search, tag, page]);

  useEffect(() => {
    const params = {};
    if (search) params.search = search;
    if (tag) params.tag = tag;
    if (page > 1) params.page = String(page);
    setSearchParams(params, { replace: true });
  }, [search, tag, page, setSearchParams]);

  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="container-page relative py-12 lg:py-16">
          <Badge tone="brand" className="mb-4">
            <IconFileText size={13} /> The lab notebook
          </Badge>
          <h1 className="max-w-2xl text-balance font-display text-3xl font-semibold sm:text-4xl lg:text-5xl">
            Practical write-ups, walkthroughs and learner reports
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
            Articles are grounded in work actually performed in the lab: approved reports, instructor guides and
            technical explainers you can follow along with.
          </p>

          <div className="mt-8 flex max-w-xl items-center gap-3">
            <div className="relative flex-1">
              <IconSearch size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search articles…"
                className="input pl-10"
                aria-label="Search articles"
              />
            </div>
            {(search || tag) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  setTag('');
                  setPage(1);
                }}
              >
                Clear
              </Button>
            )}
          </div>

          {data.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setTag('');
                  setPage(1);
                }}
                className={`chip ${
                  tag === '' ? 'border-brand-400/40 bg-brand-400/10 text-brand-200' : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                All topics
              </button>
              {data.tags.slice(0, 12).map((item) => (
                <button
                  key={item.tag}
                  type="button"
                  onClick={() => {
                    setTag(item.tag);
                    setPage(1);
                  }}
                  className={`chip ${
                    tag === item.tag
                      ? 'border-brand-400/40 bg-brand-400/10 text-brand-200'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  {item.tag} <span className="text-slate-600">{item.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="container-page py-10 lg:py-14">
        {error && (
          <Alert tone="error" className="mb-6">
            {error}
          </Alert>
        )}

        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="overflow-hidden">
                <Skeleton className="h-44 rounded-none" />
                <div className="space-y-3 p-5">
                  <Skeleton className="h-5 w-4/5" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </Card>
            ))}
          </div>
        ) : data.posts.length === 0 ? (
          <EmptyState
            icon={IconFileText}
            title={search || tag ? 'No articles match your search' : 'No articles published yet'}
            message={
              search || tag
                ? 'Try a different keyword or topic.'
                : 'Approved lab reports and instructor guides will be published here.'
            }
          />
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {(data?.posts || []).map((post) => (
                <Link key={post.id} to={`/blog/${post.slug}`} className="card card-hover group flex flex-col overflow-hidden">
                  <div className="overflow-hidden">{coverFor(post)}</div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex flex-wrap gap-2">
                      {(post.tags || []).slice(0, 2).map((item) => (
                        <Badge key={item} tone="slate">
                          {item}
                        </Badge>
                      ))}
                    </div>
                    <h2 className="mt-3 line-clamp-2 font-display text-lg font-semibold leading-snug text-white group-hover:text-brand-200">
                      {post.title}
                    </h2>
                    <p className="mt-2 line-clamp-3 flex-1 text-sm leading-6 text-slate-400">{post.excerpt}</p>
                    <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
                      <div className="flex items-center gap-2">
                        <Avatar name={post.author_name || 'CyberITA+'} src={post.author_avatar} size="xs" />
                        <span className="text-xs text-slate-500">{post.author_name || 'CyberITA+'}</span>
                      </div>
                      <span className="text-xs text-slate-500">{formatDate(post.published_at)}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <Pagination page={page} limit={9} total={data.total} onPageChange={setPage} />
          </>
        )}

        <Card className="mt-12 border-brand-400/20 bg-brand-50/60 p-6 dark:bg-brand-400/5 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div>
              <h2 className="font-display text-xl font-semibold">Your lab report could be featured here</h2>
              <p className="mt-1 max-w-xl text-sm leading-6 text-slate-400">
                Complete a lab, generate your practical report and submit it for review. Approved reports are published
                under your name as a public portfolio of verified work.
              </p>
            </div>
            <Button as={Link} to="/register">
              Start a lab <IconArrowRight size={16} />
            </Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
