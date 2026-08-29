import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Check, Play, Radio, Square, Video, X } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
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

export function LivePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [scheduling, setScheduling] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['live-sessions'],
    queryFn: async () => (await api.get<any[]>('/live-sessions')).data,
    refetchInterval: 60_000,
  });

  const canSchedule = ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER'].includes(user!.role);

  return (
    <>
      <PageHeader
        title="Live & Broadcast"
        description="Studio broadcasts relayed to classroom panels, and standard meeting sessions."
        actions={
          canSchedule && (
            <button type="button" className="btn-primary" onClick={() => setScheduling(true)}>
              <Video className="h-4 w-4" aria-hidden />
              Schedule session
            </button>
          )
        }
      />

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : !data?.length ? (
        <EmptyState title="No sessions scheduled" description="Scheduled live classes appear here." />
      ) : (
        <Card>
          <Table headers={['Session', 'Mode', 'When', 'Studio', 'Classrooms', 'Status', '']}>
            {data.map((s) => (
              <tr key={s.id}>
                <td className="td">
                  <Link to={`/live/${s.id}`} className="font-medium text-brand-800 hover:underline">
                    {s.title}
                  </Link>
                  <p className="text-xs text-slate-500">{s.course?.title ?? 'General'}</p>
                </td>
                <td className="td">
                  {s.mode === 'BROADCAST' ? (
                    <Badge tone="info">
                      <Radio className="mr-1 h-3 w-3" aria-hidden />
                      Broadcast
                    </Badge>
                  ) : (
                    <Badge>Meeting</Badge>
                  )}
                </td>
                <td className="td whitespace-nowrap text-slate-600">
                  {format(new Date(s.scheduledStart), 'dd MMM, HH:mm')}
                </td>
                <td className="td text-slate-600">{s.originRoom?.name ?? '—'}</td>
                <td className="td tabular-nums">{s.targets?.length ?? 0}</td>
                <td className="td">
                  <StatusBadge status={s.status} />
                </td>
                <td className="td text-right">
                  <Link to={`/live/${s.id}`} className="text-sm text-brand-700 hover:underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <ScheduleModal
        open={scheduling}
        onClose={() => setScheduling(false)}
        onDone={() => {
          setScheduling(false);
          qc.invalidateQueries({ queryKey: ['live-sessions'] });
        }}
      />
    </>
  );
}

/**
 * Scheduling a broadcast is a one-to-many action: pick the studio once, then
 * select every classroom that should receive the relay.
 */
function ScheduleModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    title: '',
    courseId: '',
    mode: 'BROADCAST',
    originRoomId: '',
    scheduledStart: '',
    scheduledEnd: '',
    createZoomMeeting: true,
    moderatedQA: true,
  });
  const [targets, setTargets] = useState<string[]>([]);

  const { data: classrooms } = useQuery({
    queryKey: ['classrooms'],
    queryFn: async () => (await api.get<any[]>('/classrooms')).data,
    enabled: open,
  });

  const { data: courses } = useQuery({
    queryKey: ['courses', 'picker'],
    queryFn: async () => (await api.get<any>('/courses', { params: { limit: 100 } })).data,
    enabled: open,
  });

  const studios = classrooms?.filter((c) => c.isStudio) ?? [];
  const rooms = classrooms?.filter((c) => !c.isStudio) ?? [];

  const schedule = useMutation({
    mutationFn: async () =>
      (
        await api.post('/live-sessions', {
          ...form,
          courseId: form.courseId || undefined,
          originRoomId: form.mode === 'BROADCAST' ? form.originRoomId : undefined,
          targetClassroomIds: form.mode === 'BROADCAST' ? targets : undefined,
          scheduledStart: new Date(form.scheduledStart).toISOString(),
          scheduledEnd: new Date(form.scheduledEnd).toISOString(),
        })
      ).data,
    onSuccess: onDone,
  });

  // Group the room list by site so selecting a whole site is one click.
  const bySite = rooms.reduce<Record<string, any[]>>((acc, room) => {
    const key = room.site.name;
    (acc[key] ??= []).push(room);
    return acc;
  }, {});

  return (
    <Modal
      open={open}
      title="Schedule a live session"
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
              !form.title ||
              !form.scheduledStart ||
              !form.scheduledEnd ||
              (form.mode === 'BROADCAST' && (!form.originRoomId || targets.length === 0)) ||
              schedule.isPending
            }
            onClick={() => schedule.mutate()}
          >
            Schedule
          </button>
        </>
      }
    >
      <Field label="Title">
        <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Course">
          <select className="input" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
            <option value="">No specific course</option>
            {courses?.items?.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Mode" hint="Broadcast relays one studio to many classrooms.">
          <select className="input" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
            <option value="BROADCAST">Studio broadcast (one to many)</option>
            <option value="MEETING">Standard meeting</option>
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts">
          <input
            className="input"
            type="datetime-local"
            value={form.scheduledStart}
            onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })}
          />
        </Field>
        <Field label="Ends">
          <input
            className="input"
            type="datetime-local"
            value={form.scheduledEnd}
            onChange={(e) => setForm({ ...form, scheduledEnd: e.target.value })}
          />
        </Field>
      </div>

      {form.mode === 'BROADCAST' && (
        <>
          <Field label="Origin studio" hint="Only two studios exist — double bookings are rejected.">
            <select
              className="input"
              value={form.originRoomId}
              onChange={(e) => setForm({ ...form, originRoomId: e.target.value })}
            >
              <option value="">Select a studio…</option>
              {studios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.site.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label={`Target classrooms (${targets.length} selected)`}>
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                className="btn-secondary text-xs"
                onClick={() => setTargets(rooms.map((r) => r.id))}
              >
                Select all
              </button>
              <button type="button" className="btn-secondary text-xs" onClick={() => setTargets([])}>
                Clear
              </button>
            </div>

            <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 p-3">
              {Object.entries(bySite).map(([siteName, siteRooms]) => (
                <fieldset key={siteName} className="mb-3">
                  <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {siteName}
                  </legend>
                  {siteRooms.map((room) => (
                    <label key={room.id} className="flex items-center gap-2 py-1 text-sm">
                      <input
                        type="checkbox"
                        checked={targets.includes(room.id)}
                        onChange={(e) =>
                          setTargets((prev) =>
                            e.target.checked ? [...prev, room.id] : prev.filter((id) => id !== room.id),
                          )
                        }
                      />
                      {room.name} <span className="text-xs text-slate-400">({room.code})</span>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
          </Field>

          <label className="mb-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.moderatedQA}
              onChange={(e) => setForm({ ...form, moderatedQA: e.target.checked })}
            />
            Moderate classroom questions before they are aired
          </label>
        </>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.createZoomMeeting}
          onChange={(e) => setForm({ ...form, createZoomMeeting: e.target.checked })}
        />
        Create a Zoom meeting for this session
      </label>

      {schedule.isError && <p className="mt-3 text-sm text-red-600">{errorMessage(schedule.error)}</p>}
    </Modal>
  );
}

export function SessionDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: session, isLoading, error, refetch } = useQuery({
    queryKey: ['live-session', id],
    queryFn: async () => (await api.get<any>(`/live-sessions/${id}`)).data,
    refetchInterval: 30_000,
  });

  const { data: questions } = useQuery({
    queryKey: ['session-questions', id],
    queryFn: async () => (await api.get<any[]>(`/live-sessions/${id}/questions`, { params: { all: true } })).data,
    refetchInterval: 15_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['live-session', id] });
    qc.invalidateQueries({ queryKey: ['session-questions', id] });
  };

  const action = useMutation({
    mutationFn: async (verb: 'start' | 'end' | 'cancel') =>
      (await api.post(`/live-sessions/${id}/${verb}`, {})).data,
    onSuccess: invalidate,
  });

  const moderate = useMutation({
    mutationFn: async ({ questionId, approved }: { questionId: string; approved: boolean }) =>
      (await api.patch(`/live-sessions/questions/${questionId}`, { approved })).data,
    onSuccess: invalidate,
  });

  const join = useMutation({
    mutationFn: async () => (await api.get(`/live-sessions/${id}/join`)).data,
    onSuccess: (data: any) => {
      if (data.url) window.open(data.url, '_blank', 'noopener');
    },
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const isHost = session.host.id === user!.id;
  const canModerate = isHost || ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user!.role);

  return (
    <>
      <PageHeader
        title={session.title}
        description={`${format(new Date(session.scheduledStart), 'dd MMM yyyy, HH:mm')} – ${format(
          new Date(session.scheduledEnd),
          'HH:mm',
        )} · Hosted by ${session.host.fullName}`}
        actions={
          <>
            <StatusBadge status={session.status} />
            {session.status !== 'CANCELLED' && session.status !== 'COMPLETED' && (
              <button type="button" className="btn-secondary" onClick={() => join.mutate()}>
                <Play className="h-4 w-4" aria-hidden />
                Join
              </button>
            )}
            {isHost && session.status === 'SCHEDULED' && (
              <>
                <button type="button" className="btn-primary" onClick={() => action.mutate('start')}>
                  <Radio className="h-4 w-4" aria-hidden />
                  Go live
                </button>
                <button type="button" className="btn-secondary" onClick={() => action.mutate('cancel')}>
                  Cancel session
                </button>
              </>
            )}
            {isHost && session.status === 'LIVE' && (
              <button type="button" className="btn-danger" onClick={() => action.mutate('end')}>
                <Square className="h-4 w-4" aria-hidden />
                End session
              </button>
            )}
          </>
        }
      />

      {action.isError && (
        <div className="mb-4">
          <ErrorState message={errorMessage(action.error)} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Target classrooms (${session.targets.length})`}>
            {session.targets.length ? (
              <Table headers={['Classroom', 'Site', 'Joined', 'Link']}>
                {session.targets.map((t: any) => (
                  <tr key={t.id}>
                    <td className="td">
                      {t.classroom.name}
                      <p className="text-xs text-slate-500">{t.classroom.code}</p>
                    </td>
                    <td className="td text-slate-600">{t.classroom.site.name}</td>
                    <td className="td text-slate-600">
                      {t.joinedAt ? format(new Date(t.joinedAt), 'HH:mm') : '—'}
                    </td>
                    <td className="td">
                      {t.connectionOk ? (
                        <Badge tone="good">connected</Badge>
                      ) : (
                        <Badge tone="bad">dropped — playing recording</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <EmptyState title="No classrooms targeted" description="This is a standard meeting session." />
            )}
          </Card>

          <Card title="Classroom questions">
            {questions?.length ? (
              <ul className="divide-y divide-slate-100">
                {questions.map((q: any) => (
                  <li key={q.id} className="flex items-start justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm text-ink">{q.body}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {format(new Date(q.createdAt), 'HH:mm')}
                        {q.approved ? ' · approved for air' : ' · awaiting moderation'}
                      </p>
                    </div>
                    {canModerate && !q.approved && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50"
                          aria-label="Approve question"
                          onClick={() => moderate.mutate({ questionId: q.id, approved: true })}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded p-1.5 text-red-700 hover:bg-red-50"
                          aria-label="Dismiss question"
                          onClick={() => moderate.mutate({ questionId: q.id, approved: false })}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No questions yet" />
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Session details">
            <dl className="space-y-3 text-sm">
              <Detail label="Mode" value={session.mode === 'BROADCAST' ? 'Studio broadcast' : 'Standard meeting'} />
              <Detail label="Course" value={session.course?.title ?? '—'} />
              <Detail label="Origin studio" value={session.originRoom?.name ?? '—'} />
              <Detail label="Moderated Q&A" value={session.moderatedQA ? 'Yes' : 'No'} />
              {session.recordingUrl && (
                <div>
                  <dt className="text-slate-500">Recording</dt>
                  <dd className="mt-0.5">
                    <a href={session.recordingUrl} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                      Watch recording
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </Card>

          {['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER'].includes(user!.role) && (
            <Card title="Attendance">
              <Link to={`/attendance?sessionId=${session.id}`} className="btn-secondary w-full">
                Mark attendance for this session
              </Link>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
