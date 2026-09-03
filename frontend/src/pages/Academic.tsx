import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowRightLeft, History, Plus, UserMinus, UserPlus } from 'lucide-react';
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
  StatusBadge,
  Table,
} from '../components/ui';

export function AcademicPage() {
  const qc = useQueryClient();
  const [creatingYear, setCreatingYear] = useState(false);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollingOne, setEnrollingOne] = useState(false);

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
            <button type="button" className="btn-secondary" onClick={() => setEnrollingOne(true)}>
              <UserPlus className="h-4 w-4" aria-hidden />
              Enrol a student
            </button>
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

      <EnrolmentRegister />

      <YearModal open={creatingYear} onClose={() => setCreatingYear(false)} onDone={() => { setCreatingYear(false); invalidate(); }} />
      <BatchModal open={creatingBatch} onClose={() => setCreatingBatch(false)} onDone={() => { setCreatingBatch(false); invalidate(); }} years={years ?? []} />
      <EnrolModal open={enrolling} onClose={() => setEnrolling(false)} batches={batches ?? []} />
      <EnrolStudentModal
        open={enrollingOne}
        onClose={() => setEnrollingOne(false)}
        batches={batches ?? []}
        onDone={() => {
          setEnrollingOne(false);
          qc.invalidateQueries({ queryKey: ['enrollments'] });
        }}
      />
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

/**
 * The enrolment register: who is on which course, with the transfer and
 * withdrawal actions an academic office performs day to day.
 */
function EnrolmentRegister() {
  const qc = useQueryClient();
  const [courseId, setCourseId] = useState('');
  const [transferring, setTransferring] = useState<any | null>(null);
  const [withdrawing, setWithdrawing] = useState<any | null>(null);
  const [historyFor, setHistoryFor] = useState<any | null>(null);
  const [toBatchId, setToBatchId] = useState('');
  const [reason, setReason] = useState('');

  const { data: courses } = useQuery({
    queryKey: ['courses', 'picker'],
    queryFn: async () => (await api.get<any>('/courses', { params: { limit: 100 } })).data,
  });

  const { data: batches } = useQuery({
    queryKey: ['batches'],
    queryFn: async () => (await api.get<any[]>('/batches')).data,
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['enrollments', courseId],
    queryFn: async () =>
      (await api.get<any[]>('/enrollments', { params: { courseId: courseId || undefined } })).data,
  });

  const { data: history } = useQuery({
    queryKey: ['enrollment-history', historyFor?.id],
    queryFn: async () => (await api.get<any[]>(`/enrollments/${historyFor.id}/history`)).data,
    enabled: !!historyFor,
  });

  const done = () => {
    setTransferring(null);
    setWithdrawing(null);
    setToBatchId('');
    setReason('');
    qc.invalidateQueries({ queryKey: ['enrollments'] });
  };

  const transfer = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/enrollments/${transferring.id}/transfer`, {
          toBatchId,
          reason: reason || undefined,
        })
      ).data,
    onSuccess: done,
  });

  const withdraw = useMutation({
    mutationFn: async () =>
      (await api.post(`/enrollments/${withdrawing.id}/withdraw`, { reason: reason || undefined })).data,
    onSuccess: done,
  });

  return (
    <Card
      className="mt-6"
      title="Enrolment register"
      action={
        <select
          className="input max-w-[16rem] py-1 text-sm"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          aria-label="Filter by course"
        >
          <option value="">All courses</option>
          {courses?.items?.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      }
    >
      {isLoading ? (
        <Loading />
      ) : !rows?.length ? (
        <EmptyState title="No enrolments yet" description="Enrol a learner or a whole batch above." />
      ) : (
        <Table headers={['Learner', 'Course', 'Batch', 'Status', 'Enrolled', '']}>
          {rows.slice(0, 100).map((e) => (
            <tr key={e.id}>
              <td className="td font-medium">{e.student.fullName}</td>
              <td className="td text-slate-600">{e.course.title}</td>
              <td className="td text-slate-600">{e.batch?.name ?? '—'}</td>
              <td className="td">
                <StatusBadge status={e.status} />
              </td>
              <td className="td text-slate-600">
                {new Date(e.enrolledAt).toLocaleDateString('en-IN')}
              </td>
              <td className="td">
                <div className="flex justify-end gap-1">
                  <button
                    type="button"
                    className="rounded p-1.5 text-brand-700 hover:bg-brand-50"
                    aria-label={`Transfer ${e.student.fullName}`}
                    title="Transfer to another batch"
                    onClick={() => {
                      setTransferring(e);
                      setToBatchId('');
                      setReason('');
                    }}
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-1.5 text-ink-soft hover:bg-slate-100"
                    aria-label={`History for ${e.student.fullName}`}
                    title="Enrolment history"
                    onClick={() => setHistoryFor(e)}
                  >
                    <History className="h-4 w-4" />
                  </button>
                  {e.status !== 'WITHDRAWN' && (
                    <button
                      type="button"
                      className="rounded p-1.5 text-red-600 hover:bg-red-50"
                      aria-label={`Withdraw ${e.student.fullName}`}
                      title="Withdraw"
                      onClick={() => {
                        setWithdrawing(e);
                        setReason('');
                      }}
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}

      <Modal
        open={!!transferring}
        title={`Transfer ${transferring?.student.fullName ?? ''}`}
        onClose={() => setTransferring(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setTransferring(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!toBatchId || transfer.isPending}
              onClick={() => transfer.mutate()}
            >
              Transfer
            </button>
          </>
        }
      >
        <p className="mb-4 text-sm text-ink-soft">
          The previous batch, the reason and your name are kept on the enrolment history.
        </p>
        <Field label="Move to batch">
          <select className="input" value={toBatchId} onChange={(e) => setToBatchId(e.target.value)}>
            <option value="">Select a batch…</option>
            {batches
              ?.filter((b) => b.id !== transferring?.batch?.id)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Reason">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {transfer.isError && <p className="text-sm text-red-600">{errorMessage(transfer.error)}</p>}
      </Modal>

      <Modal
        open={!!withdrawing}
        title={`Withdraw ${withdrawing?.student.fullName ?? ''}?`}
        onClose={() => setWithdrawing(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setWithdrawing(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={withdraw.isPending}
              onClick={() => withdraw.mutate()}
            >
              Withdraw learner
            </button>
          </>
        }
      >
        <p className="mb-4 text-sm text-ink-soft">
          The enrolment is marked withdrawn rather than deleted, so attendance, submissions and
          history all remain intact.
        </p>
        <Field label="Reason">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {withdraw.isError && <p className="text-sm text-red-600">{errorMessage(withdraw.error)}</p>}
      </Modal>

      <Modal
        open={!!historyFor}
        title={`Enrolment history — ${historyFor?.student.fullName ?? ''}`}
        onClose={() => setHistoryFor(null)}
        footer={
          <button type="button" className="btn-secondary" onClick={() => setHistoryFor(null)}>
            Close
          </button>
        }
      >
        {!history ? (
          <Loading />
        ) : !history.length ? (
          <EmptyState title="No history recorded" />
        ) : (
          <ol className="space-y-3">
            {history.map((h) => (
              <li key={h.id} className="border-l-2 border-slate-200 pl-4">
                <p className="text-sm font-medium text-ink">
                  {h.action.replace(/_/g, ' ').toLowerCase()}
                </p>
                {h.reason && <p className="text-sm text-ink-soft">{h.reason}</p>}
                <p className="text-xs text-slate-500">
                  {new Date(h.at).toLocaleString('en-IN')}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Modal>
    </Card>
  );
}

/** Enrols one learner — the batch-wide action cannot express exceptions. */
function EnrolStudentModal({
  open,
  onClose,
  onDone,
  batches,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  batches: any[];
}) {
  const [studentId, setStudentId] = useState('');
  const [courseId, setCourseId] = useState('');
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
    enabled: open,
  });

  const { data: courses } = useQuery({
    queryKey: ['courses', 'picker'],
    queryFn: async () => (await api.get<any>('/courses', { params: { limit: 100 } })).data,
    enabled: open,
  });

  const enrol = useMutation({
    mutationFn: async () =>
      (await api.post('/enrollments', { studentId, courseId, batchId: batchId || undefined })).data,
    onSuccess: () => {
      setStudentId('');
      setCourseId('');
      setBatchId('');
      onDone();
    },
  });

  return (
    <Modal
      open={open}
      title="Enrol a student"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!studentId || !courseId || enrol.isPending}
            onClick={() => enrol.mutate()}
          >
            Enrol
          </button>
        </>
      }
    >
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Course">
          <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Select…</option>
            {courses?.items?.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Batch (optional)">
          <select className="input" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">No batch</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {enrol.isError && <p className="text-sm text-red-600">{errorMessage(enrol.error)}</p>}
      {enrol.isSuccess && (
        <p className="text-sm text-emerald-700">Enrolled — the learner sees the course immediately.</p>
      )}
    </Modal>
  );
}
