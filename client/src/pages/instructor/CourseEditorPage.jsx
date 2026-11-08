import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import api, { getErrorMessage } from '../../lib/api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Modal,
  ProgressBar,
  Select,
  Skeleton,
  Textarea,
} from '../../components/ui';
import {
  IconArrowLeft,
  IconBookOpen,
  IconCheckCircle,
  IconEdit,
  IconPlus,
  IconTerminal,
  IconTrash,
  IconUsers,
} from '../../components/icons';
import { CATEGORIES, DIFFICULTIES, SUBCATEGORY_SUGGESTIONS } from '../../lib/constants';
import { formatDate, formatDateTime } from '../../lib/format';

const tabs = [
  { id: 'details', label: 'Details' },
  { id: 'curriculum', label: 'Curriculum' },
  { id: 'labs', label: 'Lab assignments' },
  { id: 'students', label: 'Students' },
];

const emptyDetails = {
  title: '',
  summary: '',
  description: '',
  category: 'Linux',
  subcategory: '',
  level: 'beginner',
  durationHours: 0,
  price: 0,
  coverImage: '',
  tags: '',
  status: 'draft',
  instructorId: '',
};

export default function CourseEditorPage() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [details, setDetails] = useState(emptyDetails);
  const [data, setData] = useState(null);
  const [instructors, setInstructors] = useState([]);
  const [tab, setTab] = useState(location.state?.tab === 'curriculum' ? 'curriculum' : 'details');
  const [newModules, setNewModules] = useState([{ title: '', description: '' }]);
  const [newLessons, setNewLessons] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isNew && user && !isAdmin) {
      toast.error('Only administrators can create courses. Courses assigned to you appear in your course list.');
      navigate('/instructor/courses', { replace: true });
    }
  }, [isNew, user, isAdmin, navigate, toast]);

  useEffect(() => {
    if (isAdmin) {
      api.get('/users', { params: { role: 'instructor', limit: 100 } })
        .then((res) => setInstructors(res.data.users || []))
        .catch(() => {});
    }
  }, [isAdmin]);

  const [moduleModal, setModuleModal] = useState(null);
  const [lessonModal, setLessonModal] = useState(null);
  const [lessonLoading, setLessonLoading] = useState(false);
  const [labModal, setLabModal] = useState(null);
  const [modalSaving, setModalSaving] = useState(false);

  const load = async ({ silent = false } = {}) => {
    if (isNew) return;
    if (!silent) setLoading(true);
    try {
      const { data: response } = await api.get(`/courses/${id}/manage`);
      setData(response);
      const course = response.course;
      setDetails({
        title: course.title || '',
        summary: course.summary || '',
        description: course.description || '',
        category: course.category || 'Linux',
        subcategory: course.subcategory || '',
        level: course.level || 'beginner',
        durationHours: course.duration_hours ?? 0,
        price: course.price ?? 0,
        coverImage: course.cover_image || '',
        tags: Array.isArray(course.tags) ? course.tags.join(', ') : '',
        status: course.status || 'draft',
        instructorId: course.instructor_id || '',
      });
      setError('');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load this course.'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const lessons = useMemo(
    () => (data?.modules || []).flatMap((module) => (module?.lessons || []).map((lesson) => ({ ...lesson, moduleTitle: module.title }))),
    [data]
  );

  const updateDetail = (field) => (event) => setDetails((current) => ({ ...current, [field]: event.target.value }));

  const updateNewModule = (index, field) => (event) =>
    setNewModules((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: event.target.value } : row)));

  const addNewModule = () => setNewModules((current) => [...current, { title: '', description: '' }]);

  const removeNewModule = (index) =>
    setNewModules((current) => (current.length === 1 ? [{ title: '', description: '' }] : current.filter((_, rowIndex) => rowIndex !== index)));

  const addNewLesson = () =>
    setNewLessons((current) => [
      ...current,
      { title: '', moduleIndex: -1, type: 'reading', duration: 10, content: '' },
    ]);

  const updateNewLesson = (index, field) => (event) =>
    setNewLessons((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: event.target.value } : row))
    );

  const removeNewLesson = (index) =>
    setNewLessons((current) => current.filter((_, rowIndex) => rowIndex !== index));

  const updateCategory = (event) => {
    const category = event.target.value;
    setDetails((current) => {
      const allowed = SUBCATEGORY_SUGGESTIONS[category] || [];
      const keep = allowed.includes(current.subcategory) ? current.subcategory : '';
      return { ...current, category, subcategory: keep };
    });
  };

  // Keep the dropdown on the canonical category list, but never hide a value
  // already stored on an older course.
  const categoryOptions = useMemo(() => {
    const current = (details.category || '').trim();
    return current && !CATEGORIES.includes(current) ? [...CATEGORIES, current] : CATEGORIES;
  }, [details.category]);

  // Subcategory options follow the selected category; keep any existing custom
  // value so older courses don't lose data when edited.
  const subcategoryOptions = useMemo(() => {
    const suggestions = SUBCATEGORY_SUGGESTIONS[details.category] || [];
    const current = (details.subcategory || '').trim();
    return current && !suggestions.includes(current) ? [...suggestions, current] : suggestions;
  }, [details.category, details.subcategory]);

  const saveDetails = async (event) => {
    event?.preventDefault();
    if (!details.title.trim()) {
      toast.error('Give the course a title.');
      return;
    }
    const modulesToCreate = newModules
      .map((module) => ({ title: module.title.trim(), description: module.description.trim() }))
      .filter((module) => module.title);
    const lessonsToCreate = newLessons
      .map((lesson) => ({ ...lesson, title: lesson.title.trim() }))
      .filter((lesson) => lesson.title);
    if (modulesToCreate.some((module) => module.title.length < 2)) {
      toast.error('Module titles need at least 2 characters.');
      return;
    }
    if (lessonsToCreate.some((lesson) => lesson.title.length < 2)) {
      toast.error('Lesson titles need at least 2 characters.');
      return;
    }
    setSaving(true);
    const payload = {
      title: details.title.trim(),
      summary: details.summary.trim(),
      description: details.description,
      category: details.category,
      subcategory: details.subcategory.trim() || 'General',
      level: details.level,
      durationHours: Number(details.durationHours) || 0,
      price: Number(details.price) || 0,
      coverImage: details.coverImage.trim() || null,
      tags: details.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      status: details.status,
    };
    if (isAdmin && details.instructorId) {
      payload.instructorId = Number(details.instructorId);
    }
    try {
      if (isNew) {
        const { data: response } = await api.post('/courses', payload);
        const courseId = response.course.id;
        let failedModules = 0;
        let failedLessons = 0;
        const moduleIds = [];
        for (const module of modulesToCreate) {
          try {
            const { data: moduleResponse } = await api.post(`/courses/${courseId}/modules`, {
              title: module.title,
              description: module.description || null,
            });
            moduleIds.push(moduleResponse.module.id);
          } catch {
            failedModules += 1;
            moduleIds.push(null);
          }
        }
        for (const lesson of lessonsToCreate) {
          const moduleIndex = Number(lesson.moduleIndex);
          const moduleId = moduleIndex >= 0 && moduleIndex < moduleIds.length ? moduleIds[moduleIndex] : null;
          try {
            await api.post(`/courses/${courseId}/lessons`, {
              moduleId,
              title: lesson.title,
              content: lesson.content || '',
              durationMinutes: Number(lesson.duration) || 0,
              lessonType: lesson.type || 'reading',
              isFreePreview: false,
            });
          } catch {
            failedLessons += 1;
          }
        }
        const parts = [];
        if (modulesToCreate.length) {
          parts.push(`${modulesToCreate.length - failedModules} of ${modulesToCreate.length} modules`);
        }
        if (lessonsToCreate.length) {
          parts.push(`${lessonsToCreate.length - failedLessons} of ${lessonsToCreate.length} lessons`);
        }
        if (parts.length === 0) {
          toast.success('Course created. Add your curriculum next.');
        } else if (failedModules > 0 || failedLessons > 0) {
          toast.error(`Course created, but some items could not be added (${parts.join(', ')}).`);
        } else {
          toast.success(`Course created with ${parts.join(' and ')}.`);
        }
        navigate(`/instructor/courses/${courseId}`, { replace: true, state: { tab: 'curriculum' } });
      } else {
        await api.put(`/courses/${id}`, payload);
        toast.success('Course details saved.');
        await load({ silent: true });
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the course.'));
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async () => {
    const next = data.course.status === 'published' ? 'draft' : 'published';
    setSaving(true);
    try {
      await api.put(`/courses/${id}`, { status: next });
      toast.success(next === 'published' ? 'Course published.' : 'Course unpublished.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not change the course status.'));
    } finally {
      setSaving(false);
    }
  };

  // ---------- modules & lessons ----------

  const saveModule = async (event) => {
    event.preventDefault();
    setModalSaving(true);
    try {
      if (moduleModal.id) {
        await api.put(`/courses/modules/${moduleModal.id}`, {
          title: moduleModal.title,
          description: moduleModal.description || null,
        });
      } else {
        await api.post(`/courses/${id}/modules`, {
          title: moduleModal.title,
          description: moduleModal.description || null,
        });
      }
      toast.success(moduleModal.id ? 'Module updated.' : 'Module added.');
      setModuleModal(null);
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the module.'));
    } finally {
      setModalSaving(false);
    }
  };

  const deleteModule = async (module) => {
    if (!window.confirm(`Delete module "${module.title}"? Lessons inside will be removed too.`)) return;
    try {
      await api.delete(`/courses/modules/${module.id}`);
      toast.success('Module deleted.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete the module.'));
    }
  };

  const openLesson = async (lesson, moduleId) => {
    if (!lesson) {
      setLessonModal({
        moduleId: moduleId ?? data.modules[0]?.id ?? '',
        title: '',
        content: '',
        videoUrl: '',
        durationMinutes: 10,
        lessonType: 'reading',
        isFreePreview: false,
      });
      return;
    }
    setLessonModal({ ...lesson, moduleId: lesson.module_id ?? moduleId ?? '', videoUrl: lesson.video_url || '', isFreePreview: Boolean(lesson.is_free_preview) });
    setLessonLoading(true);
    try {
      const { data: response } = await api.get(`/courses/lessons/${lesson.id}`);
      setLessonModal({
        id: lesson.id,
        moduleId: response.lesson.module_id ?? moduleId ?? '',
        title: response.lesson.title,
        content: response.lesson.content || '',
        videoUrl: response.lesson.video_url || '',
        durationMinutes: response.lesson.duration_minutes ?? 10,
        lessonType: response.lesson.lesson_type || 'reading',
        isFreePreview: Boolean(response.lesson.is_free_preview),
      });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not load the lesson.'));
      setLessonModal(null);
    } finally {
      setLessonLoading(false);
    }
  };

  const saveLesson = async (event) => {
    event.preventDefault();
    setModalSaving(true);
    const payload = {
      moduleId: lessonModal.moduleId ? Number(lessonModal.moduleId) : null,
      title: lessonModal.title,
      content: lessonModal.content,
      videoUrl: lessonModal.videoUrl || null,
      durationMinutes: Number(lessonModal.durationMinutes) || 0,
      lessonType: lessonModal.lessonType,
      isFreePreview: Boolean(lessonModal.isFreePreview),
    };
    try {
      if (lessonModal.id) await api.put(`/courses/lessons/${lessonModal.id}`, payload);
      else await api.post(`/courses/${id}/lessons`, payload);
      toast.success(lessonModal.id ? 'Lesson updated.' : 'Lesson added.');
      setLessonModal(null);
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not save the lesson.'));
    } finally {
      setModalSaving(false);
    }
  };

  const deleteLesson = async (lesson) => {
    if (!window.confirm(`Delete lesson "${lesson.title}"?`)) return;
    try {
      await api.delete(`/courses/lessons/${lesson.id}`);
      toast.success('Lesson deleted.');
      await load({ silent: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not delete the lesson.'));
    }
  };

  // ---------- labs ----------

  const saveLab = async (event) => {
    event.preventDefault();
    setModalSaving(true);
    try {
      const { data: response } = await api.post('/labs', {
        title: labModal.title,
        summary: labModal.summary,
        description: labModal.description,
        difficulty: labModal.difficulty,
        estimatedMinutes: Number(labModal.estimatedMinutes) || 30,
        dueAt: labModal.dueAt ? new Date(labModal.dueAt).toISOString() : null,
        courseId: Number(id),
        lessonId: labModal.lessonId ? Number(labModal.lessonId) : null,
        status: labModal.status,
      });
      toast.success('Lab created. Add its steps next.');
      navigate(`/instructor/labs/${response.lab.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not create the lab.'));
    } finally {
      setModalSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (!isNew && (error || !data)) {
    return (
      <div>
        <Alert tone="error" title="Course unavailable">
          {error || 'This course could not be found.'}
        </Alert>
        <Button as={Link} to="/instructor/courses" variant="secondary" className="mt-4">
          Back to courses
        </Button>
      </div>
    );
  }

  const course = data?.course;
  const counts = {
    curriculum: lessons.length,
    labs: data?.labs?.length || 0,
    students: data?.enrollments?.length || 0,
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/instructor/courses" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-brand-300">
            <IconArrowLeft size={13} /> All courses
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-2xl font-semibold">
            {isNew ? 'New course' : course?.title}
            {!isNew && <Badge tone={course?.status === 'published' ? 'emerald' : 'amber'}>{course?.status}</Badge>}
          </h1>
          {!isNew && (
            <p className="mt-1 text-xs text-slate-500">
              {course.enrolled_count ?? 0} learners · created {formatDate(course.created_at)}
            </p>
          )}
        </div>
        {!isNew && (
          <div className="flex flex-wrap gap-2">
            <Button as={Link} to={`/courses/${course.slug}`} size="sm" variant="ghost">
              View public page
            </Button>
            <Button size="sm" variant={course.status === 'published' ? 'secondary' : 'primary'} onClick={togglePublish} loading={saving}>
              {course.status === 'published' ? 'Unpublish' : 'Publish'}
            </Button>
          </div>
        )}
      </div>

      {!isNew && (
        <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-night-900/60 p-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                tab === item.id ? 'bg-white/10 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
              {counts[item.id] != null && <span className="ml-1.5 text-[10px] text-slate-500">{counts[item.id]}</span>}
            </button>
          ))}
        </div>
      )}

      {(isNew || tab === 'details') && (
        <Card className="p-6">
          <form onSubmit={saveDetails} className="space-y-4">
            <Input label="Title" value={details.title} onChange={updateDetail('title')} required placeholder="Enter course title" />
            <Textarea label="Summary" rows={2} value={details.summary} onChange={updateDetail('summary')} placeholder="Enter course summary" />
            <Textarea label="Description (markdown)" rows={7} value={details.description} onChange={updateDetail('description')} placeholder="Enter course description" />

            {isNew && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.02]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Course modules</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      Outline what this course covers. Modules are created with the course, then you can add lessons inside them.
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="secondary" onClick={addNewModule}>
                    <IconPlus size={13} /> Add module
                  </Button>
                </div>
                <div className="mt-4 space-y-3">
                  {newModules.map((module, index) => (
                    <div
                      key={index}
                      className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-night-900/60"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-50 font-mono text-[11px] font-semibold text-brand-700 dark:bg-brand-400/10 dark:text-brand-300">
                          {index + 1}
                        </span>
                        <div className="flex-1 space-y-2">
                          <Input
                            aria-label={`Module ${index + 1} title`}
                            placeholder="Enter module title"
                            value={module.title}
                            onChange={updateNewModule(index, 'title')}
                          />
                          <Input
                            aria-label={`Module ${index + 1} description`}
                            placeholder="Enter module description"
                            value={module.description}
                            onChange={updateNewModule(index, 'description')}
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => removeNewModule(index)}
                          title="Remove module"
                          aria-label={`Remove module ${index + 1}`}
                        >
                          <IconTrash size={14} className="text-slate-400" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-500">
                  Tip: start with 4–6 modules so learners can see the full course outline before enrolling.
                </p>
              </div>
            )}

            {isNew && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.02]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Course lessons</p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      Add lessons that belong to this course. Pick a module for each lesson, or leave it unassigned for course-wide content.
                    </p>
                  </div>
                  <Button type="button" size="sm" variant="secondary" onClick={addNewLesson}>
                    <IconPlus size={13} /> Add lesson
                  </Button>
                </div>
                {newLessons.length === 0 ? (
                  <p className="mt-4 text-xs text-slate-500 dark:text-slate-500">
                    No lessons yet. You can add them now or later from the curriculum tab.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {newLessons.map((lesson, index) => (
                      <div
                        key={index}
                        className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-night-900/60"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="mt-2.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-50 font-mono text-[11px] font-semibold text-brand-700 dark:bg-brand-400/10 dark:text-brand-300">
                            {index + 1}
                          </span>
                          <div className="flex-1 space-y-2">
                            <Input
                              aria-label={`Lesson ${index + 1} title`}
                              placeholder="Lesson title (e.g. Creating users and groups)"
                              value={lesson.title}
                              onChange={updateNewLesson(index, 'title')}
                            />
                            <div className="grid gap-2 sm:grid-cols-3">
                              <Select
                                aria-label={`Lesson ${index + 1} module`}
                                value={lesson.moduleIndex}
                                onChange={updateNewLesson(index, 'moduleIndex')}
                              >
                                <option value={-1}>Unassigned</option>
                                {newModules
                                  .map((module, moduleIndex) => ({ module, moduleIndex }))
                                  .filter(({ module }) => module.title.trim())
                                  .map(({ module, moduleIndex }) => (
                                    <option key={moduleIndex} value={moduleIndex}>
                                      {module.title.trim()}
                                    </option>
                                  ))}
                              </Select>
                              <Select
                                aria-label={`Lesson ${index + 1} type`}
                                value={lesson.type}
                                onChange={updateNewLesson(index, 'type')}
                              >
                                <option value="reading">Reading</option>
                                <option value="video">Video</option>
                                <option value="lab">Lab</option>
                              </Select>
                              <Input
                                type="number"
                                min="0"
                                aria-label={`Lesson ${index + 1} duration`}
                                placeholder="Minutes"
                                value={lesson.duration}
                                onChange={updateNewLesson(index, 'duration')}
                              />
                            </div>
                            <Textarea
                              rows={2}
                              aria-label={`Lesson ${index + 1} content`}
                              placeholder="Lesson content (markdown, optional)"
                              value={lesson.content}
                              onChange={updateNewLesson(index, 'content')}
                            />
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => removeNewLesson(index)}
                            title="Remove lesson"
                            aria-label={`Remove lesson ${index + 1}`}
                          >
                            <IconTrash size={14} className="text-slate-400" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-500">
                  Tip: keep lessons short and focused; you can attach labs and videos after creating the course.
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Select label="Category" id="course-category" value={details.category} onChange={updateCategory}>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Select label="Subcategory" id="course-subcategory" value={details.subcategory} onChange={updateDetail('subcategory')}>
                  <option value="">Select subcategory</option>
                  {subcategoryOptions.map((subcategory) => (
                    <option key={subcategory} value={subcategory}>{subcategory}</option>
                  ))}
                </Select>
              </div>
              <Select label="Level" value={details.level} onChange={updateDetail('level')}>
                {Object.entries(DIFFICULTIES).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </Select>
              <Input label="Duration (hours)" type="number" min="0" step="0.5" value={details.durationHours} onChange={updateDetail('durationHours')} />
              <Input label="Price (USD)" type="number" min="0" step="1" value={details.price} onChange={updateDetail('price')} hint="Use 0 for free courses." />
            </div>
            <Input label="Cover image URL" value={details.coverImage} onChange={updateDetail('coverImage')} placeholder="Enter cover image URL" />
            <Input label="Tags" value={details.tags} onChange={updateDetail('tags')} placeholder="Enter tags" hint="Comma separated, up to 12." />
            <Select label="Status" value={details.status} onChange={updateDetail('status')}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="archived">Archived</option>
            </Select>
            {isAdmin && (
              <Select
                label="Assigned Instructor (Admin Control)"
                value={details.instructorId || ''}
                onChange={updateDetail('instructorId')}
                hint="Assign or reassign teaching and evaluation authority for this course to an instructor."
              >
                <option value="">Default (Current Staff / Self)</option>
                {instructors.map((inst) => (
                  <option key={inst.id} value={inst.id}>
                    {inst.full_name} ({inst.email})
                  </option>
                ))}
              </Select>
            )}
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                {isNew ? 'Create course' : 'Save details'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {!isNew && tab === 'curriculum' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Structure lessons into modules, then attach hands-on lab assignments with verified steps.</p>
            <Button size="sm" variant="secondary" onClick={() => setModuleModal({ title: '', description: '' })}>
              <IconPlus size={13} /> Add module
            </Button>
          </div>

          {(data.modules || []).length === 0 ? (
            <EmptyState
              icon={IconBookOpen}
              title="No modules yet"
              message="Add a module, then populate it with lessons."
              action={
                <Button size="sm" onClick={() => setModuleModal({ title: '', description: '' })}>
                  <IconPlus size={13} /> Add module
                </Button>
              }
            />
          ) : (
            (data?.modules || []).map((module, moduleIndex) => (
              <Card key={module.id} className="overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-3.5">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold text-white">
                      <span className="font-mono text-[11px] text-brand-300">M{moduleIndex + 1}</span>
                      {module.title}
                    </p>
                    {module.description && <p className="mt-0.5 text-[11px] text-slate-500">{module.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setModuleModal(module)}>
                      <IconEdit size={13} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteModule(module)}>
                      <IconTrash size={13} className="text-slate-500" />
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => openLesson(null, module.id)}>
                      <IconPlus size={13} /> Lesson
                    </Button>
                  </div>
                </div>
                <ul className="divide-y divide-white/5">
                  {(module?.lessons || []).map((lesson, lessonIndex) => (
                    <li key={lesson.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
                      <span className="font-mono text-[10px] text-slate-600">{moduleIndex + 1}.{lessonIndex + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-200">{lesson.title}</p>
                        <p className="text-[10px] text-slate-500">
                          {lesson.lesson_type} · {lesson.duration_minutes} min
                          {lesson.is_free_preview ? ' · free preview' : ''}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => openLesson(lesson, module.id)} disabled={lessonLoading}>
                        <IconEdit size={13} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteLesson(lesson)}>
                        <IconTrash size={13} className="text-slate-500" />
                      </Button>
                    </li>
                  ))}
                  {module.lessons.length === 0 && (
                    <li className="px-5 py-3 text-xs text-slate-600">No lessons in this module yet.</li>
                  )}
                </ul>
              </Card>
            ))
          )}
        </div>
      )}

      {!isNew && tab === 'labs' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Hands-on labs with a real Linux terminal and auto-verified steps.</p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setLabModal({ title: '', summary: '', description: '', difficulty: 'beginner', estimatedMinutes: 30, dueAt: '', lessonId: '', status: 'draft' })
              }
            >
              <IconPlus size={13} /> New lab
            </Button>
          </div>
          {(data.labs || []).length === 0 ? (
            <EmptyState icon={IconTerminal} title="No labs" message="Create a lab and add guided, auto-verified steps." />
          ) : (
            <div className="space-y-2">
              {(data?.labs || []).map((lab) => (
                <Card key={lab.id} className="flex flex-wrap items-center gap-3 p-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-400/10 text-emerald-300">
                    <IconTerminal size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium text-slate-200">
                      {lab.title}
                      <Badge tone={lab.status === 'published' ? 'emerald' : 'amber'}>{lab.status}</Badge>
                    </p>
                    <p className="text-[11px] text-slate-500">{lab.step_count} steps · {DIFFICULTIES[lab.difficulty]?.label || lab.difficulty} · {lab.estimated_minutes} min</p>
                  </div>
                  <Button as={Link} to={`/instructor/labs/${lab.id}`} size="sm" variant="secondary">
                    Edit lab
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {!isNew && tab === 'students' && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <h2 className="flex items-center gap-2 font-display text-base font-semibold">
              <IconUsers size={16} className="text-brand-300" /> Enrolled learners
            </h2>
            <span className="text-xs text-slate-500">{data.enrollments.length} total</span>
          </div>
          {data.enrollments.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">No enrollments yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5 font-medium">Learner</th>
                    <th className="px-3 py-2.5 font-medium">Progress</th>
                    <th className="px-3 py-2.5 font-medium">Status</th>
                    <th className="px-5 py-2.5 font-medium text-right">Enrolled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {(data?.enrollments || []).map((enrollment) => (
                    <tr key={enrollment.id}>
                      <td className="px-5 py-3">
                        <p className="text-sm text-slate-200">{enrollment.full_name}</p>
                        <p className="text-[10px] text-slate-500">{enrollment.email}</p>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={Number(enrollment.progress_percent)} size="sm" className="w-24" tone={enrollment.status === 'completed' ? 'emerald' : 'brand'} />
                          <span className="font-mono text-[10px] text-slate-400">{Math.round(Number(enrollment.progress_percent))}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge tone={enrollment.status === 'completed' ? 'emerald' : enrollment.status === 'dropped' ? 'slate' : 'brand'}>
                          {enrollment.status}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right text-[11px] text-slate-500">
                        {enrollment.completed_at ? formatDate(enrollment.completed_at) : formatDate(enrollment.enrolled_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ---------- module modal ---------- */}
      <Modal
        open={Boolean(moduleModal)}
        onClose={() => setModuleModal(null)}
        title={moduleModal?.id ? 'Edit module' : 'Add module'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModuleModal(null)}>Cancel</Button>
            <Button onClick={saveModule} loading={modalSaving}>{moduleModal?.id ? 'Save module' : 'Add module'}</Button>
          </>
        }
      >
        {moduleModal && (
          <form onSubmit={saveModule} className="space-y-4">
            <Input label="Module title" value={moduleModal.title} onChange={(event) => setModuleModal((current) => ({ ...current, title: event.target.value }))} required />
            <Textarea label="Description" rows={2} value={moduleModal.description || ''} onChange={(event) => setModuleModal((current) => ({ ...current, description: event.target.value }))} />
          </form>
        )}
      </Modal>

      {/* ---------- lesson modal ---------- */}
      <Modal
        open={Boolean(lessonModal)}
        onClose={() => setLessonModal(null)}
        title={lessonModal?.id ? 'Edit lesson' : 'Add lesson'}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLessonModal(null)}>Cancel</Button>
            <Button onClick={saveLesson} loading={modalSaving}>{lessonModal?.id ? 'Save lesson' : 'Add lesson'}</Button>
          </>
        }
      >
        {lessonModal && (
          <form onSubmit={saveLesson} className="space-y-4">
            <Input label="Lesson title" value={lessonModal.title} onChange={(event) => setLessonModal((current) => ({ ...current, title: event.target.value }))} required />
            <div className="grid gap-4 sm:grid-cols-3">
              <Select label="Module" value={lessonModal.moduleId} onChange={(event) => setLessonModal((current) => ({ ...current, moduleId: event.target.value }))}>
                <option value="">Unassigned</option>
                {(data?.modules || []).map((module) => (
                  <option key={module.id} value={module.id}>{module.title}</option>
                ))}
              </Select>
              <Select label="Type" value={lessonModal.lessonType} onChange={(event) => setLessonModal((current) => ({ ...current, lessonType: event.target.value }))}>
                <option value="reading">Reading</option>
                <option value="video">Video</option>
                <option value="lab">Lab</option>
              </Select>
              <Input label="Duration (min)" type="number" min="0" value={lessonModal.durationMinutes} onChange={(event) => setLessonModal((current) => ({ ...current, durationMinutes: event.target.value }))} />
            </div>
            <Input label="Video URL (optional)" value={lessonModal.videoUrl} onChange={(event) => setLessonModal((current) => ({ ...current, videoUrl: event.target.value }))} />
            <Textarea label="Content (markdown)" rows={10} value={lessonModal.content} onChange={(event) => setLessonModal((current) => ({ ...current, content: event.target.value }))} className="font-mono text-[12px]" />
            <Checkbox label="Free preview (visible without enrollment)" checked={lessonModal.isFreePreview} onChange={(event) => setLessonModal((current) => ({ ...current, isFreePreview: event.target.checked }))} />
          </form>
        )}
      </Modal>

      {/* ---------- lab modal ---------- */}
      <Modal
        open={Boolean(labModal)}
        onClose={() => setLabModal(null)}
        title="New lab"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLabModal(null)}>Cancel</Button>
            <Button onClick={saveLab} loading={modalSaving}>Create lab</Button>
          </>
        }
      >
        {labModal && (
          <form onSubmit={saveLab} className="space-y-4">
            <Input label="Lab title" value={labModal.title} onChange={(event) => setLabModal((current) => ({ ...current, title: event.target.value }))} required />
            <Textarea label="Summary" rows={2} value={labModal.summary} onChange={(event) => setLabModal((current) => ({ ...current, summary: event.target.value }))} />
            <Textarea label="Description (markdown)" rows={4} value={labModal.description} onChange={(event) => setLabModal((current) => ({ ...current, description: event.target.value }))} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Select label="Difficulty" value={labModal.difficulty} onChange={(event) => setLabModal((current) => ({ ...current, difficulty: event.target.value }))}>
                {Object.entries(DIFFICULTIES).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </Select>
              <Input label="Minutes" type="number" min="5" value={labModal.estimatedMinutes} onChange={(event) => setLabModal((current) => ({ ...current, estimatedMinutes: event.target.value }))} />
              <Input label="Due date (optional)" type="datetime-local" value={labModal.dueAt || ''} onChange={(event) => setLabModal((current) => ({ ...current, dueAt: event.target.value }))} />
              <Select label="Status" value={labModal.status} onChange={(event) => setLabModal((current) => ({ ...current, status: event.target.value }))}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </Select>
            </div>
            <Select label="Attach to lesson" value={labModal.lessonId} onChange={(event) => setLabModal((current) => ({ ...current, lessonId: event.target.value }))}>
              <option value="">Course-wide</option>
              {lessons.map((lesson) => (
                <option key={lesson.id} value={lesson.id}>{lesson.moduleTitle}, {lesson.title}</option>
              ))}
            </Select>
            <p className="text-[11px] leading-5 text-slate-500">After creating the lab you'll be taken to the step editor to add commands and verification rules.</p>
          </form>
        )}
      </Modal>
    </div>
  );
}
