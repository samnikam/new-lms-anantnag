import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { KeyRound, Save } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { ROLE_LABELS, type Role } from '../lib/auth';
import {
  Badge,
  Card,
  ErrorState,
  Field,
  Loading,
  PageHeader,
  Table,
} from '../components/ui';

/**
 * Own-account screen. Role, site and status are shown but never editable —
 * nobody adjusts their own authority or scope.
 */
export function ProfilePage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ fullName: '', email: '', mobile: '', locale: 'en' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => (await api.get<any>('/profile')).data,
  });

  const { data: sessions } = useQuery({
    queryKey: ['profile', 'sessions'],
    queryFn: async () => (await api.get<any[]>('/profile/sessions')).data,
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      fullName: data.fullName ?? '',
      email: data.email ?? '',
      mobile: data.mobile ?? '',
      locale: data.locale ?? 'en',
    });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = Object.fromEntries(Object.entries(form).filter(([, v]) => v !== ''));
      return (await api.patch('/profile', payload)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profile'] });
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  const changePassword = useMutation({
    mutationFn: async () =>
      (
        await api.post('/auth/change-password', {
          currentPassword: pw.currentPassword,
          newPassword: pw.newPassword,
        })
      ).data,
    onSuccess: () => setPw({ currentPassword: '', newPassword: '', confirm: '' }),
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const passwordMismatch = !!pw.confirm && pw.newPassword !== pw.confirm;

  return (
    <>
      <PageHeader title="My Profile" description="Your account details, password and recent sessions." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Profile details">
            {save.isSuccess && (
              <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
                Profile updated.
              </div>
            )}
            {save.isError && <p className="mb-4 text-sm text-red-600">{errorMessage(save.error)}</p>}

            <Field label="Full name">
              <input
                className="input"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email">
                <input
                  className="input"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field label="Mobile">
                <input
                  className="input"
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Language">
              <select
                className="input"
                value={form.locale}
                onChange={(e) => setForm({ ...form, locale: e.target.value })}
              >
                <option value="en">English</option>
                <option value="hi">हिन्दी (Hindi)</option>
                <option value="ur">اردو (Urdu)</option>
              </select>
            </Field>

            <button
              type="button"
              className="btn-primary"
              onClick={() => save.mutate()}
              disabled={!form.fullName || save.isPending}
            >
              <Save className="h-4 w-4" aria-hidden />
              {save.isPending ? 'Saving…' : 'Save changes'}
            </button>
          </Card>

          <Card title="Change password">
            {changePassword.isSuccess && (
              <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
                Password changed. Other devices have been signed out.
              </div>
            )}
            {changePassword.isError && (
              <p className="mb-4 text-sm text-red-600">{errorMessage(changePassword.error)}</p>
            )}

            <Field label="Current password">
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={pw.currentPassword}
                onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })}
              />
            </Field>
            <Field label="New password" hint="At least 8 characters.">
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={pw.newPassword}
                onChange={(e) => setPw({ ...pw, newPassword: e.target.value })}
              />
            </Field>
            <Field
              label="Confirm new password"
              error={passwordMismatch ? 'The two passwords do not match.' : undefined}
            >
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              />
            </Field>

            <button
              type="button"
              className="btn-primary"
              disabled={
                !pw.currentPassword ||
                pw.newPassword.length < 8 ||
                passwordMismatch ||
                changePassword.isPending
              }
              onClick={() => changePassword.mutate()}
            >
              <KeyRound className="h-4 w-4" aria-hidden />
              Change password
            </button>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Account">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Role</dt>
                <dd className="mt-0.5">
                  <Badge tone="info">{ROLE_LABELS[data.role as Role] ?? data.role}</Badge>
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Assigned site</dt>
                <dd className="mt-0.5">
                  {data.site ? `${data.site.name} (${data.site.code})` : 'Division-wide'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd className="mt-0.5">{data.status.toLowerCase()}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Member since</dt>
                <dd className="mt-0.5">{format(new Date(data.createdAt), 'dd MMM yyyy')}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Last sign-in</dt>
                <dd className="mt-0.5">
                  {data.lastLoginAt ? format(new Date(data.lastLoginAt), 'dd MMM yyyy, HH:mm') : '—'}
                </dd>
              </div>
            </dl>
            <p className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500">
              Your role and assigned site are set by an administrator and cannot be changed here.
            </p>
          </Card>

          <Card title="Recent sessions">
            {sessions?.length ? (
              <Table headers={['When', 'Status']}>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="td">
                      {format(new Date(s.createdAt), 'dd MMM, HH:mm')}
                      {s.ip && <p className="text-xs text-slate-500">{s.ip}</p>}
                    </td>
                    <td className="td">
                      {s.revokedAt ? (
                        <Badge>ended</Badge>
                      ) : new Date(s.expiresAt) < new Date() ? (
                        <Badge tone="warn">expired</Badge>
                      ) : (
                        <Badge tone="good">active</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </Table>
            ) : (
              <p className="text-sm text-slate-500">No sessions recorded.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
