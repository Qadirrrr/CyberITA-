import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import CourseCard from '../../components/CourseCard';
import { Alert, Badge, Button, Card, EmptyState, Input, Pagination, Select, Skeleton } from '../../components/ui';
import { IconBookOpen, IconFilter, IconSearch, IconX } from '../../components/icons';

const levels = [
  { value: '', label: 'All levels' },
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export default function CoursesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [level, setLevel] = useState(searchParams.get('level') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'newest');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);
  const [data, setData] = useState({ courses: [], total: 0 });
  const [meta, setMeta] = useState({ categories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const noFilters = !search && !category && !level;

  useEffect(() => {
    api
      .get('/courses/meta/filters')
      .then((res) => setMeta(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api
      .get('/courses', {
        params: {
          search: search || undefined,
          category: category || undefined,
          level: level || undefined,
          sort,
          page,
          limit: 12,
        },
      })
      .then((res) => {
        if (!active) return;
        setData(res.data);
      })
      .catch((err) => active && setError(getErrorMessage(err, 'Unable to load courses.')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [search, category, level, sort, page]);

  useEffect(() => {
    const params = {};
    if (search) params.search = search;
    if (category) params.category = category;
    if (level) params.level = level;
    if (sort !== 'newest') params.sort = sort;
    if (page > 1) params.page = String(page);
    setSearchParams(params, { replace: true });
  }, [search, category, level, sort, page, setSearchParams]);

  const activeFilters = useMemo(
    () =>
      [
        search && { key: 'search', label: `"${search}"`, clear: () => setSearch('') },
        category && { key: 'category', label: category, clear: () => setCategory('') },
        level && { key: 'level', label: levels.find((item) => item.value === level)?.label, clear: () => setLevel('') },
      ].filter(Boolean),
    [search, category, level]
  );

  const resetAll = () => {
    setSearch('');
    setCategory('');
    setLevel('');
    setSort('newest');
    setPage(1);
  };

  return (
    <div>
      <section className="relative overflow-hidden border-b border-white/5">
        <div className="pointer-events-none absolute inset-0 bg-hero-glow opacity-70" />
        <div className="container-page relative py-12 lg:py-16">
          <Badge tone="brand" className="mb-4">
            <IconBookOpen size={13} /> Course catalog
          </Badge>
          <h1 className="max-w-2xl text-balance font-display text-3xl font-semibold sm:text-4xl lg:text-5xl">
            Practical courses that put you in the terminal
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400 sm:text-base">
            Every course combines concise theory with runnable labs, verified steps and instructor-reviewed reports.
            Filter by topic or level to find your next skill.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_0.9fr]">
            <div className="relative">
              <IconSearch size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search courses, topics or categories…"
                className="input pl-10"
                aria-label="Search courses"
              />
            </div>
            <select
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
              className="input"
              aria-label="Filter by category"
            >
              <option value="">All categories</option>
              {(meta?.categories || []).map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <select
              value={level}
              onChange={(event) => {
                setLevel(event.target.value);
                setPage(1);
              }}
              className="input"
              aria-label="Filter by level"
            >
              {levels.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <select value={sort} onChange={(event) => setSort(event.target.value)} className="input" aria-label="Sort courses">
              <option value="newest">Newest</option>
              <option value="popular">Most popular</option>
              <option value="title">A-Z</option>
            </select>
          </div>

          {(activeFilters.length > 0 || sort !== 'newest') && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <IconFilter size={13} /> Filters:
              </span>
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={filter.clear}
                  className="chip border-white/10 bg-white/5 text-slate-300 hover:border-rose-400/30 hover:text-rose-300"
                >
                  {filter.label} <IconX size={12} />
                </button>
              ))}
              {sort !== 'newest' && (
                <button
                  type="button"
                  onClick={() => setSort('newest')}
                  className="chip border-white/10 bg-white/5 text-slate-300 hover:border-rose-400/30 hover:text-rose-300"
                >
                  Sort: {sort} <IconX size={12} />
                </button>
              )}
              <button type="button" onClick={resetAll} className="text-xs text-slate-500 underline-offset-4 hover:text-white hover:underline">
                Clear all
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="container-page py-10 lg:py-14">
        {error && (
          <Alert tone="error" title="Could not load courses" className="mb-6">
            {error}
          </Alert>
        )}

        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-slate-400">
            {loading ? 'Loading catalog…' : `${data.total} ${data.total === 1 ? 'course' : 'courses'} available`}
          </p>
        </div>

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="overflow-hidden">
                <Skeleton className="h-44 rounded-none" />
                <div className="space-y-3 p-5">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </Card>
            ))}
          </div>
        ) : data.courses.length === 0 ? (
          <EmptyState
            icon={IconBookOpen}
            title={noFilters ? 'No courses published yet' : 'No courses match your filters'}
            message={noFilters ? 'New practical courses are added regularly. Check back soon.' : 'Try a different keyword, category or level.'}
            action={
              !noFilters ? (
                <Button variant="secondary" onClick={resetAll}>
                  Reset filters
                </Button>
              ) : (
                <Button as={Link} to="/learning-paths">
                  Explore learning paths
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {(data?.courses || []).map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
            <Pagination page={page} limit={data.limit || 12} total={data.total} onPageChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}
