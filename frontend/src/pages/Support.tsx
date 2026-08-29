import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ArrowUpCircle, CheckCircle2, Plus } from 'lucide-react';
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

const SEVERITY_TONE: Record<string, any> = {
  CRITICAL: 'bad',
  HIGH: 'warn',
  MEDIUM: 'info',
  LOW: 'neutral',
};

export function SupportPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [raising, setRaising] = useState(false);
  const isHandler = ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user!.role);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => (await api.get<any[]>('/support')).data,
  });

  const { data: sla } = useQuery({
    queryKey: ['sla-board'],
    queryFn: async () => (await api.get<any[]>('/support/sla-board')).data,
    enabled: isHandler,
  });

  return (
    <>
      <PageHeader
        title="Help & Support"
        description="Raise a grievance and track it through the site → academic admin → super admin escalation path."
        actions={
          <button type="button" className="btn-primary" onClick={() => setRaising(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Raise a ticket
          </button>
        }
      />

      {isHandler && sla && sla.some((t) => t.breached) && (
        <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {sla.filter((t) => t.breached).length} ticket(s) have breached their response target.
        </div>
      )}

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : !data?.length ? (
        <EmptyState title="No tickets" description="Support requests you raise will appear here." />
      ) : (
        <Card>
          <Table headers={['Ticket', 'Severity', 'Level', 'Site', 'Status', 'Raised']}>
            {data.map((t) => (
              <tr key={t.id}>
                <td className="td">
                  <Link to={`/support/${t.id}`} className="font-medium text-brand-800 hover:underline">
                    {t.subject}
                  </Link>
                  <p className="font-mono text-xs text-slate-500">{t.ticketNo}</p>
                </td>
                <td className="td">
                  <Badge tone={SEVERITY_TONE[t.severity]}>{t.severity.toLowerCase()}</Badge>
                </td>
                <td className="td text-slate-600">{t.level.replace(/_/g, ' ').toLowerCase()}</td>
                <td className="td text-slate-600">{t.site?.name ?? '—'}</td>
                <td className="td">
                  <StatusBadge status={t.status} />
                </td>
                <td className="td whitespace-nowrap text-slate-600">
                  {format(new Date(t.createdAt), 'dd MMM, HH:mm')}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <RaiseModal
        open={raising}
        onClose={() => setRaising(false)}
        onDone={() => {
          setRaising(false);
          qc.invalidateQueries({ queryKey: ['tickets'] });
        }}
      />
    </>
  );
}

function RaiseModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ subject: '', body: '', category: 'Technical', severity: 'MEDIUM' });

  const create = useMutation({
    mutationFn: async () => (await api.post('/support', form)).data,
    onSuccess: onDone,
  });

  return (
    <Modal
      open={open}
      title="Raise a support ticket"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn-primary"
            disabled={form.subject.length < 4 || form.body.length < 10 || create.isPending}
            onClick={() => create.mutate()}
          >
            Submit ticket
          </button>
        </>
      }
    >
      <Field label="Subject">
        <input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
      </Field>
      <Field label="Describe the issue" hint="At least 10 characters.">
        <textarea className="input" rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option>Technical</option>
            <option>Hardware / panel</option>
            <option>Connectivity</option>
            <option>Academic</option>
            <option>Account access</option>
          </select>
        </Field>
        <Field label="Severity" hint="Critical tickets also alert by SMS.">
          <select className="input" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
            <option value="LOW">Low — 72 hours</option>
            <option value="MEDIUM">Medium — 24 hours</option>
            <option value="HIGH">High — 8 hours</option>
            <option value="CRITICAL">Critical — 4 hours</option>
          </select>
        </Field>
      </div>
      {create.isError && <p className="text-sm text-red-600">{errorMessage(create.error)}</p>}
    </Modal>
  );
}

export function TicketDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const isHandler = ['SUPER_ADMIN', 'ACADEMIC_ADMIN'].includes(user!.role);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ticket', id],
    queryFn: async () => (await api.get<any>(`/support/${id}`)).data,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['ticket', id] });
    qc.invalidateQueries({ queryKey: ['tickets'] });
  };

  const act = useMutation({
    mutationFn: async (verb: 'escalate' | 'resolve' | 'comment') =>
      (await api.post(`/support/${id}/${verb}`, { note: note || undefined })).data,
    onSuccess: () => {
      setNote('');
      invalidate();
    },
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title={data.subject}
        description={`${data.ticketNo} · raised by ${data.requester.fullName} on ${format(new Date(data.createdAt), 'dd MMM yyyy, HH:mm')}`}
        actions={
          <>
            <Badge tone={SEVERITY_TONE[data.severity]}>{data.severity.toLowerCase()}</Badge>
            <StatusBadge status={data.status} />
            {isHandler && data.status !== 'RESOLVED' && data.status !== 'CLOSED' && (
              <>
                <button type="button" className="btn-secondary" onClick={() => act.mutate('escalate')}>
                  <ArrowUpCircle className="h-4 w-4" aria-hidden />
                  Escalate
                </button>
                <button type="button" className="btn-primary" onClick={() => act.mutate('resolve')}>
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Resolve
                </button>
              </>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Description">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.body}</p>
          </Card>

          <Card title="History">
            <ol className="space-y-3">
              {data.events.map((event: any) => (
                <li key={event.id} className="border-l-2 border-slate-200 pl-4">
                  <p className="text-sm font-medium text-ink">{event.action.replace(/_/g, ' ').toLowerCase()}</p>
                  {event.note && <p className="text-sm text-ink-soft">{event.note}</p>}
                  <p className="text-xs text-slate-500">{format(new Date(event.at), 'dd MMM yyyy, HH:mm')}</p>
                </li>
              ))}
            </ol>

            <div className="mt-5 border-t border-slate-200 pt-4">
              <Field label="Add a comment">
                <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <button type="button" className="btn-secondary" disabled={!note || act.isPending} onClick={() => act.mutate('comment')}>
                Post comment
              </button>
            </div>
          </Card>
        </div>

        <Card title="Details">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Escalation level</dt>
              <dd className="mt-0.5">{data.level.replace(/_/g, ' ').toLowerCase()}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Assigned to</dt>
              <dd className="mt-0.5">{data.assignee?.fullName ?? 'Unassigned'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Site</dt>
              <dd className="mt-0.5">{data.site?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Response target</dt>
              <dd className="mt-0.5">
                {data.slaDueAt ? format(new Date(data.slaDueAt), 'dd MMM yyyy, HH:mm') : '—'}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
