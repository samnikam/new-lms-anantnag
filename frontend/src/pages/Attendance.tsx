import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { PencilLine, Save } from 'lucide-react';
import clsx from 'clsx';
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
  ProgressBar,
  StatCard,
  StatusBadge,
  Table,
} from '../components/ui';

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;

export function AttendancePage() {
  const { user } = useAuth();
  return user!.role === 'STUDENT' ? <StudentAttendance /> : <TeacherAttendance />;
}

function StudentAttendance() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['attendance', 'mine'],
    queryFn: async () => (await api.get<any>('/attendance/my-summary')).data,
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <>
      <PageHeader title="My Attendance" description="Your attendance record across all sessions." />

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard
          label="Attendance"
          value={`${data.percentage}%`}
          tone={data.percentage >= 75 ? 'good' : 'bad'}
          hint={data.percentage < 75 ? 'Below the 75% requirement' : 'Meets the requirement'}
        />
        <StatCard label="Sessions" value={data.total} />
        <StatCard label="Present" value={data.present} tone="good" />
        <StatCard label="Absent" value={data.absent} tone={data.absent > 0 ? 'warn' : 'good'} />
      </div>

      <Card title="Recent sessions">
        {data.recent?.length ? (
          <Table headers={['Date', 'Status']}>
            {data.recent.map((r: any, i: number) => (
              <tr key={i}>
                <td className="td">{format(new Date(r.date), 'dd MMM yyyy')}</td>
                <td className="td">
                  <StatusBadge status={r.status} />
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <EmptyState title="No attendance recorded yet" />
        )}
      </Card>
    </>
  );
}

/** Teacher roster marking: individual marks and room-level headcounts together. */
function TeacherAttendance() {
  const { user } = useAuth();
  const canCorrect = ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user!.role);
  const [view, setView] = useState<'mark' | 'corrections'>('mark');
  const [params, setParams] = useSearchParams();
  const sessionId = params.get('sessionId') ?? '';
  const qc = useQueryClient();
  const [marks, setMarks] = useState<Record<string, string>>({});

  const { data: sessions } = useQuery({
    queryKey: ['live-sessions', 'for-attendance'],
    queryFn: async () => (await api.get<any[]>('/live-sessions')).data,
  });

  const { data: roster, isLoading, error, refetch } = useQuery({
    queryKey: ['roster', sessionId],
    queryFn: async () => (await api.get<any>(`/attendance/sessions/${sessionId}/roster`)).data,
    enabled: !!sessionId,
  });

  // Seed the form from whatever is already saved for this session.
  useEffect(() => {
    if (!roster) return;
    setMarks(
      Object.fromEntries(
        roster.individual.map((row: any) => [row.studentId, row.status ?? 'PRESENT']),
      ),
    );
  }, [roster]);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/attendance/sessions/${sessionId}/mark`, {
          entries: Object.entries(marks).map(([studentId, status]) => ({ studentId, status })),
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roster', sessionId] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  return (
    <>
      <PageHeader
        title="Attendance"
        description="Mark a session roster. Room-level headcounts recorded on classroom panels appear alongside."
        actions={
          sessionId && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => save.mutate()}
              disabled={save.isPending || !Object.keys(marks).length}
            >
              <Save className="h-4 w-4" aria-hidden />
              {save.isPending ? 'Saving…' : 'Save attendance'}
            </button>
          )
        }
      />

      {canCorrect && (
        <div className="mb-4 flex gap-2 border-b border-slate-200">
          {([['mark', 'Mark attendance'], ['corrections', 'Corrections']] as const).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setView(k)}
              className={
                view === k
                  ? 'border-b-2 border-brand-700 px-4 py-2 text-sm font-medium text-brand-800'
                  : 'px-4 py-2 text-sm font-medium text-ink-soft hover:text-ink'
              }
            >
              {l}
            </button>
          ))}
        </div>
      )}

      {view === 'corrections' ? (
        <AttendanceCorrections />
      ) : (
      <>
      <Card className="mb-6">
        <label className="label" htmlFor="session-picker">
          Session
        </label>
        <select
          id="session-picker"
          className="input max-w-xl"
          value={sessionId}
          onChange={(e) => setParams(e.target.value ? { sessionId: e.target.value } : {})}
        >
          <option value="">Select a session…</option>
          {sessions?.map((s) => (
            <option key={s.id} value={s.id}>
              {format(new Date(s.scheduledStart), 'dd MMM, HH:mm')} — {s.title}
            </option>
          ))}
        </select>
      </Card>

      {save.isSuccess && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Attendance saved. Guardians of learners below the threshold have been alerted.
        </div>
      )}
      {save.isError && (
        <div className="mb-4">
          <ErrorState message={errorMessage(save.error)} />
        </div>
      )}

      {!sessionId ? (
        <EmptyState title="Select a session" description="Pick a session above to mark attendance." />
      ) : isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : (
        <div className="space-y-6">
          <Card title={`Individual attendance — ${roster.individual.length} learners`}>
            {roster.individual.length ? (
              <Table headers={['Learner', 'Status']}>
                {roster.individual.map((row: any) => (
                  <tr key={row.studentId}>
                    <td className="td font-medium">{row.fullName}</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1.5">
                        {STATUSES.map((status) => (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setMarks((m) => ({ ...m, [row.studentId]: status }))}
                            className={clsx(
                              'rounded-md border px-3 py-1 text-xs font-medium transition-colors',
                              marks[row.studentId] === status
                                ? 'border-brand-600 bg-brand-600 text-white'
                                : 'border-slate-300 bg-white text-ink-soft hover:bg-slate-50',
                            )}
                          >
                            {status.toLowerCase()}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <EmptyState
                title="No individual roster"
                description="This session has no course enrolments; use room-level headcounts instead."
              />
            )}
          </Card>

          <Card title="Room-level attendance (classroom panels)">
            {roster.rooms.length ? (
              <Table headers={['Classroom', 'Headcount', 'Status']}>
                {roster.rooms.map((room: any) => (
                  <tr key={room.classroomId}>
                    <td className="td">
                      {room.name}
                      <p className="text-xs text-slate-500">{room.code}</p>
                    </td>
                    <td className="td tabular-nums">{room.headcount ?? 'Not recorded'}</td>
                    <td className="td">{room.status ? <StatusBadge status={room.status} /> : '—'}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <EmptyState title="No classrooms targeted by this session" />
            )}
          </Card>
        </div>
      )}
      </>
      )}
    </>
  );
}

/**
 * Attendance corrections — the academic office's supervisory job. A teacher
 * marks; an admin corrects a mistake afterwards, and every correction keeps
 * the previous value, the reason and the actor.
 */
function AttendanceCorrections() {
  const qc = useQueryClient();
  const [studentId, setStudentId] = useState('');
  const [correcting, setCorrecting] = useState<any | null>(null);
  const [status, setStatus] = useState('PRESENT');
  const [reason, setReason] = useState('');

  const { data: students } = useQuery({
    queryKey: ['users', 'students', 'correction'],
    queryFn: async () =>
      (await api.get<any>('/users', { params: { role: 'STUDENT', limit: 200 } })).data,
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ['attendance', 'records', studentId],
    queryFn: async () =>
      (await api.get<any[]>('/attendance', { params: { studentId: studentId || undefined } })).data,
  });

  const correct = useMutation({
    mutationFn: async () =>
      (await api.patch(`/attendance/${correcting.id}/correct`, { status, reason })).data,
    onSuccess: () => {
      setCorrecting(null);
      setReason('');
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
  });

  return (
    <>
      <Card className="mb-6">
        <label className="label" htmlFor="student-filter">
          Learner
        </label>
        <select
          id="student-filter"
          className="input max-w-md"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
        >
          <option value="">All learners</option>
          {students?.items?.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.fullName}
            </option>
          ))}
        </select>
      </Card>

      <Card title="Attendance records">
        {isLoading ? (
          <Loading />
        ) : !rows?.length ? (
          <EmptyState
            title="No attendance recorded yet"
            description="Records appear once a teacher marks a session."
          />
        ) : (
          <Table headers={['Date', 'Learner', 'Session', 'Kind', 'Status', 'Corrections', '']}>
            {rows.slice(0, 100).map((r) => (
              <tr key={r.id}>
                <td className="td whitespace-nowrap text-slate-600">
                  {format(new Date(r.date), 'dd MMM yyyy')}
                </td>
                <td className="td font-medium">
                  {r.student?.fullName ?? r.classroom?.name ?? '—'}
                </td>
                <td className="td text-slate-600">{r.session?.title ?? '—'}</td>
                <td className="td text-xs text-slate-500">
                  {r.kind === 'ROOM_LEVEL' ? `room (${r.headcount ?? 0})` : 'individual'}
                </td>
                <td className="td">
                  <StatusBadge status={r.status} />
                </td>
                <td className="td tabular-nums">
                  {r.corrections?.length ? (
                    <span title={r.corrections.map((c: any) => c.reason).join(' · ')}>
                      {r.corrections.length}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="td text-right">
                  {r.studentId && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline"
                      onClick={() => {
                        setCorrecting(r);
                        setStatus(r.status);
                        setReason('');
                      }}
                    >
                      <PencilLine className="h-4 w-4" aria-hidden />
                      Correct
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        open={!!correcting}
        title="Correct attendance"
        onClose={() => setCorrecting(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setCorrecting(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={reason.trim().length < 5 || status === correcting?.status || correct.isPending}
              onClick={() => correct.mutate()}
            >
              Save correction
            </button>
          </>
        }
      >
        <p className="mb-4 text-sm text-ink-soft">
          {correcting?.student?.fullName} is currently marked{' '}
          <strong>{correcting?.status?.toLowerCase()}</strong>. The previous value, your reason and
          your name are all recorded against this change.
        </p>

        <Field label="Corrected status">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Reason" hint="Required — at least 5 characters.">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>

        {correct.isError && <p className="text-sm text-red-600">{errorMessage(correct.error)}</p>}
      </Modal>
    </>
  );
}
