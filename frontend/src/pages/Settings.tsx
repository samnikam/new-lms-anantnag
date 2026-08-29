import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Save, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import {
  Badge,
  Card,
  ErrorState,
  Field,
  Loading,
  PageHeader,
  StatCard,
  Table,
} from '../components/ui';

/**
 * Platform administration — Super Admin only. Deliberately separate from the
 * Academic Structure screen: this is branding, policy and maintenance, not
 * courses and cohorts.
 */
export function SettingsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'branding' | 'academic' | 'maintenance' | 'system'>('branding');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => (await api.get<any>('/settings')).data,
  });

  const { data: system } = useQuery({
    queryKey: ['settings', 'system'],
    queryFn: async () => (await api.get<any>('/settings/system')).data,
    enabled: tab === 'system',
  });

  const [branding, setBranding] = useState<any>({});
  const [academic, setAcademic] = useState<any>({});
  const [maintenance, setMaintenance] = useState<any>({});

  useEffect(() => {
    if (!data) return;
    setBranding(data.branding ?? {});
    setAcademic(data.academic ?? {});
    setMaintenance(data.maintenance ?? {});
  }, [data]);

  const save = useMutation({
    mutationFn: async ({ name, value }: { name: string; value: any }) =>
      (await api.put(`/settings/${name}`, value)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const purge = useMutation({
    mutationFn: async () => (await api.post<any>('/settings/purge-sessions', {})).data,
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const tabs = [
    ['branding', 'Branding'],
    ['academic', 'Academic policy'],
    ['maintenance', 'Maintenance'],
    ['system', 'System'],
  ] as const;

  return (
    <>
      <PageHeader
        title="System Settings"
        description="Portal-wide configuration, policy defaults and maintenance controls."
      />

      <div className="mb-6 flex flex-wrap gap-2 border-b border-slate-200">
        {tabs.map(([key, label]) => (
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

      {save.isSuccess && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Settings saved.
        </div>
      )}
      {save.isError && (
        <div className="mb-4">
          <ErrorState message={errorMessage(save.error)} />
        </div>
      )}

      {tab === 'branding' && (
        <Card title="Portal identity">
          <Field label="Portal name">
            <input
              className="input"
              value={branding.portalName ?? ''}
              onChange={(e) => setBranding({ ...branding, portalName: e.target.value })}
            />
          </Field>
          <Field label="Department">
            <input
              className="input"
              value={branding.department ?? ''}
              onChange={(e) => setBranding({ ...branding, department: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Support email">
              <input
                className="input"
                type="email"
                value={branding.supportEmail ?? ''}
                onChange={(e) => setBranding({ ...branding, supportEmail: e.target.value })}
              />
            </Field>
            <Field label="Primary colour">
              <input
                className="input h-10"
                type="color"
                value={branding.primaryColor ?? '#1a3f75'}
                onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
              />
            </Field>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => save.mutate({ name: 'branding', value: branding })}
            disabled={save.isPending}
          >
            <Save className="h-4 w-4" aria-hidden />
            Save branding
          </button>
        </Card>
      )}

      {tab === 'academic' && (
        <Card title="Academic policy defaults">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Attendance alert threshold (%)"
              hint="Guardians are alerted below this figure."
            >
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                value={academic.attendanceAlertThreshold ?? 75}
                onChange={(e) =>
                  setAcademic({ ...academic, attendanceAlertThreshold: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Default pass mark (%)">
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                value={academic.defaultPassMark ?? 40}
                onChange={(e) => setAcademic({ ...academic, defaultPassMark: Number(e.target.value) })}
              />
            </Field>
            <Field label="Session timeout (minutes)">
              <input
                className="input"
                type="number"
                min={5}
                value={academic.sessionTimeoutMinutes ?? 15}
                onChange={(e) =>
                  setAcademic({ ...academic, sessionTimeoutMinutes: Number(e.target.value) })
                }
              />
            </Field>
          </div>

          <label className="mb-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!academic.allowSelfEnrollment}
              onChange={(e) => setAcademic({ ...academic, allowSelfEnrollment: e.target.checked })}
            />
            Allow learners to enrol themselves in published courses
          </label>

          <button
            type="button"
            className="btn-primary"
            onClick={() => save.mutate({ name: 'academic', value: academic })}
            disabled={save.isPending}
          >
            <Save className="h-4 w-4" aria-hidden />
            Save policy
          </button>
        </Card>
      )}

      {tab === 'maintenance' && (
        <Card title="Maintenance mode">
          <label className="mb-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!maintenance.enabled}
              onChange={(e) => setMaintenance({ ...maintenance, enabled: e.target.checked })}
            />
            Show a maintenance notice to all users
          </label>

          <Field label="Notice text">
            <textarea
              className="input"
              rows={3}
              value={maintenance.message ?? ''}
              onChange={(e) => setMaintenance({ ...maintenance, message: e.target.value })}
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => save.mutate({ name: 'maintenance', value: maintenance })}
              disabled={save.isPending}
            >
              <Save className="h-4 w-4" aria-hidden />
              Save
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => purge.mutate()}
              disabled={purge.isPending}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Purge expired sessions
            </button>
          </div>

          {purge.isSuccess && (
            <p className="mt-3 text-sm text-emerald-700">
              Removed {purge.data.refreshTokensRemoved} expired session token(s) and{' '}
              {purge.data.resetTokensRemoved} stale reset code(s).
            </p>
          )}
        </Card>
      )}

      {tab === 'system' && (
        <div className="space-y-6">
          {!system ? (
            <Loading />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard label="Environment" value={system.runtime.environment} />
                <StatCard label="Node version" value={system.runtime.nodeVersion} />
                <StatCard
                  label="API uptime"
                  value={`${Math.floor(system.runtime.uptimeSec / 60)} min`}
                />
              </div>

              <Card title="Stored records">
                <Table headers={['Entity', 'Rows']}>
                  {Object.entries(system.records).map(([entity, count]) => (
                    <tr key={entity}>
                      <td className="td capitalize">{entity.replace(/([A-Z])/g, ' $1').toLowerCase()}</td>
                      <td className="td tabular-nums">{String(count)}</td>
                    </tr>
                  ))}
                </Table>
                <p className="mt-4 text-xs text-slate-500">
                  Last audit entry:{' '}
                  {system.lastAuditAt
                    ? format(new Date(system.lastAuditAt), 'dd MMM yyyy, HH:mm')
                    : 'none recorded'}
                </p>
              </Card>

              <Card title="Backup">
                <p className="text-sm text-ink-soft">
                  Database backups are handled by the hosting platform. Take a manual dump before
                  any schema change:
                </p>
                <pre className="mt-3 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">
                  pg_dump "$DATABASE_URL" &gt; lms-backup-$(date +%F).sql
                </pre>
                <div className="mt-3">
                  <Badge tone="warn">Restore procedure must be tested before go-live</Badge>
                </div>
              </Card>
            </>
          )}
        </div>
      )}
    </>
  );
}
