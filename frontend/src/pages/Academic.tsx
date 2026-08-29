import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus, UserPlus } from 'lucide-react';
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
  Table,
} from '../components/ui';

export function AcademicPage() {
  const qc = useQueryClient();
  const [creatingYear, setCreatingYear] = useState(false);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  const { data: years, isLoading, error, refetch } = useQuery({
    queryKey: ['academic-years'],
    queryFn: async () => (await api.get<any[]>('/academic-years')).data,
  });

  const { data: batches } = useQuery({
    queryKey: ['batches'],
    queryFn: async () => (await api.get<any[]>('/batches')).data,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['academic-years'] });
    qc.invalidateQueries({ queryKey: ['batches'] });
  };

  const setCurrent = useMutation({
    mutationFn: async (id: string) => (await api.patch(`/academic-years/${id}/current`, {})).data,
    onSuccess: invalidate,
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Academic Structure"
        description="Academic years, batches and sections, and course enrolment."
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEnrolling(true)}>
              <UserPlus className="h-4 w-4" aria-hidden />
              Enrol a batch
            </button>
            <button type="button" className="btn-secondary" onClick={() => setCreatingBatch(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              New batch
            </button>
            <button type="button" className="btn-primary" onClick={() => setCreatingYear(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              New academic year
            </button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Academic years">
          {years?.length ? (
            <Table headers={['Year', 'Period', 'Batches', '']}>
              {years.map((y) => (
                <tr key={y.id}>
                  <td className="td">
                    <span className="font-medium">{y.name}</span>
                    {y.isCurrent && (
                      <span className="ml-2">
                        <Badge tone="good">current</Badge>
                      </span>
                    )}
                  </td>
                  <td className="td text-slate-600">
                    {format(new Date(y.startDate), 'dd MMM yyyy')} – {format(new Date(y.endDate), 'dd MMM yyyy')}
                  </td>
                  <td className="td tabular-nums">{y._count.batches}</td>
                  <td className="td text-right">
                    {!y.isCurrent && (
                      <button
                        type="button"
                        className="text-sm text-brand-700 hover:underline"
                        onClick={() => setCurrent.mutate(y.id)}
                      >
                        Set current
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState title="No academic years yet" />
          )}
        </Card>

        <Card title="Batches & sections">
          {batches?.length ? (
            <Table headers={['Batch', 'Year', 'Site', 'Learners']}>
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="td font-medium">{b.name}</td>
                  <td className="td text-slate-600">{b.academicYear.name}</td>
                  <td className="td text-slate-600">{b.site?.name ?? '—'}</td>
                  <td className="td tabular-nums">{b._count.enrollments}</td>
                </tr>
              ))}
            </Table>
          ) : (
            <EmptyState title="No batches yet" />
          )}
        </Card>
      </div>

      <YearModal open={creatingYear} onClose={() => setCreatingYear(false)} onDone={() => { setCreatingYear(false); invalidate(); }} />
      <BatchModal open={creatingBatch} onClose={() => setCreatingBatch(false)} onDone={() => { setCreatingBatch(false); invalidate(); }} years={years ?? []} />
      <EnrolModal open={enrolling} onClose={() => setEnrolling(false)} batches={batches ?? []} />
    </>
  );
}

function YearModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '', isCurrent: true });

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/academic-years', {
          ...form,
          startDate: new Date(form.startDate).toISOString(),
          endDate: new Date(form.endDate).toISOString(),
        })
      ).data,
    onSuccess: onDone,
  });

  return (
    <Modal
      open={open}
      title="New academic year"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.name || !form.startDate || !form.endDate || create.isPending}
            onClick={() => create.mutate()}
          >
            Create
          </button>
        </>
      }
    >
      <Field label="Name" hint="For example, 2026-27.">
        <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts">
          <input className="input" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </Field>
        <Field label="Ends">
          <input className="input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.isCurrent} onChange={(e) => setForm({ ...form, isCurrent: e.target.checked })} />
        Make this the current academic year
      </label>
      {create.isError && <p className="mt-3 text-sm text-red-600">{errorMessage(create.error)}</p>}
    </Modal>
  );
}

function BatchModal({
  open,
  onClose,
  onDone,
  years,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  years: any[];
}) {
  const [form, setForm] = useState({ academicYearId: '', name: '', siteId: '', grade: '', section: '' });

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => (await api.get<any[]>('/sites')).data,
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post('/batches', { ...form, siteId: form.siteId || undefined })).data,
    onSuccess: onDone,
  });

  return (
    <Modal
      open={open}
      title="New batch"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.academicYearId || !form.name || create.isPending}
            onClick={() => create.mutate()}
          >
            Create batch
          </button>
        </>
      }
    >
      <Field label="Academic year">
        <select className="input" value={form.academicYearId} onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}>
          <option value="">Select…</option>
          {years.map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Batch name" hint="For example, Class 10 — A.">
        <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Site">
          <select className="input" value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
            <option value="">No site</option>
            {sites?.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Grade">
          <input className="input" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
        </Field>
        <Field label="Section">
          <input className="input" value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} />
        </Field>
      </div>
      {create.isError && <p className="text-sm text-red-600">{errorMessage(create.error)}</p>}
    </Modal>
  );
}

function EnrolModal({ open, onClose, batches }: { open: boolean; onClose: () => void; batches: any[] }) {
  const [batchId, setBatchId] = useState('');
  const [courseId, setCourseId] = useState('');

  const { data: courses } = useQuery({
    queryKey: ['courses', 'picker'],
    queryFn: async () => (await api.get<any>('/courses', { params: { limit: 100 } })).data,
    enabled: open,
  });

  const enrol = useMutation({
    mutationFn: async () => (await api.post<any>('/enrollments/batch', { batchId, courseId })).data,
  });

  return (
    <Modal
      open={open}
      title="Enrol a batch into a course"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Close</button>
          <button type="button" className="btn-primary" disabled={!batchId || !courseId || enrol.isPending} onClick={() => enrol.mutate()}>
            Enrol batch
          </button>
        </>
      }
    >
      <Field label="Batch">
        <select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
          <option value="">Select…</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      </Field>
      <Field label="Course">
        <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">Select…</option>
          {courses?.items?.map((c: any) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </Field>
      {enrol.isError && <p className="text-sm text-red-600">{errorMessage(enrol.error)}</p>}
      {enrol.isSuccess && (
        <p className="text-sm text-emerald-700">Enrolled {enrol.data.enrolled} learner(s) into the course.</p>
      )}
    </Modal>
  );
}
