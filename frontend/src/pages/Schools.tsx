import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Modal,
  ProgressBar,
  StatCard,
  Table,
} from '../components/ui';

type InstitutionType = 'SCHOOL' | 'INSTITUTE' | 'CENTRE';

const TYPE_LABELS: Record<InstitutionType, string> = {
  SCHOOL: 'School',
  INSTITUTE: 'Institute',
  CENTRE: 'Centre',
};

const EMPTY = {
  code: '',
  name: '',
  type: 'SCHOOL' as InstitutionType,
  district: '',
  consigneeAddr: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  internetLink: '',
};

/** The registry of schools, institutes and centres, shown as a tab on Sites & Devices. */
export function SchoolsManager({ canManage }: { canManage: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['schools', search, typeFilter],
    queryFn: async () =>
      (
        await api.get<any[]>('/sites', {
          params: { search: search || undefined, type: typeFilter || undefined },
        })
      ).data,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['schools'] });
    qc.invalidateQueries({ queryKey: ['sites'] });
    qc.invalidateQueries({ queryKey: ['status-board'] });
  };

  const toggleActive = useMutation({
    mutationFn: async (site: any) =>
      (await api.patch(`/sites/${site.id}`, { active: !site.active })).data,
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/sites/${id}`)).data,
    onSuccess: () => {
      setConfirmDelete(null);
      invalidate();
    },
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const active = data!.filter((s) => s.active).length;
  const classrooms = data!.reduce((sum, s) => sum + s._count.classrooms, 0);
  const learners = data!.reduce((sum, s) => sum + s._count.users, 0);

  return (
    <>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Add school
          </button>
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <StatCard label="Registered" value={data!.length} />
        <StatCard label="Active" value={active} tone={active === data!.length ? 'good' : 'warn'} />
        <StatCard label="Classrooms" value={classrooms} />
        <StatCard label="Users attached" value={learners} />
      </div>

      <Card className="mb-6">
        <div className="flex flex-wrap gap-3">
          <input
            className="input max-w-xs"
            placeholder="Search by name, code or district…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search schools"
          />
          <select
            className="input max-w-[12rem]"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="Filter by type"
          >
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {remove.isError && (
        <div className="mb-4">
          <ErrorState message={errorMessage(remove.error)} />
        </div>
      )}

      {!data!.length ? (
        <EmptyState
          title="No schools registered"
          description="Add the first school to start attaching classrooms and users."
          action={
            canManage && (
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                Add school
              </button>
            )
          }
        />
      ) : (
        <Card>
          <Table
            headers={['School', 'Type', 'District', 'Contact', 'Classrooms', 'Users', 'Status', '']}
          >
            {data!.map((s) => (
              <tr key={s.id} className={s.active ? '' : 'opacity-60'}>
                <td className="td">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left"
                    onClick={() => setDetailId(s.id)}
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <span>
                      <span className="font-medium text-brand-800 hover:underline">{s.name}</span>
                      <span className="block text-xs text-slate-500">{s.code}</span>
                    </span>
                  </button>
                </td>
                <td className="td">
                  <Badge tone={s.type === 'SCHOOL' ? 'info' : 'neutral'}>
                    {TYPE_LABELS[s.type as InstitutionType] ?? s.type}
                  </Badge>
                </td>
                <td className="td text-slate-600">{s.district ?? '—'}</td>
                <td className="td text-slate-600">
                  {s.contactName ?? '—'}
                  {s.contactPhone && <span className="block text-xs">{s.contactPhone}</span>}
                </td>
                <td className="td tabular-nums">{s._count.classrooms}</td>
                <td className="td tabular-nums">{s._count.users}</td>
                <td className="td">
                  {s.active ? <Badge tone="good">active</Badge> : <Badge tone="bad">inactive</Badge>}
                </td>
                <td className="td">
                  {canManage ? (
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="rounded p-1.5 text-brand-700 hover:bg-brand-50"
                        aria-label={`Edit ${s.name}`}
                        onClick={() => setEditing(s)}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded px-2 py-1.5 text-xs text-ink-soft hover:bg-slate-100"
                        onClick={() => toggleActive.mutate(s)}
                      >
                        {s.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        className="rounded p-1.5 text-red-600 hover:bg-red-50"
                        aria-label={`Delete ${s.name}`}
                        onClick={() => setConfirmDelete(s)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">view only</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <SchoolFormModal
        open={creating || !!editing}
        site={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onDone={() => {
          setCreating(false);
          setEditing(null);
          invalidate();
        }}
      />

      <SchoolDetailModal id={detailId} onClose={() => setDetailId(null)} />

      <Modal
        open={!!confirmDelete}
        title={`Delete ${confirmDelete?.name ?? ''}?`}
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={remove.isPending}
              onClick={() => remove.mutate(confirmDelete.id)}
            >
              Delete permanently
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          This cannot be undone. A school with classrooms, users or batches still attached is
          refused — deactivate it instead to keep its records intact.
        </p>
      </Modal>
    </>
  );
}

function SchoolFormModal({
  open,
  site,
  onClose,
  onDone,
}: {
  open: boolean;
  site: any | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState(EMPTY);
  const isEdit = !!site;

  useEffect(() => {
    if (!open) return;
    setForm(
      site
        ? {
            code: site.code ?? '',
            name: site.name ?? '',
            type: site.type ?? 'SCHOOL',
            district: site.district ?? '',
            consigneeAddr: site.consigneeAddr ?? '',
            contactName: site.contactName ?? '',
            contactPhone: site.contactPhone ?? '',
            contactEmail: site.contactEmail ?? '',
            internetLink: site.internetLink ?? '',
          }
        : EMPTY,
    );
  }, [open, site]);

  const save = useMutation({
    mutationFn: async () => {
      // Blank optional fields are dropped rather than sent as empty strings,
      // which the email validator would reject.
      const payload = Object.fromEntries(
        Object.entries(form).filter(([, v]) => v !== '' && v !== undefined),
      );
      return isEdit
        ? (await api.patch(`/sites/${site.id}`, payload)).data
        : (await api.post('/sites', payload)).data;
    },
    onSuccess: onDone,
  });

  return (
    <Modal
      open={open}
      title={isEdit ? `Edit ${site?.name}` : 'Add a school or institute'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!form.code || !form.name || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add school'}
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" hint="Short unique identifier, e.g. SITE-22.">
          <input
            className="input"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </Field>
        <Field label="Type">
          <select
            className="input"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as InstitutionType })}
          >
            {Object.entries(TYPE_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Name">
        <input
          className="input"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="District">
          <input
            className="input"
            value={form.district}
            onChange={(e) => setForm({ ...form, district: e.target.value })}
          />
        </Field>
        <Field label="Internet connection" hint="ISP reference for this site.">
          <input
            className="input"
            value={form.internetLink}
            onChange={(e) => setForm({ ...form, internetLink: e.target.value })}
          />
        </Field>
      </div>

      <Field label="Address">
        <textarea
          className="input"
          rows={2}
          value={form.consigneeAddr}
          onChange={(e) => setForm({ ...form, consigneeAddr: e.target.value })}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Contact name">
          <input
            className="input"
            value={form.contactName}
            onChange={(e) => setForm({ ...form, contactName: e.target.value })}
          />
        </Field>
        <Field label="Contact phone">
          <input
            className="input"
            value={form.contactPhone}
            onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
          />
        </Field>
        <Field label="Contact email">
          <input
            className="input"
            type="email"
            value={form.contactEmail}
            onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
          />
        </Field>
      </div>

      {save.isError && <p className="text-sm text-red-600">{errorMessage(save.error)}</p>}
    </Modal>
  );
}

function SchoolDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: site } = useQuery({
    queryKey: ['school', id],
    queryFn: async () => (await api.get<any>(`/sites/${id}`)).data,
    enabled: !!id,
  });

  const { data: stats } = useQuery({
    queryKey: ['school', id, 'stats'],
    queryFn: async () => (await api.get<any>(`/sites/${id}/stats`)).data,
    enabled: !!id,
  });

  return (
    <Modal
      open={!!id}
      title={site?.name ?? 'School'}
      onClose={onClose}
      footer={
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      }
    >
      {!site || !stats ? (
        <Loading />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Classrooms" value={stats.classrooms} hint={`${stats.studios} studio(s)`} />
            <StatCard label="Users" value={stats.totalUsers} />
            <StatCard
              label="Devices online"
              value={`${stats.devicesOnline}/${stats.devicesTotal}`}
              tone={stats.uptimePct >= 90 ? 'good' : stats.uptimePct >= 50 ? 'warn' : 'bad'}
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Device uptime
            </p>
            <ProgressBar value={stats.uptimePct} />
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Code" value={site.code} />
            <Detail label="Type" value={TYPE_LABELS[site.type as InstitutionType] ?? site.type} />
            <Detail label="District" value={site.district ?? '—'} />
            <Detail label="Internet" value={site.internetLink ?? '—'} />
            <Detail label="Contact" value={site.contactName ?? '—'} />
            <Detail label="Phone" value={site.contactPhone ?? '—'} />
            <Detail label="Email" value={site.contactEmail ?? '—'} />
            <Detail label="Batches" value={String(stats.batches)} />
          </dl>

          {site.consigneeAddr && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Address</p>
              <p className="mt-1 text-sm">{site.consigneeAddr}</p>
            </div>
          )}

          {site.classrooms?.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                Classrooms
              </p>
              <Table headers={['Room', 'Code', 'Type', 'Devices']}>
                {site.classrooms.map((c: any) => (
                  <tr key={c.id}>
                    <td className="td">{c.name}</td>
                    <td className="td text-slate-600">{c.code}</td>
                    <td className="td">
                      {c.isStudio ? <Badge tone="info">studio</Badge> : <Badge>classroom</Badge>}
                    </td>
                    <td className="td tabular-nums">{c.devices?.length ?? 0}</td>
                  </tr>
                ))}
              </Table>
            </div>
          )}
        </div>
      )}
    </Modal>
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
