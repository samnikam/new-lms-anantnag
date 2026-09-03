import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Pencil, Plus, Send, UserPlus, X } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  Card,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeader,
  StatusBadge,
  Table,
} from '../components/ui';

export function CoursesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [state, setState] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: '', title: '', category: '', description: '' });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['courses', search, state],
    queryFn: async () =>
      (await api.get<any>('/courses', { params: { search: search || undefined, state: state || undefined, limit: 50 } })).data,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post('/courses', form)).data,
    onSuccess: () => {
      setCreating(false);
      setForm({ code: '', title: '', category: '', description: '' });
      qc.invalidateQueries({ queryKey: ['courses'] });
    },
  });

  const canAuthor = ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'CONTENT_MANAGER'].includes(user!.role);

  return (
    <>
      <PageHeader
        title="Courses"
        description="Create, structure and publish course content."
        actions={
          canAuthor && (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              New course
            </button>
          )
        }
      />

      <Card className="mb-6">
        <div className="flex flex-wrap gap-3">
          <input
            className="input max-w-xs"
            placeholder="Search by title or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search courses"
          />
          <select className="input max-w-[12rem]" value={state} onChange={(e) => setState(e.target.value)} aria-label="Filter by state">
            <option value="">All states</option>
            <option value="DRAFT">Draft</option>
            <option value="IN_REVIEW">In review</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </Card>

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : !data?.items?.length ? (
        <EmptyState title="No courses found" description="Adjust your filters or create a new course." />
      ) : (
        <Card>
          <Table headers={['Course', 'Category', 'Teachers', 'Modules', 'Learners', 'State']}>
            {data.items.map((c: any) => (
              <tr key={c.id}>
                <td className="td">
                  <Link to={`/courses/${c.id}`} className="font-medium text-brand-800 hover:underline">
                    {c.title}
                  </Link>
                  <p className="text-xs text-slate-500">{c.code}</p>
                </td>
                <td className="td text-slate-600">{c.category ?? '—'}</td>
                <td className="td text-slate-600">
                  {c.teachers.map((t: any) => t.teacher.fullName).join(', ') || '—'}
                </td>
                <td className="td tabular-nums">{c._count.modules}</td>
                <td className="td tabular-nums">{c._count.enrollments}</td>
                <td className="td">
                  <StatusBadge status={c.state} />
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal
        open={creating}
        title="New course"
        onClose={() => setCreating(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!form.code || !form.title || create.isPending}
              onClick={() => create.mutate()}
            >
              Create course
            </button>
          </>
        }
      >
        <Field label="Course code" hint="A short unique identifier, e.g. SCI-10.">
          <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </Field>
        <Field label="Title">
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Category">
          <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </Field>
        <Field label="Description">
          <textarea
            className="input"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
        {create.isError && <p className="text-sm text-red-600">{errorMessage(create.error)}</p>}
      </Modal>
    </>
  );
}

export function CourseDetailPage() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [moduleTitle, setModuleTitle] = useState('');
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [cloning, setCloning] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState(false);

  const { data: course, isLoading, error, refetch } = useQuery({
    queryKey: ['course', id],
    queryFn: async () => (await api.get<any>(`/courses/${id}`)).data,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['course', id] });

  const addModule = useMutation({
    mutationFn: async () =>
      (await api.post('/modules', { courseId: id, title: moduleTitle, position: course.modules.length })).data,
    onSuccess: () => {
      setModuleTitle('');
      invalidate();
    },
  });

  const addLesson = useMutation({
    mutationFn: async (moduleId: string) =>
      (await api.post('/lessons', { moduleId, title: lessonTitle, state: 'PUBLISHED' })).data,
    onSuccess: () => {
      setAddingTo(null);
      setLessonTitle('');
      invalidate();
    },
  });

  const setState = useMutation({
    mutationFn: async (state: string) => (await api.patch(`/courses/${id}/state`, { state })).data,
    onSuccess: invalidate,
  });

  const assignTeacher = useMutation({
    mutationFn: async (teacherId: string) =>
      (await api.post(`/courses/${id}/teachers`, { teacherId })).data,
    onSuccess: () => {
      setAssigning(false);
      invalidate();
    },
  });

  const removeTeacher = useMutation({
    mutationFn: async (teacherId: string) =>
      (await api.delete(`/courses/${id}/teachers/${teacherId}`)).data,
    onSuccess: invalidate,
  });

  // Only teachers can be assigned, so the picker asks for that role directly.
  const { data: teachers } = useQuery({
    queryKey: ['users', 'teachers'],
    queryFn: async () =>
      (await api.get<any>('/users', { params: { role: 'TEACHER', limit: 200 } })).data,
    enabled: assigning,
  });

  const clone = useMutation({
    mutationFn: async () => (await api.post(`/courses/${id}/clone`, { newCode })).data,
    onSuccess: () => {
      setCloning(false);
      qc.invalidateQueries({ queryKey: ['courses'] });
    },
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title={course.title}
        description={`${course.code}${course.category ? ` · ${course.category}` : ''} · ${course._count.enrollments} learners`}
        actions={
          <>
            <StatusBadge status={course.state} />
            <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" aria-hidden />
              Edit
            </button>
            <button type="button" className="btn-secondary" onClick={() => setCloning(true)}>
              <Copy className="h-4 w-4" aria-hidden />
              Clone
            </button>
            {course.state !== 'PUBLISHED' ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => setState.mutate('PUBLISHED')}
                disabled={setState.isPending}
              >
                <Send className="h-4 w-4" aria-hidden />
                Publish
              </button>
            ) : (
              <button type="button" className="btn-secondary" onClick={() => setState.mutate('ARCHIVED')}>
                Archive
              </button>
            )}
          </>
        }
      />

      {setState.isError && (
        <div className="mb-4">
          <ErrorState message={errorMessage(setState.error)} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {course.modules.length === 0 && (
            <EmptyState title="No modules yet" description="Add a module to start building this course." />
          )}

          {course.modules.map((mod: any) => (
            <Card
              key={mod.id}
              title={mod.title}
              action={
                <button type="button" className="text-sm text-brand-700" onClick={() => setAddingTo(mod.id)}>
                  + Lesson
                </button>
              }
            >
              {mod.lessons.length ? (
                <ul className="divide-y divide-slate-100">
                  {mod.lessons.map((lesson: any) => (
                    <li key={lesson.id} className="flex items-center justify-between py-2.5">
                      <div>
                        <p className="text-sm font-medium text-ink">{lesson.title}</p>
                        <p className="text-xs text-slate-500">
                          {lesson.durationMin ? `${lesson.durationMin} min · ` : ''}
                          {lesson.resources.length} resource{lesson.resources.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      <StatusBadge status={lesson.state} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-sm text-slate-500">No lessons in this module yet.</p>
              )}

              {addingTo === mod.id && (
                <div className="mt-4 flex gap-2 border-t border-slate-200 pt-4">
                  <input
                    className="input"
                    placeholder="Lesson title"
                    value={lessonTitle}
                    onChange={(e) => setLessonTitle(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={!lessonTitle || addLesson.isPending}
                    onClick={() => addLesson.mutate(mod.id)}
                  >
                    Add
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setAddingTo(null)}>
                    Cancel
                  </button>
                </div>
              )}
            </Card>
          ))}

          <Card title="Add a module">
            <div className="flex gap-2">
              <input
                className="input"
                placeholder="Module title"
                value={moduleTitle}
                onChange={(e) => setModuleTitle(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary"
                disabled={!moduleTitle || addModule.isPending}
                onClick={() => addModule.mutate()}
              >
                Add
              </button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Details">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Description</dt>
                <dd className="mt-0.5">{course.description || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Objectives</dt>
                <dd className="mt-0.5">{course.objectives || '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Completion rule</dt>
                <dd className="mt-0.5">
                  {course.requiredLessonPct}% of lessons
                  {course.requiredQuizPct > 0 ? `, ${course.requiredQuizPct}% of quizzes passed` : ''}
                </dd>
              </div>
            </dl>
          </Card>

          <Card
            title="Teachers"
            action={
              <button type="button" className="text-sm text-brand-700" onClick={() => setAssigning(true)}>
                + Assign
              </button>
            }
          >
            {course.teachers.length ? (
              <ul className="divide-y divide-slate-100">
                {course.teachers.map((t: any) => (
                  <li key={t.teacher.id} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-ink">{t.teacher.fullName}</p>
                      {t.isLead && <p className="text-xs text-slate-500">Lead teacher</p>}
                    </div>
                    <button
                      type="button"
                      className="rounded p-1.5 text-red-600 hover:bg-red-50"
                      aria-label={`Remove ${t.teacher.fullName}`}
                      onClick={() => removeTeacher.mutate(t.teacher.id)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">
                No teacher assigned yet — learners cannot be taught until one is.
              </p>
            )}
            {removeTeacher.isError && (
              <p className="mt-2 text-sm text-red-600">{errorMessage(removeTeacher.error)}</p>
            )}
          </Card>

          <Card title="Assessment">
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between">
                <span className="text-slate-500">Quizzes</span>
                <span className="tabular-nums">{course._count.quizzes}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-500">Assignments</span>
                <span className="tabular-nums">{course._count.assignments}</span>
              </li>
            </ul>
          </Card>
        </div>
      </div>

      <Modal
        open={assigning}
        title="Assign a teacher"
        onClose={() => setAssigning(false)}
        footer={
          <button type="button" className="btn-secondary" onClick={() => setAssigning(false)}>
            Close
          </button>
        }
      >
        <p className="mb-4 text-sm text-ink-soft">
          An assigned teacher sees this course on their dashboard and can schedule its classes,
          mark attendance and grade work.
        </p>
        {!teachers ? (
          <Loading />
        ) : (
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
            {teachers.items
              .filter((t: any) => !course.teachers.some((x: any) => x.teacher.id === t.id))
              .map((t: any) => (
                <li key={t.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium">{t.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {t.email} {t.site ? `· ${t.site.name}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={assignTeacher.isPending}
                    onClick={() => assignTeacher.mutate(t.id)}
                  >
                    <UserPlus className="h-4 w-4" aria-hidden />
                    Assign
                  </button>
                </li>
              ))}
          </ul>
        )}
        {assignTeacher.isError && (
          <p className="mt-3 text-sm text-red-600">{errorMessage(assignTeacher.error)}</p>
        )}
      </Modal>

      <EditCourseModal
        open={editing}
        course={course}
        onClose={() => setEditing(false)}
        onDone={() => {
          setEditing(false);
          invalidate();
        }}
      />

      <Modal
        open={cloning}
        title="Clone course"
        onClose={() => setCloning(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCloning(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={!newCode || clone.isPending} onClick={() => clone.mutate()}>
              Create copy
            </button>
          </>
        }
      >
        <p className="mb-4 text-sm text-ink-soft">
          Creates a new draft with every module, lesson and resource copied across.
        </p>
        <Field label="New course code">
          <input className="input" value={newCode} onChange={(e) => setNewCode(e.target.value)} />
        </Field>
        {clone.isError && <p className="text-sm text-red-600">{errorMessage(clone.error)}</p>}
      </Modal>
    </>
  );
}

/** Edits course metadata and the rules that decide completion. */
function EditCourseModal({
  open,
  course,
  onClose,
  onDone,
}: {
  open: boolean;
  course: any;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<any>({});

  useEffect(() => {
    if (!open || !course) return;
    setForm({
      title: course.title ?? '',
      code: course.code ?? '',
      category: course.category ?? '',
      level: course.level ?? '',
      description: course.description ?? '',
      objectives: course.objectives ?? '',
      durationHours: course.durationHours ?? '',
      requiredLessonPct: course.requiredLessonPct ?? 100,
      requiredQuizPct: course.requiredQuizPct ?? 0,
      passMark: course.passMark ?? 40,
    });
  }, [open, course]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(form)) {
        if (v === '' || v === undefined) continue;
        payload[k] = ['durationHours', 'requiredLessonPct', 'requiredQuizPct', 'passMark'].includes(k)
          ? Number(v)
          : v;
      }
      return (await api.patch(`/courses/${course.id}`, payload)).data;
    },
    onSuccess: onDone,
  });

  return (
    <Modal
      open={open}
      title="Edit course"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.title || !form.code || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Course code">
          <input className="input" value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </Field>
        <Field label="Category">
          <input className="input" value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </Field>
      </div>

      <Field label="Title">
        <input className="input" value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </Field>

      <Field label="Description">
        <textarea className="input" rows={3} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </Field>

      <Field label="Objectives">
        <textarea className="input" rows={2} value={form.objectives ?? ''} onChange={(e) => setForm({ ...form, objectives: e.target.value })} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Level">
          <input className="input" value={form.level ?? ''} onChange={(e) => setForm({ ...form, level: e.target.value })} />
        </Field>
        <Field label="Duration (hours)">
          <input className="input" type="number" min={0} value={form.durationHours ?? ''} onChange={(e) => setForm({ ...form, durationHours: e.target.value })} />
        </Field>
      </div>

      <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Completion rules
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Lessons required (%)" hint="Share of lessons to finish.">
          <input className="input" type="number" min={0} max={100} value={form.requiredLessonPct ?? 100} onChange={(e) => setForm({ ...form, requiredLessonPct: e.target.value })} />
        </Field>
        <Field label="Quizzes passed (%)">
          <input className="input" type="number" min={0} max={100} value={form.requiredQuizPct ?? 0} onChange={(e) => setForm({ ...form, requiredQuizPct: e.target.value })} />
        </Field>
        <Field label="Pass mark (%)">
          <input className="input" type="number" min={0} max={100} value={form.passMark ?? 40} onChange={(e) => setForm({ ...form, passMark: e.target.value })} />
        </Field>
      </div>

      {save.isError && <p className="text-sm text-red-600">{errorMessage(save.error)}</p>}
    </Modal>
  );
}
