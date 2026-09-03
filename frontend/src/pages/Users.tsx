import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Link2, Plus } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { ROLE_LABELS, type Role } from '../lib/auth';
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

const ROLES: Role[] = [
  'SUPER_ADMIN',
  'ACADEMIC_ADMIN',
  'TEACHER',
  'STUDENT',
  'PARENT',
  'CONTENT_MANAGER',
  'DEPT_OVERSIGHT',
];

export function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [creating, setCreating] = useState(false);
  const [linking, setLinking] = useState(false);
  const [resetting, setResetting] = useState<any | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', search, role],
    queryFn: async () =>
      (await api.get<any>('/users', { params: { search: search || undefined, role: role || undefined, limit: 50 } })).data,
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) =>
      (await api.patch(`/users/${id}/status`, { status })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <>
      <PageHeader
        title="Users & Roles"
        description="Accounts, role assignment and parent-to-learner linking."
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => setLinking(true)}>
              <Link2 className="h-4 w-4" aria-hidden />
              Link parent
            </button>
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              New user
            </button>
          </>
        }
      />

      <Card className="mb-6">
        <div className="flex flex-wrap gap-3">
          <input
            className="input max-w-xs"
            placeholder="Search by name, email or mobile…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search users"
          />
          <select className="input max-w-[14rem]" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Filter by role">
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : !data?.items?.length ? (
        <EmptyState title="No users found" />
      ) : (
        <Card>
          <Table headers={['Name', 'Contact', 'Role', 'Site', 'Status', '']}>
            {data.items.map((u: any) => (
              <tr key={u.id}>
                <td className="td font-medium">{u.fullName}</td>
                <td className="td text-slate-600">
                  <p>{u.email ?? '—'}</p>
                  {u.mobile && <p className="text-xs text-slate-500">{u.mobile}</p>}
                </td>
                <td className="td text-slate-600">{ROLE_LABELS[u.role as Role]}</td>
                <td className="td text-slate-600">{u.site?.name ?? '—'}</td>
                <td className="td">
                  <StatusBadge status={u.status} />
                </td>
                <td className="td">
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"
                      onClick={() => setResetting(u)}
                    >
                      <KeyRound className="h-3.5 w-3.5" aria-hidden />
                      Reset password
                    </button>
                    <button
                      type="button"
                      className="text-sm text-brand-700 hover:underline"
                      onClick={() =>
                        setStatus.mutate({
                          id: u.id,
                          status: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                        })
                      }
                    >
                      {u.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <CreateUserModal
        open={creating}
        onClose={() => setCreating(false)}
        onDone={() => {
          setCreating(false);
          qc.invalidateQueries({ queryKey: ['users'] });
        }}
      />
      <LinkParentModal open={linking} onClose={() => setLinking(false)} />
      <ResetPasswordModal user={resetting} onClose={() => setResetting(null)} />
    </>
  );
}

function CreateUserModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    mobile: '',
    role: 'STUDENT' as Role,
    siteId: '',
    password: '',
  });

  // The server decides which roles this admin may assign; the form mirrors it
  // so an Academic Admin is never shown an option that would be rejected.
  const { data: allowedRoles } = useQuery({
    queryKey: ['assignable-roles'],
    queryFn: async () => (await api.get<Role[]>('/users/assignable-roles')).data,
    enabled: open,
  });

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => (await api.get<any[]>('/sites')).data,
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/users', {
          ...form,
          email: form.email || undefined,
          mobile: form.mobile || undefined,
          siteId: form.siteId || undefined,
        })
      ).data,
    onSuccess: onDone,
  });

  return (
    <Modal
      open={open}
      title="New user"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.fullName || form.password.length < 8 || create.isPending}
            onClick={() => create.mutate()}
          >
            Create user
          </button>
        </>
      }
    >
      <Field label="Full name">
        <input className="input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email">
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Mobile">
          <input className="input" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role">
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            {(allowedRoles ?? ['STUDENT']).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Site">
          <select className="input" value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
            <option value="">No site</option>
            {sites?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Temporary password" hint="At least 8 characters. The user should change it after first sign-in.">
        <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </Field>

      {create.isError && <p className="text-sm text-red-600">{errorMessage(create.error)}</p>}
    </Modal>
  );
}

/** Links a guardian to a learner, then approves it — the §6.1 flow. */
function LinkParentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [parentId, setParentId] = useState('');
  const [studentId, setStudentId] = useState('');

  const { data: parents } = useQuery({
    queryKey: ['users', 'parents'],
    queryFn: async () => (await api.get<any>('/users', { params: { role: 'PARENT', limit: 200 } })).data,
    enabled: open,
  });

  const { data: students } = useQuery({
    queryKey: ['users', 'students'],
    queryFn: async () => (await api.get<any>('/users', { params: { role: 'STUDENT', limit: 200 } })).data,
    enabled: open,
  });

  const { data: links } = useQuery({
    queryKey: ['links'],
    queryFn: async () => (await api.get<any[]>('/users/links')).data,
    enabled: open,
  });

  const link = useMutation({
    mutationFn: async () => {
      const created = (await api.post<any>('/users/links', { parentId, studentId })).data;
      return (await api.patch(`/users/links/${created.id}`, { status: 'APPROVED' })).data;
    },
    onSuccess: () => {
      setParentId('');
      setStudentId('');
      qc.invalidateQueries({ queryKey: ['links'] });
    },
  });

  return (
    <Modal
      open={open}
      title="Parent-to-learner links"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!parentId || !studentId || link.isPending}
            onClick={() => link.mutate()}
          >
            Link and approve
          </button>
        </>
      }
    >
      <p className="mb-4 text-sm text-ink-soft">
        A guardian can only ever see the learners linked here, and cannot modify academic records.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Parent / guardian">
          <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Select…</option>
            {parents?.items?.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Learner">
          <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Select…</option>
            {students?.items?.map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.fullName}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {link.isError && <p className="mb-3 text-sm text-red-600">{errorMessage(link.error)}</p>}

      <h3 className="mb-2 mt-6 text-sm font-semibold text-ink">Existing links</h3>
      {links?.length ? (
        <Table headers={['Parent', 'Learner', 'Relation', 'Status']}>
          {links.map((l: any) => (
            <tr key={l.id}>
              <td className="td">{l.parent.fullName}</td>
              <td className="td">{l.student.fullName}</td>
              <td className="td text-slate-600">{l.relation}</td>
              <td className="td">
                <StatusBadge status={l.status} />
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <p className="text-sm text-slate-500">No links yet.</p>
      )}
    </Modal>
  );
}

/**
 * Resets a password on a user's behalf. The realistic recovery route in a
 * school: someone tells the office they are locked out, and the office fixes
 * it — the self-service code depends on email or SMS actually reaching them.
 */
function ResetPasswordModal({ user, onClose }: { user: any | null; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  useEffect(() => {
    if (user) {
      setPassword('');
      setConfirm('');
    }
  }, [user]);

  const reset = useMutation({
    mutationFn: async () =>
      (await api.post(`/users/${user.id}/reset-password`, { newPassword: password })).data,
  });

  const mismatch = !!confirm && password !== confirm;

  return (
    <Modal
      open={!!user}
      title={`Reset password — ${user?.fullName ?? ''}`}
      onClose={() => {
        reset.reset();
        onClose();
      }}
      footer={
        <>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              reset.reset();
              onClose();
            }}
          >
            {reset.isSuccess ? 'Done' : 'Cancel'}
          </button>
          {!reset.isSuccess && (
            <button
              type="button"
              className="btn-primary"
              disabled={password.length < 8 || mismatch || reset.isPending}
              onClick={() => reset.mutate()}
            >
              {reset.isPending ? 'Resetting…' : 'Reset password'}
            </button>
          )}
        </>
      }
    >
      {reset.isSuccess ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-medium">Password reset.</p>
          <p className="mt-1">
            Give {user?.fullName} the new password and ask them to change it after signing in. All
            their other sessions have been ended.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-ink-soft">
            This signs {user?.fullName} out everywhere and replaces their password with the one you
            set here.
          </p>

          <Field label="New password" hint="At least 8 characters.">
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </Field>

          <Field
            label="Confirm new password"
            error={mismatch ? 'The two passwords do not match.' : undefined}
          >
            <input
              className="input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>

          {reset.isError && <p className="text-sm text-red-600">{errorMessage(reset.error)}</p>}
        </>
      )}
    </Modal>
  );
}
