import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Pencil, Plus, Trash2 } from 'lucide-react';
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

const EMPTY = { name: '', level: '', description: '', siteId: '', academicYearId: '' };

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
  const learners = data!.reduce(
    (sum, c) => sum + c.batches.reduce((s: number, b: any) => s + b._count.enrollments, 0),
    0,
  );

  return (
    <>
      <PageHeader
        title="Classes"
        description="The classes taught at each school, and the sections within them."
        actions={
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Add class
          </button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Classes" value={data!.length} />
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
                  </div>
                </div>

                <div className="flex gap-1">
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
                  No sections yet — add one so learners can be enrolled into this class.
                </p>
              )}
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

  useEffect(() => {
    if (!open) return;
    if (schoolClass) {
      setForm({
        name: schoolClass.name ?? '',
        level: schoolClass.level?.toString() ?? '',
        description: schoolClass.description ?? '',
        siteId: schoolClass.siteId ?? '',
        academicYearId: schoolClass.academicYearId ?? '',
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
      if (isEdit) return (await api.patch(`/classes/${schoolClass.id}`, payload)).data;
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
