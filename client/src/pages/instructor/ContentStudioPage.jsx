import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Input, Select, Skeleton, Textarea } from '../../components/ui';
import { IconArrowRight, IconBookOpen, IconCheckCircle, IconEye, IconTerminal, IconZap } from '../../components/icons';
import { DIFFICULTIES } from '../../lib/constants';

const initialForm = {
  title: '', details: '', courseId: '', lessonId: '', difficulty: 'intermediate', publish: true,
  stepCount: 8, isPractice: false, dueInDays: 7, timeLimitMinutes: 0,
};

export default function ContentStudioPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [form, setForm] = useState(initialForm);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/courses', { params: { all: true, limit: 60 } })
      .then(({ data }) => {
        if (!active) return;
        const list = data.courses || [];
        setCourses(user?.role === 'admin' ? list : list.filter((course) => course.instructor_id === user?.id));
      })
      .catch((err) => active && setError(getErrorMessage(err, 'Could not load your courses.')))
      .finally(() => active && setLoadingCourses(false));
    return () => { active = false; };
  }, [user]);

  const selectedCourse = useMemo(() => courses.find((course) => String(course.id) === String(form.courseId)), [courses, form.courseId]);

  const loadLessons = async (courseId) => {
    setForm((current) => ({ ...current, courseId, lessonId: '' }));
    if (!courseId) return setLessons([]);
    const course = courses.find((item) => String(item.id) === String(courseId));
    if (!course?.slug) return;
    try {
      const { data } = await api.get(`/courses/${course.slug}`);
      setLessons((data.modules || []).flatMap((module) => (module.lessons || []).map((lesson) => ({ ...lesson, moduleTitle: module.title }))));
    } catch {
      setLessons([]);
    }
  };

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));

  const generate = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return toast.error('Add a title for the lab assignment.');
    if (!form.isPractice && !form.courseId) return toast.error('Choose a course for this lab assignment.');
    setGenerating(true);
    setResult(null);
    try {
      const { data } = await api.post('/content/generate', {
        title: form.title.trim(), details: form.details.trim(), courseId: form.isPractice ? null : Number(form.courseId),
        lessonId: form.isPractice || !form.lessonId ? null : Number(form.lessonId), difficulty: form.difficulty,
        publish: Boolean(form.publish), stepCount: Math.max(3, Number(form.stepCount) || 8), isPractice: Boolean(form.isPractice),
        dueInDays: form.isPractice ? null : Math.max(1, Number(form.dueInDays) || 7),
        timeLimitMinutes: Math.max(0, Number(form.timeLimitMinutes) || 0),
      }, { timeout: 120000 });
      setResult(data);
      toast.success(form.publish ? 'Lab assignment generated and published.' : 'Lab assignment saved as a draft.');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not generate the lab assignment.'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Lab assignment studio</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">Generate one accurate, runnable lab assignment with verified steps, an optional deadline, and instructor review.</p>
        </div>
        <Badge tone="brand"><IconZap size={12} /> Lab-only blueprint</Badge>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="p-6">
          <form onSubmit={generate} className="space-y-5">
            <Input label="Lab assignment title" placeholder="Enter lab assignment title" value={form.title} onChange={update('title')} required />
            <Textarea label="Scenario and learning objectives" rows={5} value={form.details} onChange={update('details')} placeholder="Enter scenario and objectives" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label={form.isPractice ? 'Course (not used for practice)' : 'Course'} value={form.courseId} disabled={form.isPractice || loadingCourses} onChange={(event) => loadLessons(event.target.value)} required={!form.isPractice}>
                <option value="">{form.isPractice ? 'Practice lab' : 'Select a course'}</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}
              </Select>
              <Select label="Attach to lesson (optional)" value={form.lessonId} disabled={!form.courseId || form.isPractice} onChange={update('lessonId')}>
                <option value="">Course-wide</option>
                {lessons.map((lesson) => <option key={lesson.id} value={lesson.id}>{lesson.moduleTitle ? `${lesson.moduleTitle} · ` : ''}{lesson.title}</option>)}
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Select label="Difficulty" value={form.difficulty} onChange={update('difficulty')}>
                {Object.entries(DIFFICULTIES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
              </Select>
              <Input label="Verified steps" type="number" min="3" max="12" value={form.stepCount} onChange={update('stepCount')} />
              <Input label="Due in days" type="number" min="1" max="120" value={form.dueInDays} onChange={update('dueInDays')} disabled={form.isPractice} />
              <Input label="Time limit (min)" type="number" min="0" max="600" value={form.timeLimitMinutes} onChange={update('timeLimitMinutes')} hint="0 = no custom limit" />
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
              <Checkbox label={form.isPractice ? 'Practice lab (not graded)' : 'Course lab assignment (instructor-reviewed)'} checked={form.isPractice} onChange={update('isPractice')} />
              <Checkbox label={form.publish ? 'Publish immediately' : 'Save as draft'} checked={form.publish} onChange={update('publish')} />
            </div>
            <div className="flex justify-end border-t border-white/5 pt-4">
              <Button type="submit" loading={generating} disabled={loadingCourses}><IconZap size={14} /> Generate lab assignment</Button>
            </div>
          </form>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="font-display text-base font-semibold">Generation summary</h2>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Course</dt><dd className="truncate text-right text-slate-300">{form.isPractice ? 'Practice' : selectedCourse?.title || 'Not selected'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Activity</dt><dd className="text-right text-slate-300">{form.stepCount} verified steps</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Review</dt><dd className="text-right text-slate-300">{form.isPractice ? 'Not graded' : 'Instructor reviewed'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Deadline</dt><dd className="text-right text-slate-300">{form.isPractice ? 'None' : `${form.dueInDays} days`}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-slate-500">Time limit</dt><dd className="text-right text-slate-300">{Number(form.timeLimitMinutes) > 0 ? `${form.timeLimitMinutes} minutes` : 'None'}</dd></div>
            </dl>
          </Card>
          <Card className="p-5">
            <h2 className="font-display text-base font-semibold">This session</h2>
            {result?.lab ? (
              <div className="mt-3 space-y-3">
                <Link to={`/instructor/labs/${result.lab.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs hover:border-brand-400/30 hover:text-brand-200">
                  <span className="flex min-w-0 items-center gap-2"><IconTerminal size={13} className="text-brand-300" /><span className="truncate">{result.lab.title}</span></span><IconArrowRight size={13} />
                </Link>
                <Button as={Link} to={`/labs/${result.lab.id}`} size="sm" variant="secondary" className="w-full"><IconEye size={13} /> Preview lab</Button>
                <p className="flex items-center gap-1.5 text-[11px] text-emerald-300"><IconCheckCircle size={12} /> Saved and ready to review.</p>
              </div>
            ) : <EmptyState icon={IconBookOpen} title="Nothing generated yet" message="Describe a practical scenario and generate a lab assignment." className="mt-3 border-0 bg-transparent p-0" />}
          </Card>
          <Card className="p-5">
            <h2 className="font-display text-base font-semibold">Author manually</h2>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">Build the lab step by step when you need custom verification commands or evidence requirements.</p>
            <Button as={Link} to="/instructor/labs" size="sm" variant="ghost" className="mt-3 w-full justify-between"><span className="flex items-center gap-2"><IconTerminal size={13} /> Lab builder</span><IconArrowRight size={13} /></Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
