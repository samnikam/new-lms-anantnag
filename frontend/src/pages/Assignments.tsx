import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus, Upload } from 'lucide-react';
import { API_BASE, api, errorMessage } from '../lib/api';
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

export function AssignmentsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const isStudent = user!.role === 'STUDENT';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['assignments'],
    queryFn: async () => (await api.get<any[]>('/assignments')).data,
  });

  return (
    <>
      <PageHeader
        title="Assignments"
        description={isStudent ? 'Your assignments and submission status.' : 'Create, publish and grade assignments.'}
        actions={
          !isStudent && (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              New assignment
            </button>
          )
        }
      />

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : !data?.length ? (
        <EmptyState title="No assignments" description={isStudent ? 'Nothing has been set yet.' : 'Create the first one.'} />
      ) : (
        <Card>
          <Table headers={['Assignment', 'Course', 'Due', 'Marks', isStudent ? 'My status' : 'Submissions']}>
            {data.map((a: any) => (
              <tr key={a.id}>
                <td className="td">
                  <Link to={`/assignments/${a.id}`} className="font-medium text-brand-800 hover:underline">
                    {a.title}
                  </Link>
                </td>
                <td className="td text-slate-600">{a.course.title}</td>
                <td className="td whitespace-nowrap text-slate-600">
                  {format(new Date(a.dueAt), 'dd MMM yyyy, HH:mm')}
                </td>
                <td className="td tabular-nums">{a.maxMarks}</td>
                <td className="td">
                  {isStudent ? (
                    a.submissions?.[0] ? (
                      <StatusBadge status={a.submissions[0].status} />
                    ) : (
                      <StatusBadge status="PENDING" />
                    )
                  ) : (
                    <span className="tabular-nums">{a._count?.submissions ?? 0}</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <CreateAssignmentModal
        open={creating}
        onClose={() => setCreating(false)}
        onDone={() => {
          setCreating(false);
          qc.invalidateQueries({ queryKey: ['assignments'] });
        }}
      />
    </>
  );
}

function CreateAssignmentModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    courseId: '',
    title: '',
    instructions: '',
    maxMarks: 100,
    dueAt: '',
    allowLate: true,
    latePenaltyPct: 10,
  });

  const { data: courses } = useQuery({
    queryKey: ['courses', 'picker'],
    queryFn: async () => (await api.get<any>('/courses', { params: { limit: 100 } })).data,
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async () => {
      const assignment = (
        await api.post<any>('/assignments', {
          ...form,
          maxMarks: Number(form.maxMarks),
          latePenaltyPct: Number(form.latePenaltyPct),
          dueAt: new Date(form.dueAt).toISOString(),
        })
      ).data;
      // Publishing is what notifies learners, so do both in one action.
      await api.post(`/assignments/${assignment.id}/publish`, {});
      return assignment;
    },
    onSuccess: onDone,
  });

  return (
    <Modal
      open={open}
      title="New assignment"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.courseId || !form.title || !form.dueAt || create.isPending}
            onClick={() => create.mutate()}
          >
            Create and publish
          </button>
        </>
      }
    >
      <Field label="Course">
        <select className="input" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
          <option value="">Select a course…</option>
          {courses?.items?.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Title">
        <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </Field>

      <Field label="Instructions">
        <textarea
          className="input"
          rows={4}
          value={form.instructions}
          onChange={(e) => setForm({ ...form, instructions: e.target.value })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Due date">
          <input
            className="input"
            type="datetime-local"
            value={form.dueAt}
            onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
          />
        </Field>
        <Field label="Maximum marks">
          <input
            className="input"
            type="number"
            min={1}
            value={form.maxMarks}
            onChange={(e) => setForm({ ...form, maxMarks: Number(e.target.value) })}
          />
        </Field>
        <Field label="Late penalty (%)">
          <input
            className="input"
            type="number"
            min={0}
            max={100}
            value={form.latePenaltyPct}
            onChange={(e) => setForm({ ...form, latePenaltyPct: Number(e.target.value) })}
          />
        </Field>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.allowLate}
          onChange={(e) => setForm({ ...form, allowLate: e.target.checked })}
        />
        Accept late submissions
      </label>

      {create.isError && <p className="mt-3 text-sm text-red-600">{errorMessage(create.error)}</p>}
    </Modal>
  );
}

export function AssignmentDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const isStudent = user!.role === 'STUDENT';

  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [grading, setGrading] = useState<any>(null);
  const [marks, setMarks] = useState('');
  const [feedback, setFeedback] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['assignment', id],
    queryFn: async () => (await api.get<any>(`/assignments/${id}`)).data,
  });

  const submit = useMutation({
    mutationFn: async () => {
      let fileKey: string | undefined;
      let fileName: string | undefined;

      if (file) {
        const body = new FormData();
        body.append('file', file);
        const upload = (await api.post<any>('/uploads', body)).data;
        fileKey = upload.fileKey;
        fileName = upload.originalName;
      }

      return (await api.post(`/assignments/${id}/submit`, { text, fileKey, fileName })).data;
    },
    onSuccess: () => {
      setText('');
      setFile(null);
      qc.invalidateQueries({ queryKey: ['assignment', id] });
      qc.invalidateQueries({ queryKey: ['assignments'] });
    },
  });

  const grade = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/assignments/submissions/${grading.id}/grade`, {
          marks: Number(marks),
          feedback,
        })
      ).data,
    onSuccess: () => {
      setGrading(null);
      setMarks('');
      setFeedback('');
      qc.invalidateQueries({ queryKey: ['assignment', id] });
    },
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const mySubmission = data.submissions?.find((s: any) => s.studentId === user!.id);

  return (
    <>
      <PageHeader
        title={data.title}
        description={`${data.course.title} · Due ${format(new Date(data.dueAt), 'dd MMM yyyy, HH:mm')} · ${data.maxMarks} marks`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Instructions">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {data.instructions || 'No instructions were provided.'}
            </p>
          </Card>

          {isStudent ? (
            <Card title="My submission" className="mt-6">
              {mySubmission && (
                <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="mb-2 flex items-center gap-2">
                    <StatusBadge status={mySubmission.status} />
                    {mySubmission.submittedAt && (
                      <span className="text-xs text-slate-500">
                        Submitted {format(new Date(mySubmission.submittedAt), 'dd MMM, HH:mm')}
                      </span>
                    )}
                  </div>
                  {mySubmission.marks !== null && (
                    <p className="font-medium">
                      Marks: {mySubmission.marks}/{data.maxMarks}
                    </p>
                  )}
                  {mySubmission.feedback && (
                    <p className="mt-1 text-ink-soft">Feedback: {mySubmission.feedback}</p>
                  )}
                </div>
              )}

              <Field label="Your answer">
                <textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
              </Field>

              <Field label="Attachment" hint="PDF, document, image or presentation, up to 200 MB.">
                <input type="file" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </Field>

              <button
                type="button"
                className="btn-primary"
                onClick={() => submit.mutate()}
                disabled={submit.isPending || (!text && !file)}
              >
                <Upload className="h-4 w-4" aria-hidden />
                {submit.isPending ? 'Submitting…' : mySubmission ? 'Resubmit' : 'Submit'}
              </button>

              {submit.isError && <p className="mt-3 text-sm text-red-600">{errorMessage(submit.error)}</p>}
              {submit.isSuccess && <p className="mt-3 text-sm text-emerald-700">Submission received.</p>}
            </Card>
          ) : (
            <Card title={`Submissions (${data.submissions.length})`} className="mt-6">
              {data.submissions.length ? (
                <Table headers={['Learner', 'Submitted', 'Status', 'Marks', '']}>
                  {data.submissions.map((s: any) => (
                    <tr key={s.id}>
                      <td className="td font-medium">{s.student.fullName}</td>
                      <td className="td text-slate-600">
                        {s.submittedAt ? format(new Date(s.submittedAt), 'dd MMM, HH:mm') : '—'}
                      </td>
                      <td className="td">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="td tabular-nums">{s.marks ?? '—'}</td>
                      <td className="td text-right">
                        <button
                          type="button"
                          className="text-sm text-brand-700 hover:underline"
                          onClick={() => {
                            setGrading(s);
                            setMarks(s.marks?.toString() ?? '');
                            setFeedback(s.feedback ?? '');
                          }}
                        >
                          Grade
                        </button>
                      </td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <EmptyState title="No submissions yet" />
              )}
            </Card>
          )}
        </div>

        <Card title="Details">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Maximum marks</dt>
              <dd className="mt-0.5 tabular-nums">{data.maxMarks}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Late submissions</dt>
              <dd className="mt-0.5">
                {data.allowLate ? `Accepted with a ${data.latePenaltyPct}% penalty` : 'Not accepted'}
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <Modal
        open={!!grading}
        title={`Grade — ${grading?.student.fullName ?? ''}`}
        onClose={() => setGrading(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setGrading(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" disabled={!marks || grade.isPending} onClick={() => grade.mutate()}>
              Save grade
            </button>
          </>
        }
      >
        {grading?.text && (
          <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm whitespace-pre-wrap">
            {grading.text}
          </div>
        )}
        {grading?.fileKey && (
          <a
            href={`${API_BASE}/uploads/${grading.fileKey}`}
            target="_blank"
            rel="noreferrer"
            className="mb-4 inline-block text-sm text-brand-700 hover:underline"
          >
            Open attachment: {grading.fileName}
          </a>
        )}

        <Field label={`Marks (out of ${data.maxMarks})`}>
          <input className="input" type="number" min={0} max={data.maxMarks} value={marks} onChange={(e) => setMarks(e.target.value)} />
        </Field>
        <Field label="Feedback">
          <textarea className="input" rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
        </Field>
        {grade.isError && <p className="text-sm text-red-600">{errorMessage(grade.error)}</p>}
      </Modal>
    </>
  );
}
