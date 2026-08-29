import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isSameDay } from 'date-fns';
import { BadgeCheck, Bell, Download, Megaphone, Search, ShieldX } from 'lucide-react';
import { API_BASE, api, errorMessage, getAccessToken } from '../lib/api';
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
  Table,
} from '../components/ui';

// ─────────────────────────── Calendar ───────────────────────────

export function CalendarPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['calendar'],
    queryFn: async () => (await api.get<any[]>('/calendar')).data,
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  // Group events by day so the timetable reads as an agenda, not a flat list.
  const days = (data ?? []).reduce<Array<{ date: Date; events: any[] }>>((acc, event) => {
    const date = new Date(event.startAt);
    const day = acc.find((d) => isSameDay(d.date, date));
    if (day) day.events.push(event);
    else acc.push({ date, events: [event] });
    return acc;
  }, []);

  return (
    <>
      <PageHeader title="Timetable & Calendar" description="Classes, exams and deadlines." />

      {!days.length ? (
        <EmptyState title="Nothing scheduled" description="Classes and deadlines appear here once scheduled." />
      ) : (
        <div className="space-y-4">
          {days.map((day) => (
            <Card key={day.date.toISOString()} title={format(day.date, 'EEEE, dd MMMM yyyy')}>
              <ul className="divide-y divide-slate-100">
                {day.events.map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="font-medium text-ink">{event.title}</p>
                      <p className="text-xs text-slate-500">{event.type.toLowerCase()}</p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-slate-600">
                      {format(new Date(event.startAt), 'HH:mm')} – {format(new Date(event.endAt), 'HH:mm')}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// ───────────────────────── Certificates ─────────────────────────

export function CertificatesPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['certificates'],
    queryFn: async () => (await api.get<any[]>('/certificates')).data,
  });

  async function download(id: string, certificateNo: string) {
    const res = await fetch(`${API_BASE}/certificates/${id}/download`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      credentials: 'include',
    });
    if (!res.ok) return;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${certificateNo.replace(/\//g, '-')}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <>
      <PageHeader title="Certificates" description="Issued certificates, downloadable as PDF with public verification." />

      {!data?.length ? (
        <EmptyState
          title="No certificates yet"
          description="A certificate is issued automatically once a course completion rule is met."
        />
      ) : (
        <Card>
          <Table headers={['Certificate no.', 'Course', 'Holder', 'Issued', '']}>
            {data.map((c) => (
              <tr key={c.id}>
                <td className="td font-mono text-xs">{c.certificateNo}</td>
                <td className="td font-medium">{c.course.title}</td>
                <td className="td text-slate-600">{c.student.fullName}</td>
                <td className="td text-slate-600">{format(new Date(c.issuedAt), 'dd MMM yyyy')}</td>
                <td className="td text-right">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline"
                    onClick={() => download(c.id, c.certificateNo)}
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    Download
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}

/** Public verification — reachable without signing in. */
export function VerifyCertificatePage() {
  const { token } = useParams();
  const [query, setQuery] = useState(token ?? '');
  const [checking, setChecking] = useState(token ?? '');

  const { data, isLoading } = useQuery({
    queryKey: ['verify', checking],
    queryFn: async () => (await api.get<any>(`/verify/${encodeURIComponent(checking)}`)).data,
    enabled: !!checking,
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-ink">Certificate verification</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Hybrid Learning LMS Portal — PWD J&amp;K, R&amp;B Division Pahalgam
          </p>
        </div>

        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setChecking(query.trim());
            }}
          >
            <Field label="Certificate number or verification code">
              <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
            </Field>
            <button type="submit" className="btn-primary w-full">
              <Search className="h-4 w-4" aria-hidden />
              Verify
            </button>
          </form>

          {isLoading && <Loading label="Checking…" />}

          {data && (
            <div
              className={
                data.valid
                  ? 'mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-5'
                  : 'mt-6 rounded-md border border-red-200 bg-red-50 p-5'
              }
            >
              {data.valid ? (
                <>
                  <div className="mb-3 flex items-center gap-2 text-emerald-800">
                    <BadgeCheck className="h-5 w-5" aria-hidden />
                    <p className="font-semibold">Valid certificate</p>
                  </div>
                  <dl className="space-y-2 text-sm text-emerald-900">
                    <div className="flex justify-between gap-4">
                      <dt>Holder</dt>
                      <dd className="font-medium">{data.holder}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>Course</dt>
                      <dd className="font-medium">{data.course}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>Certificate no.</dt>
                      <dd className="font-mono text-xs">{data.certificateNo}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>Issued</dt>
                      <dd>{format(new Date(data.issuedAt), 'dd MMM yyyy')}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <div className="flex items-center gap-2 text-red-800">
                  <ShieldX className="h-5 w-5" aria-hidden />
                  <p className="text-sm font-medium">{data.message}</p>
                </div>
              )}
            </div>
          )}
        </Card>

        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="text-brand-700 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

// ───────────────────────── Announcements ─────────────────────────

export function AnnouncementsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [posting, setPosting] = useState(false);
  const [form, setForm] = useState({ title: '', body: '', courseId: '', pinned: false });

  const canPost = ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER'].includes(user!.role);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['announcements'],
    queryFn: async () => (await api.get<any[]>('/announcements')).data,
  });

  const { data: courses } = useQuery({
    queryKey: ['courses', 'picker'],
    queryFn: async () => (await api.get<any>('/courses', { params: { limit: 100 } })).data,
    enabled: posting,
  });

  const post = useMutation({
    mutationFn: async () =>
      (await api.post('/announcements', { ...form, courseId: form.courseId || undefined })).data,
    onSuccess: () => {
      setPosting(false);
      setForm({ title: '', body: '', courseId: '', pinned: false });
      qc.invalidateQueries({ queryKey: ['announcements'] });
    },
  });

  return (
    <>
      <PageHeader
        title="Announcements"
        description="Notices from administrators and teachers."
        actions={
          canPost && (
            <button type="button" className="btn-primary" onClick={() => setPosting(true)}>
              <Megaphone className="h-4 w-4" aria-hidden />
              New announcement
            </button>
          )
        }
      />

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : !data?.length ? (
        <EmptyState title="No announcements" />
      ) : (
        <div className="space-y-4">
          {data.map((a) => (
            <Card key={a.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-ink">{a.title}</h2>
                {a.pinned && <Badge tone="warn">pinned</Badge>}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{a.body}</p>
              <p className="mt-3 text-xs text-slate-500">
                {a.author.fullName} · {format(new Date(a.publishedAt), 'dd MMM yyyy, HH:mm')}
              </p>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={posting}
        title="New announcement"
        onClose={() => setPosting(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setPosting(false)}>Cancel</button>
            <button type="button" className="btn-primary" disabled={!form.title || !form.body || post.isPending} onClick={() => post.mutate()}>
              Publish
            </button>
          </>
        }
      >
        <Field label="Title">
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Message">
          <textarea className="input" rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </Field>
        <Field label="Course" hint="Learners enrolled in this course also receive a notification.">
          <select className="input" value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
            <option value="">Everyone</option>
            {courses?.items?.map((c: any) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} />
          Pin to the top
        </label>
        {post.isError && <p className="mt-3 text-sm text-red-600">{errorMessage(post.error)}</p>}
      </Modal>
    </>
  );
}

// ───────────────────────── Notifications ─────────────────────────

export function NotificationsPage() {
  const qc = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get<any[]>('/notifications')).data,
  });

  const markAll = useMutation({
    mutationFn: async () => (await api.post('/notifications/read-all', {})).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications', 'unread'] });
    },
  });

  const markOne = useMutation({
    mutationFn: async (id: string) => (await api.post(`/notifications/${id}/read`, {})).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications', 'unread'] });
    },
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Alerts for attendance, results, assignments and sessions."
        actions={
          !!data?.some((n) => !n.readAt) && (
            <button type="button" className="btn-secondary" onClick={() => markAll.mutate()}>
              Mark all as read
            </button>
          )
        }
      />

      {!data?.length ? (
        <EmptyState title="No notifications" />
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100">
            {data.map((n) => (
              <li key={n.id} className={n.readAt ? 'py-4' : 'bg-brand-50/40 px-3 py-4'}>
                <div className="flex items-start gap-3">
                  <Bell className={n.readAt ? 'mt-0.5 h-4 w-4 text-slate-300' : 'mt-0.5 h-4 w-4 text-brand-600'} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{n.title}</p>
                    <p className="text-sm text-ink-soft">{n.body}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {format(new Date(n.createdAt), 'dd MMM yyyy, HH:mm')}
                    </p>
                  </div>
                  {!n.readAt && (
                    <button
                      type="button"
                      className="shrink-0 text-xs text-brand-700 hover:underline"
                      onClick={() => markOne.mutate(n.id)}
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

// ──────────────────────────── Audit ────────────────────────────

export function AuditPage() {
  const [entity, setEntity] = useState('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['audit', entity],
    queryFn: async () => (await api.get<any[]>('/audit', { params: { entity: entity || undefined } })).data,
  });

  return (
    <>
      <PageHeader title="Audit Logs" description="Every privileged action, with actor, target and timestamp." />

      <Card className="mb-6">
        <input
          className="input max-w-xs"
          placeholder="Filter by entity, e.g. User"
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          aria-label="Filter by entity"
        />
      </Card>

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : !data?.length ? (
        <EmptyState title="No audit entries" />
      ) : (
        <Card>
          <Table headers={['When', 'Actor', 'Role', 'Action', 'Entity', 'Target', 'IP']}>
            {data.map((log) => (
              <tr key={log.id}>
                <td className="td whitespace-nowrap text-slate-600">
                  {format(new Date(log.at), 'dd MMM yyyy, HH:mm:ss')}
                </td>
                <td className="td">{log.actor?.fullName ?? 'System'}</td>
                <td className="td text-slate-600">{log.actor?.role?.replace(/_/g, ' ').toLowerCase() ?? '—'}</td>
                <td className="td font-mono text-xs">{log.action}</td>
                <td className="td text-slate-600">{log.entity}</td>
                <td className="td font-mono text-xs text-slate-500">{log.entityId?.slice(0, 8) ?? '—'}</td>
                <td className="td text-xs text-slate-500">{log.ip ?? '—'}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}

// ──────────────────────────── Errors ────────────────────────────

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you are looking for does not exist or has moved."
      action={
        <Link to="/" className="btn-primary">
          Back to dashboard
        </Link>
      }
    />
  );
}

export function ForbiddenPage() {
  return (
    <EmptyState
      title="You do not have access to this page"
      description="Your role does not permit this module. Contact your administrator if you believe this is an error."
      action={
        <Link to="/" className="btn-primary">
          Back to dashboard
        </Link>
      }
    />
  );
}
