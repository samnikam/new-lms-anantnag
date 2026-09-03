import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeader,
  StatCard,
  Table,
} from '../components/ui';

const EMPTY = {
  name: '',
  level: '',
  description: '',
  siteId: '',
  academicYearId: '',
  classTeacherId: '',
};

/**
 * Classes (grades) at a school — Class 9, Class 10 — with the sections that
 * sit beneath each. A subject is what gets taught; a class is who it is
 * taught to.
 */
export function ClassesPage() {
  const qc = useQueryClient();
  const [siteFilter, setSiteFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);
  const [addingSectionTo, setAddingSectionTo] = useState<any | null>(null);
  const [enrollingInto, setEnrollingInto] = useState<any | null>(null);

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => (await api.get<any[]>('/sites')).data,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['classes', siteFilter],
    queryFn: async () =>
      (await api.get<any[]>('/classes', { params: { siteId: siteFilter || undefined } })).data,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['classes'] });
    qc.invalidateQueries({ queryKey: ['batches'] });
  };

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/classes/${id}`)).data,
    onSuccess: () => {
      setConfirmDelete(null);
      invalidate();
    },
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const sections = data!.reduce((sum, c) => sum + c.batches.length, 0);
  const subjects = data!.reduce((sum, c) => sum + (c.subjects?.length ?? 0), 0);
  const learners = data!.reduce(
    (sum, c) => sum + c.batches.reduce((s: number, b: any) => s + b._count.enrollments, 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="Classes"
        description="Set up a class first: its subjects, its sections, and the learners in it. The timetable and attendance build on this."
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Add class
          </button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Classes" value={data!.length} />
        <StatCard label="Subjects taught" value={subjects} />
        <StatCard label="Sections" value={sections} />
        <StatCard label="Enrolments" value={learners} />
      </div>

      <Card className="mb-6">
        <label className="label" htmlFor="site-filter">
          School
        </label>
        <select
          id="site-filter"
          className="input max-w-md"
          value={siteFilter}
          onChange={(e) => setSiteFilter(e.target.value)}
        >
          <option value="">All schools</option>
          {sites?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Card>

      {remove.isError && (
        <div className="mb-4">
          <ErrorState message={errorMessage(remove.error)} />
        </div>
      )}

      {!data!.length ? (
        <EmptyState
          title="No classes yet"
          description="Add a class such as Class 10, then create its sections."
          action={
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              Add class
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {data!.map((c) => (
            <Card key={c.id}>
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" aria-hidden />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-ink">{c.name}</h2>
                      {!c.active && <Badge tone="bad">inactive</Badge>}
                    </div>
                    <p className="text-xs text-slate-500">
                      {c.site.name} · {c.academicYear.name}
                      {c.description ? ` · ${c.description}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs">
                      {c.classTeacher ? (
                        <span className="text-ink-soft">
                          Class teacher: <strong>{c.classTeacher.fullName}</strong>
                        </span>
                      ) : (
                        <span className="text-amber-700">No class teacher assigned</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => setEnrollingInto(c)}
                  >
                    <UserPlus className="h-3.5 w-3.5" aria-hidden />
                    Enrol learner
                  </button>
                  <button
                    type="button"
                    className="btn-secondary text-xs"
                    onClick={() => setAddingSectionTo(c)}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Add section
                  </button>
                  <button
                    type="button"
                    className="rounded p-1.5 text-brand-700 hover:bg-brand-50"
                    aria-label={`Edit ${c.name}`}
                    onClick={() => setEditing(c)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1.5 text-red-600 hover:bg-red-50"
                    aria-label={`Delete ${c.name}`}
                    onClick={() => setConfirmDelete(c)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {c.batches.length ? (
                <Table headers={['Section', 'Learners']}>
                  {c.batches.map((b: any) => (
                    <tr key={b.id}>
                      <td className="td font-medium">{b.name}</td>
                      <td className="td tabular-nums">{b._count.enrollments}</td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <p className="text-sm text-slate-500">
                  No sections yet — add one so learners can be grouped within this class.
                </p>
              )}

              <SubjectsPanel schoolClass={c} onChanged={invalidate} />
            </Card>
          ))}
        </div>
      )}

      <ClassModal
        open={creating || !!editing}
        schoolClass={editing}
        sites={sites ?? []}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onDone={() => {
          setCreating(false);
          setEditing(null);
          invalidate();
        }}
      />

      <EnrolInClassModal
        schoolClass={enrollingInto}
        onClose={() => setEnrollingInto(null)}
        onDone={() => {
          setEnrollingInto(null);
          invalidate();
        }}
      />

      <SectionModal
        schoolClass={addingSectionTo}
        onClose={() => setAddingSectionTo(null)}
        onDone={() => {
          setAddingSectionTo(null);
          invalidate();
        }}
      />

      <Modal
        open={!!confirmDelete}
        title={`Delete ${confirmDelete?.name ?? ''}?`}
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate(confirmDelete.id)}
            >
              Delete class
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          A class with sections still attached is refused, so no learner is left without a class.
          Remove the sections first, or edit the class and deactivate it instead.
        </p>
      </Modal>
    </>
  );
}

function ClassModal({
  open,
  schoolClass,
  sites,
  onClose,
  onDone,
}: {
  open: boolean;
  schoolClass: any | null;
  sites: any[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const isEdit = !!schoolClass;

  const { data: years } = useQuery({
    queryKey: ['academic-years'],
    queryFn: async () => (await api.get<any[]>('/academic-years')).data,
    enabled: open,
  });

  const { data: teachers } = useQuery({
    queryKey: ['users', 'teachers'],
    queryFn: async () =>
      (await api.get<any>('/users', { params: { role: 'TEACHER', limit: 200 } })).data,
    enabled: open && isEdit,
  });

  useEffect(() => {
    if (!open) return;
    if (schoolClass) {
      setForm({
        name: schoolClass.name ?? '',
        level: schoolClass.level?.toString() ?? '',
        description: schoolClass.description ?? '',
        siteId: schoolClass.siteId ?? '',
        academicYearId: schoolClass.academicYearId ?? '',
        classTeacherId: schoolClass.classTeacherId ?? '',
      });
    } else {
      const current = years?.find((y: any) => y.isCurrent) ?? years?.[0];
      setForm({ ...EMPTY, academicYearId: current?.id ?? '' });
    }
  }, [open, schoolClass, years]);

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name,
        description: form.description || undefined,
        level: form.level ? Number(form.level) : undefined,
      };
      // Only sent on edit: the picker needs a saved class to attach to.
      if (isEdit) {
        payload.classTeacherId = form.classTeacherId || null;
        return (await api.patch(`/classes/${schoolClass.id}`, payload)).data;
      }
      return (
        await api.post('/classes', {
          ...payload,
          siteId: form.siteId,
          academicYearId: form.academicYearId,
        })
      ).data;
    },
    onSuccess: onDone,
  });

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit ${schoolClass?.name}` : 'Add a class'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={
              !form.name || (!isEdit && (!form.siteId || !form.academicYearId)) || save.isPending
            }
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add class'}
          </button>
        </>
      }
    >
      <Field label="Class name" hint="As the school refers to it, e.g. Class 10.">
        <input
          className="input"
          placeholder="Class 10"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>

      {!isEdit && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="School">
            <select
              className="input"
              value={form.siteId}
              onChange={(e) => setForm({ ...form, siteId: e.target.value })}
            >
              <option value="">Select a school…</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Academic year">
            <select
              className="input"
              value={form.academicYearId}
              onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}
            >
              <option value="">Select…</option>
              {years?.map((y: any) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {isEdit && (
        <Field
          label="Class teacher"
          hint="The teacher answerable for this class as a whole, separate from its subject teachers."
        >
          <select
            className="input"
            value={form.classTeacherId}
            onChange={(e) => setForm({ ...form, classTeacherId: e.target.value })}
          >
            <option value="">Not assigned</option>
            {teachers?.items?.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Grade number" hint="Used for ordering. Optional.">
          <input
            className="input"
            type="number"
            min={1}
            placeholder="10"
            value={form.level}
            onChange={(e) => setForm({ ...form, level: e.target.value })}
          />
        </Field>
        <Field label="Note">
          <input
            className="input"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>
      </div>

      {save.isError && <p className="text-sm text-red-600">{errorMessage(save.error)}</p>}
    </Modal>
  );
}

/** Sections are batches beneath a class, e.g. Class 10 — A. */
function SectionModal({
  schoolClass,
  onClose,
  onDone,
}: {
  schoolClass: any | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [section, setSection] = useState('');

  useEffect(() => {
    if (schoolClass) setSection('');
  }, [schoolClass]);

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/batches', {
          academicYearId: schoolClass.academicYearId,
          siteId: schoolClass.siteId,
          classId: schoolClass.id,
          name: `${schoolClass.name} — ${section}`,
          section,
          grade: schoolClass.level ? String(schoolClass.level) : undefined,
        })
      ).data,
    onSuccess: onDone,
  });

  return (
    <Modal
      open={!!schoolClass}
      title={`Add a section to ${schoolClass?.name ?? ''}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!section.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Adding…' : 'Add section'}
          </button>
        </>
      }
    >
      <Field
        label="Section"
        hint={`Saved as "${schoolClass?.name ?? 'Class'} — ${section || 'A'}".`}
      >
        <input
          className="input"
          placeholder="A"
          value={section}
          onChange={(e) => setSection(e.target.value)}
          autoFocus
        />
      </Field>

      {create.isError && <p className="text-sm text-red-600">{errorMessage(create.error)}</p>}
    </Modal>
  );
}

/**
 * Subjects a class studies, with who teaches each. This is the link the rest
 * of the portal reads from: the timetable offers these subjects for the class,
 * and enrolling a learner into the class enrols them into all of them.
 */
function SubjectsPanel({ schoolClass, onChanged }: { schoolClass: any; onChanged: () => void }) {
  const [adding, setAdding] = useState(false);
  const [courseId, setCourseId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [newName, setNewName] = useState('');

  const { data: courses } = useQuery({
    queryKey: ['courses', 'picker'],
    queryFn: async () => (await api.get<any>('/courses', { params: { limit: 200 } })).data,
    enabled: adding,
  });

  const { data: teachers } = useQuery({
    queryKey: ['users', 'teachers'],
    queryFn: async () => (await api.get<any>('/users', { params: { role: 'TEACHER', limit: 200 } })).data,
    enabled: adding,
  });

  const reset = () => {
    setAdding(false);
    setCourseId('');
    setTeacherId('');
    setNewName('');
  };

  const attach = useMutation({
    mutationFn: async () => {
      let id = courseId;

      // Creating the subject inline saves a trip to another screen; the code
      // the database needs is derived rather than demanded.
      if (!id && newName.trim()) {
        const base =
          newName.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 12) || 'SUBJ';
        const created = (
          await api.post<any>('/courses', {
            title: newName.trim(),
            code: base + '-' + String(Date.now()).slice(-3),
          })
        ).data;
        id = created.id;
      }

      return (
        await api.post(`/classes/${schoolClass.id}/subjects`, {
          courseId: id,
          teacherId: teacherId || undefined,
        })
      ).data;
    },
    onSuccess: () => {
      reset();
      onChanged();
    },
  });

  const detach = useMutation({
    mutationFn: async (cid: string) =>
      (await api.delete(`/classes/${schoolClass.id}/subjects/${cid}`)).data,
    onSuccess: onChanged,
  });

  const taken = new Set((schoolClass.subjects ?? []).map((s: any) => s.course.id));

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">
          Subjects ({schoolClass.subjects?.length ?? 0})
        </h3>
        {!adding && (
          <button type="button" className="btn-secondary text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add subject
          </button>
        )}
      </div>

      {schoolClass.subjects?.length ? (
        <Table headers={['Subject', 'Teacher', '']}>
          {schoolClass.subjects.map((s: any) => (
            <tr key={s.id}>
              <td className="td">
                <span className="font-medium">{s.course.title}</span>
                <span className="ml-2 text-xs text-slate-500">{s.course.code}</span>
              </td>
              <td className="td text-slate-600">
                {s.teacher?.fullName ?? (
                  <span className="text-xs text-amber-700">No teacher assigned</span>
                )}
              </td>
              <td className="td text-right">
                <button
                  type="button"
                  className="rounded p-1.5 text-red-600 hover:bg-red-50"
                  aria-label={`Remove ${s.course.title}`}
                  onClick={() => detach.mutate(s.course.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <p className="text-sm text-slate-500">
          No subjects yet. Add them before building a timetable or enrolling learners.
        </p>
      )}

      {adding && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <Field label="Subject" hint="Pick one already in the portal, or type a new name below.">
            <select
              className="input"
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                if (e.target.value) setNewName('');
              }}
            >
              <option value="">Select an existing subject…</option>
              {courses?.items
                ?.filter((c: any) => !taken.has(c.id))
                .map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
            </select>
          </Field>

          <Field label="…or add a new subject">
            <input
              className="input"
              placeholder="e.g. Mathematics"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                if (e.target.value) setCourseId('');
              }}
            />
          </Field>

          <Field label="Teacher" hint="Optional now; the teacher can be assigned later.">
            <select className="input" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
              <option value="">Not assigned yet</option>
              {teachers?.items?.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={(!courseId && !newName.trim()) || attach.isPending}
              onClick={() => attach.mutate()}
            >
              {attach.isPending ? 'Adding…' : 'Add to class'}
            </button>
            <button type="button" className="btn-secondary" onClick={reset}>
              Cancel
            </button>
          </div>

          {attach.isError && (
            <p className="mt-2 text-sm text-red-600">{errorMessage(attach.error)}</p>
          )}
        </div>
      )}

      {detach.isError && <p className="mt-2 text-sm text-red-600">{errorMessage(detach.error)}</p>}
    </div>
  );
}

/** Enrols a learner into every subject a class studies, in one action. */
function EnrolInClassModal({
  schoolClass,
  onClose,
  onDone,
}: {
  schoolClass: any | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [studentId, setStudentId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [search, setSearch] = useState('');

  const { data: students } = useQuery({
    queryKey: ['users', 'students', search],
    queryFn: async () =>
      (
        await api.get<any>('/users', {
          params: { role: 'STUDENT', search: search || undefined, limit: 100 },
        })
      ).data,
    enabled: !!schoolClass,
  });

  const enrol = useMutation({
    mutationFn: async () =>
      (
        await api.post<any>(`/classes/${schoolClass.id}/enroll`, {
          studentId,
          batchId: batchId || undefined,
        })
      ).data,
    onSuccess: () => {
      setStudentId('');
      setBatchId('');
    },
  });

  const noSubjects = (schoolClass?.subjects?.length ?? 0) === 0;

  return (
    <Modal
      open={!!schoolClass}
      title={`Enrol a learner into ${schoolClass?.name ?? ''}`}
      onClose={() => {
        enrol.reset();
        onClose();
      }}
      footer={
        <>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              enrol.reset();
              onDone();
            }}
          >
            Done
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!studentId || noSubjects || enrol.isPending}
            onClick={() => enrol.mutate()}
          >
            {enrol.isPending ? 'Enrolling…' : 'Enrol'}
          </button>
        </>
      }
    >
      {noSubjects ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This class has no subjects yet. Add its subjects first — enrolling a learner means
          enrolling them into what the class studies.
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-soft">
            The learner is enrolled into all {schoolClass.subjects.length} subject
            {schoolClass.subjects.length === 1 ? '' : 's'} this class studies:{' '}
            {schoolClass.subjects.map((s: any) => s.course.title).join(', ')}.
          </p>

          <Field label="Find a learner">
            <input
              className="input"
              placeholder="Search by name or email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>

          <Field label="Learner">
            <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Select…</option>
              {students?.items?.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                  {s.email ? ` — ${s.email}` : ''}
                </option>
              ))}
            </select>
          </Field>

          {schoolClass.batches?.length > 0 && (
            <Field label="Section" hint="Optional when the class has only one.">
              <select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                <option value="">
                  {schoolClass.batches.length === 1 ? schoolClass.batches[0].name : 'No section'}
                </option>
                {schoolClass.batches.map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {enrol.isError && <p className="text-sm text-red-600">{errorMessage(enrol.error)}</p>}
          {enrol.isSuccess && (
            <p className="text-sm text-emerald-700">
              Enrolled into {enrol.data.enrolled} subject(s). Pick another learner, or press Done.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
