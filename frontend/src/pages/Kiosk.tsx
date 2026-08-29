import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { LogOut, MonitorPlay, Radio, Users, WifiOff } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { EmptyState, Field, Loading, Modal } from '../components/ui';

/** Sign-in for a shared classroom panel — device credentials, not personal. */
export function KioskLoginPage() {
  const { signInKiosk } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signInKiosk(username.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Could not sign in this classroom panel.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="kiosk flex min-h-screen items-center justify-center bg-slate-900 p-6">
      <form onSubmit={onSubmit} className="w-full max-w-xl rounded-xl bg-white p-10">
        <div className="mb-8 flex items-center gap-4">
          <MonitorPlay className="h-10 w-10 text-brand-700" aria-hidden />
          <div>
            <h1 className="text-3xl font-semibold text-ink">Classroom Panel</h1>
            <p className="text-lg text-ink-soft">Sign in this room, not an individual account.</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-lg text-red-800">
            {error}
          </div>
        )}

        <Field label="Classroom ID">
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </Field>
        <Field label="Panel password">
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>

        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Open classroom'}
        </button>
      </form>
    </div>
  );
}

/**
 * The panel view: the day's scheduled broadcasts, a one-touch join, and
 * room-level attendance. No personal login, no course authoring.
 */
export function KioskPage() {
  const { kiosk, signOut } = useAuth();
  const qc = useQueryClient();
  const [attendanceFor, setAttendanceFor] = useState<string | null>(null);
  const [headcount, setHeadcount] = useState('');
  const [joined, setJoined] = useState<any>(null);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['kiosk', 'today', kiosk?.id],
    queryFn: async () =>
      (await api.get<any[]>(`/live-sessions/classroom/${kiosk!.id}/today`)).data,
    enabled: !!kiosk,
    refetchInterval: 60_000,
  });

  const join = useMutation({
    mutationFn: async (sessionId: string) =>
      (await api.get(`/live-sessions/${sessionId}/join`)).data,
    onSuccess: (data) => setJoined(data),
  });

  const markAttendance = useMutation({
    mutationFn: async ({ sessionId, count }: { sessionId: string; count: number }) =>
      (await api.post(`/live-sessions/${sessionId}/room-attendance`, { headcount: count })).data,
    onSuccess: () => {
      setAttendanceFor(null);
      setHeadcount('');
      qc.invalidateQueries({ queryKey: ['kiosk'] });
    },
  });

  if (!kiosk) return null;

  return (
    <div className="kiosk min-h-screen bg-slate-100">
      <header className="flex items-center justify-between bg-brand-800 px-8 py-6 text-white">
        <div>
          <h1 className="text-3xl font-semibold">{kiosk.name}</h1>
          <p className="text-lg text-brand-100">
            {kiosk.siteName} · {kiosk.code}
          </p>
        </div>
        <div className="flex items-center gap-6">
          <p className="text-3xl font-semibold tabular-nums">{format(now, 'HH:mm')}</p>
          <button type="button" onClick={signOut} className="btn-secondary">
            <LogOut className="h-6 w-6" aria-hidden />
            End day
          </button>
        </div>
      </header>

      <main className="p-8">
        {joined ? (
          <section className="rounded-xl bg-black p-8 text-white">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-semibold">{joined.title}</h2>
              <button type="button" className="btn-secondary" onClick={() => setJoined(null)}>
                Leave session
              </button>
            </div>

            {joined.degraded ? (
              <div className="flex flex-col items-center gap-4 rounded-lg bg-amber-100 p-10 text-center text-amber-900">
                <WifiOff className="h-12 w-12" aria-hidden />
                <p className="text-2xl font-medium">{joined.message}</p>
              </div>
            ) : (
              <div className="flex aspect-video items-center justify-center rounded-lg bg-slate-800">
                {joined.url ? (
                  <iframe
                    title={joined.title}
                    src={joined.url}
                    className="h-full w-full rounded-lg"
                    allow="camera; microphone; fullscreen; display-capture"
                  />
                ) : (
                  <p className="text-xl text-slate-300">Waiting for the studio to go live…</p>
                )}
              </div>
            )}

            {joined.moderatedQA && (
              <p className="mt-4 text-lg text-slate-300">
                <Radio className="mr-2 inline h-5 w-5" aria-hidden />
                Questions from this room are moderated by the studio before they are aired.
              </p>
            )}
          </section>
        ) : isLoading ? (
          <Loading label="Loading today's schedule…" />
        ) : !sessions?.length ? (
          <EmptyState
            title="No sessions scheduled for this room today"
            description="Scheduled broadcasts appear here automatically."
          />
        ) : (
          <div className="grid gap-6">
            {sessions.map((session) => (
              <article key={session.id} className="rounded-xl bg-white p-8 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-6">
                  <div>
                    <p className="text-lg text-ink-soft">
                      {format(new Date(session.scheduledStart), 'HH:mm')} –{' '}
                      {format(new Date(session.scheduledEnd), 'HH:mm')}
                    </p>
                    <h2 className="mt-1 text-3xl font-semibold text-ink">{session.title}</h2>
                    <p className="mt-1 text-lg text-ink-soft">
                      {session.course?.title ?? 'General session'} · {session.host?.fullName}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => join.mutate(session.id)}
                      disabled={join.isPending}
                    >
                      <Radio className="h-6 w-6" aria-hidden />
                      Join session
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setAttendanceFor(session.id)}
                    >
                      <Users className="h-6 w-6" aria-hidden />
                      Record attendance
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <Modal
        open={!!attendanceFor}
        title="Room attendance"
        onClose={() => setAttendanceFor(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setAttendanceFor(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!headcount || markAttendance.isPending}
              onClick={() =>
                markAttendance.mutate({ sessionId: attendanceFor!, count: Number(headcount) })
              }
            >
              Save headcount
            </button>
          </>
        }
      >
        <Field
          label="Learners present in this room"
          hint="Recorded against the room, alongside any individual login attendance."
        >
          <input
            className="input"
            type="number"
            min={0}
            value={headcount}
            onChange={(e) => setHeadcount(e.target.value)}
            autoFocus
          />
        </Field>
        {markAttendance.isError && (
          <p className="text-sm text-red-600">{errorMessage(markAttendance.error)}</p>
        )}
      </Modal>
    </div>
  );
}
