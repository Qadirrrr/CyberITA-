import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import Markdown from '../../components/Markdown';
import { Alert, Avatar, Badge, Button, Card, Skeleton } from '../../components/ui';
import { IconArrowLeft, IconClock, IconEye, IconFileText } from '../../components/icons';
import { formatDate } from '../../lib/format';

function readingTime(content = '') {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export default function BlogDetailPage() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .get(`/posts/${slug}`)
      .then((res) => setData(res.data))
      .catch((err) => setError(getErrorMessage(err, 'Article not found.')))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="container-page max-w-4xl py-12">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="mt-4 h-5 w-1/2" />
        <Skeleton className="mt-8 h-96 w-full" />
      </div>
    );
  }

  if (error || !data?.post) {
    return (
      <div className="container-page max-w-3xl py-20">
        <Alert tone="error" title="Article unavailable">
          {error || 'This article could not be found.'}
        </Alert>
        <Button as={Link} to="/blog" variant="secondary" className="mt-4">
          Back to the blog
        </Button>
      </div>
    );
  }

  const { post, related } = data;

  return (
    <article>
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="container-page relative max-w-4xl py-10 lg:py-14">
          <Link to="/blog" className="inline-flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-brand-300">
            <IconArrowLeft size={13} /> Back to the blog
          </Link>
          <div className="mt-4 flex flex-wrap gap-2">
            {(post.tags || []).map((tag) => (
              <Badge key={tag} tone="brand">
                {tag}
              </Badge>
            ))}
          </div>
          <h1 className="mt-4 text-balance font-display text-3xl font-semibold leading-tight sm:text-4xl">{post.title}</h1>
          {post.excerpt && <p className="mt-4 max-w-3xl text-base leading-7 text-slate-400">{post.excerpt}</p>}

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/5 pt-5">
            <div className="flex items-center gap-2.5">
              <Avatar name={post.author_name || 'CyberITA+'} src={post.author_avatar} size="sm" />
              <div>
                <p className="text-sm font-medium text-white">{post.author_name || 'CyberITA+'}</p>
                <p className="text-[11px] text-slate-500">{post.author_headline || 'CyberITA+ contributor'}</p>
              </div>
            </div>
            <span className="text-xs text-slate-500">{formatDate(post.published_at)}</span>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <IconClock size={13} /> {readingTime(post.content)} min read
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <IconEye size={13} /> {post.view_count} views
            </span>
            {post.lab_title && (
              <span className="inline-flex items-center gap-1.5 text-xs text-brand-300">
                <IconFileText size={13} /> From the “{post.lab_title}” lab
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="container-page max-w-4xl py-8 lg:py-10">
        <Card className="p-6 sm:p-8">
          <Markdown>{post.content}</Markdown>
        </Card>

        {related?.length > 0 && (
          <div className="mt-12">
            <h2 className="font-display text-lg font-semibold">Keep reading</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              {related.map((item) => (
                <Link key={item.slug} to={`/blog/${item.slug}`} className="card card-hover group p-5">
                  <h3 className="line-clamp-2 text-sm font-semibold text-white group-hover:text-brand-200">{item.title}</h3>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{item.excerpt}</p>
                  <p className="mt-3 text-[11px] text-slate-600">{formatDate(item.published_at)}</p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    </article>
  );
}
