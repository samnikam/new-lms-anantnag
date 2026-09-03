import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { Building2, Plus, Wifi, WifiOff } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { SchoolsManager } from './Schools';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeader,
  ProgressBar,
  StatCard,
  Table,
} from '../components/ui';

export function SitesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'schools' | 'sites' | 'classrooms' | 'devices'>('schools');
  const [addingRoom, setAddingRoom] = useState(false);
  const [addingDevice, setAddingDevice] = useState(false);

  const readOnly = user!.role === 'DEPT_OVERSIGHT';

  const { data: board, isLoading, error, refetch } = useQuery({
    queryKey: ['status-board'],
    queryFn: async () => (await api.get<any[]>('/sites/status-board')).data,
    refetchInterval: 60_000, // device heartbeat refreshes on the minute
  });

  const { data: classrooms } = useQuery({
    queryKey: ['classrooms'],
    queryFn: async () => (await api.get<any[]>('/classrooms')).data,
    enabled: tab === 'classrooms',
  });

  const { data: devices } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => (await api.get<any[]>('/devices')).data,
    enabled: tab === 'devices',
    refetchInterval: 60_000,
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const totals = board!.reduce(
    (acc, s) => ({
      classrooms: acc.classrooms + s.classrooms,
      online: acc.online + s.devicesOnline,
      total: acc.total + s.devicesTotal,
    }),
    { classrooms: 0, online: 0, total: 0 },
  );

  return (
    <>
      <PageHeader
        title="Sites & Devices"
        description="Schools and institutes, their classrooms, and live panel status."
        actions={
          !readOnly && (
            <>
              {tab === 'classrooms' && (
                <button type="button" className="btn-primary" onClick={() => setAddingRoom(true)}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Add classroom
                </button>
              )}
              {tab === 'devices' && (
                <button type="button" className="btn-primary" onClick={() => setAddingDevice(true)}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Register device
                </button>
              )}
            </>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200">
        {([
          ['schools', 'Schools & Institutes'],
          ['sites', 'Status Board'],
          ['classrooms', 'Classrooms'],
          ['devices', 'Devices'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={
              tab === key
                ? 'border-b-2 border-brand-700 px-4 py-2 text-sm font-medium text-brand-800'
                : 'px-4 py-2 text-sm font-medium text-ink-soft hover:text-ink'
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'schools' && <SchoolsManager canManage={!readOnly && user!.role === 'SUPER_ADMIN'} />}

      {tab === 'sites' && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-4">
            <StatCard label="Sites" value={board!.length} />
            <StatCard label="Classrooms" value={totals.classrooms} />
            <StatCard label="Devices" value={totals.total} />
            <StatCard
              label="Online now"
              value={`${totals.online}/${totals.total}`}
              tone={totals.online === totals.total ? 'good' : 'warn'}
            />
          </div>
          <Card>
          <Table headers={['Site', 'District', 'Classrooms', 'Devices online', 'Uptime', 'Last heartbeat']}>
            {board!.map((site) => (
              <tr key={site.siteId}>
                <td className="td">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-400" aria-hidden />
                    <div>
                      <p className="font-medium">{site.siteName}</p>
                      <p className="text-xs text-slate-500">{site.siteCode}</p>
                    </div>
                  </div>
                </td>
                <td className="td text-slate-600">{site.district ?? '—'}</td>
                <td className="td tabular-nums">{site.classrooms}</td>
                <td className="td tabular-nums">
                  {site.devicesOnline}/{site.devicesTotal}
                </td>
                <td className="td w-40">
                  <ProgressBar value={site.uptimePct} />
                </td>
                <td className="td text-xs text-slate-500">
                  {site.lastSeenAt ? `${formatDistanceToNow(new Date(site.lastSeenAt))} ago` : 'Never'}
                </td>
              </tr>
              ))}
            </Table>
          </Card>
        </>
      )}

      {tab === 'classrooms' && (
        <Card>
          {classrooms?.length ? (
            <Table headers={['Classroom', 'Site', 'Type', 'Kiosk ID', 'Devices']}>
              {classrooms.map((room) => (
                <tr key={room.id}>
                  <td className="td">
                    <p className="font-medium">{room.name}</p>
                    <p className="text-xs text-slate-500">{room.code}</p>
                  </td>
                  <td className="td text-slate-600">{room.site.name}</td>
                  <td className="td">
                    {room.isStudio ? <Badge tone="info">broadcast studio</Badge> : <Badge>classroom</Badge>}
                  </td>
                  <td className="td font-mono text-xs text-slate-600">{room.kioskUsername ?? '—'}</td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1">
                      {room.devices.map((d: any) => (
                        <span
                          key={d.id}
                          title={`${d.type} · ${d.serialNo}`}
                          className={
                            d.status === 'ONLINE'
                              ? 'inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-800'
                              : 'inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[11px] text-red-800'
                          }
                        >
                          {d.status === 'ONLINE' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                          {d.serialNo}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Loading />
          )}
        </Card>
      )}

      {tab === 'devices' && (
        <Card>
          {devices?.length ? (
            <Table headers={['Serial', 'Type', 'Classroom', 'Site', 'Status', 'Last seen']}>
              {devices.map((d) => (
                <tr key={d.id}>
                  <td className="td font-mono text-xs">{d.serialNo}</td>
                  <td className="td text-slate-600">{d.type.replace(/_/g, ' ').toLowerCase()}</td>
                  <td className="td text-slate-600">{d.classroom.name}</td>
                  <td className="td text-slate-600">{d.classroom.site.name}</td>
                  <td className="td">
                    {d.status === 'ONLINE' ? <Badge tone="good">online</Badge> : <Badge tone="bad">offline</Badge>}
                  </td>
                  <td className="td text-xs text-slate-500">
                    {d.lastSeenAt ? `${formatDistanceToNow(new Date(d.lastSeenAt))} ago` : 'Never'}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Loading />
          )}
        </Card>
      )}

      <AddDeviceModal
        open={addingDevice}
        onClose={() => setAddingDevice(false)}
        onDone={() => {
          setAddingDevice(false);
          qc.invalidateQueries({ queryKey: ['devices'] });
          qc.invalidateQueries({ queryKey: ['status-board'] });
          qc.invalidateQueries({ queryKey: ['classrooms'] });
        }}
      />

      <AddClassroomModal
        open={addingRoom}
        onClose={() => setAddingRoom(false)}
        onDone={() => {
          setAddingRoom(false);
          qc.invalidateQueries({ queryKey: ['classrooms'] });
          qc.invalidateQueries({ queryKey: ['status-board'] });
        }}
      />
    </>
  );
}

function AddClassroomModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    siteId: '',
    name: '',
    code: '',
    capacity: 40,
    isStudio: false,
    kioskUsername: '',
    kioskPassword: '',
  });

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => (await api.get<any[]>('/sites')).data,
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/classrooms', {
          ...form,
          capacity: Number(form.capacity),
          kioskUsername: form.kioskUsername || undefined,
          kioskPassword: form.kioskPassword || undefined,
        })
      ).data,
    onSuccess: onDone,
  });

  return (
    <Modal
      open={open}
      title="Add classroom"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.siteId || !form.name || !form.code || create.isPending}
            onClick={() => create.mutate()}
          >
            Add classroom
          </button>
        </>
      }
    >
      <Field label="Site">
        <select className="input" value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
          <option value="">Select a site…</option>
          {sites?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.code})
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Room name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Room code">
          <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </Field>
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isStudio}
          onChange={(e) => setForm({ ...form, isStudio: e.target.checked })}
        />
        This room is a broadcast studio
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kiosk ID" hint="Used by the panel to sign itself in.">
          <input
            className="input"
            value={form.kioskUsername}
            onChange={(e) => setForm({ ...form, kioskUsername: e.target.value })}
          />
        </Field>
        <Field label="Kiosk password">
          <input
            className="input"
            type="password"
            value={form.kioskPassword}
            onChange={(e) => setForm({ ...form, kioskPassword: e.target.value })}
          />
        </Field>
      </div>

      {create.isError && <p className="text-sm text-red-600">{errorMessage(create.error)}</p>}
    </Modal>
  );
}

const DEVICE_TYPES = [
  ['INTERACTIVE_PANEL', 'Interactive panel'],
  ['OPS_PC', 'OPS PC'],
  ['PTZ_CAMERA', 'PTZ camera'],
  ['WEBCAM', 'Webcam'],
  ['UPS', 'UPS'],
  ['ROUTER', 'Router'],
] as const;

/**
 * Registers a panel or OPS PC against a classroom. Until a device is
 * registered its agent cannot report a heartbeat, so it never appears on the
 * status board — the serial number here is what the classroom agent sends.
 */
function AddDeviceModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState({
    classroomId: '',
    type: 'INTERACTIVE_PANEL' as string,
    serialNo: '',
    model: '',
    ipAddress: '',
    notes: '',
  });

  const { data: classrooms } = useQuery({
    queryKey: ['classrooms'],
    queryFn: async () => (await api.get<any[]>('/classrooms')).data,
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/devices', {
          classroomId: form.classroomId,
          type: form.type,
          serialNo: form.serialNo.trim(),
          model: form.model || undefined,
          ipAddress: form.ipAddress || undefined,
          notes: form.notes || undefined,
        })
      ).data,
    onSuccess: () => {
      setForm({ ...form, serialNo: '', model: '', ipAddress: '', notes: '' });
      onDone();
    },
  });

  return (
    <Modal
      open={open}
      title="Register a device"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.classroomId || !form.serialNo.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Registering…' : 'Register device'}
          </button>
        </>
      }
    >
      <Field label="Classroom">
        <select
          className="input"
          value={form.classroomId}
          onChange={(e) => setForm({ ...form, classroomId: e.target.value })}
        >
          <option value="">Select a classroom…</option>
          {classrooms?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.site.name} — {c.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Device type">
          <select
            className="input"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {DEVICE_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Serial number" hint="Must match what the classroom agent reports.">
          <input
            className="input"
            placeholder="IP-043"
            value={form.serialNo}
            onChange={(e) => setForm({ ...form, serialNo: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Model">
          <input
            className="input"
            placeholder='75" 4K Interactive Panel'
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
        </Field>
        <Field label="IP address">
          <input
            className="input"
            value={form.ipAddress}
            onChange={(e) => setForm({ ...form, ipAddress: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Notes">
        <input
          className="input"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </Field>

      <p className="text-xs text-slate-500">
        A new device shows as offline until its agent sends a heartbeat.
      </p>

      {create.isError && <p className="mt-3 text-sm text-red-600">{errorMessage(create.error)}</p>}
    </Modal>
  );
}
