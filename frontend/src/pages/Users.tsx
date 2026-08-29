import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus } from 'lucide-react';
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
                <td className="td text-right">
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
            {ROLES.map((r) => (
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
