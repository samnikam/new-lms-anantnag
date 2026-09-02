import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, ExternalLink, FileText, Plus, Upload } from 'lucide-react';
import { API_BASE, api, errorMessage } from '../lib/api';
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
  StatCard,
  Table,
} from '../components/ui';

const RESOURCE_TYPES = [
  'VIDEO',
  'PDF',
  'DOCUMENT',
  'PRESENTATION',
  'IMAGE',
  'TEXT',
  'EXTERNAL_LINK',
] as const;

/**
 * Shared content library. Anything added here is flagged `inLibrary`, so it is
 * reusable across courses — a resource an admin or content manager adds is
 * immediately available to every teacher building a course.
 */
export function LibraryPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const canAdd = ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'CONTENT_MANAGER'].includes(user!.role);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['library', search],
    queryFn: async () =>
      (await api.get<any[]>('/courses/library', { params: { search: search || undefined, limit: 100 } }))
        .data,
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const downloadable = data!.filter((r) => r.isDownloadable).length;
  const byType = data!.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="Content Library"
        description="Reusable teaching material shared across every course."
        actions={
          canAdd && (
            <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              Add resource
            </button>
          )
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Resources" value={data!.length} />
        <StatCard
          label="Offline-ready"
          value={downloadable}
          hint="Downloadable for low-bandwidth sites"
        />
        <StatCard label="Types" value={Object.keys(byType).length} />
      </div>

      <Card className="mb-6">
        <input
          className="input max-w-sm"
          placeholder="Search the library…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search library"
        />
      </Card>

      {!data!.length ? (
        <EmptyState
          title="The library is empty"
          description="Add a resource to make it reusable across courses."
          action={
            canAdd && (
              <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
                Add resource
              </button>
            )
          }
        />
      ) : (
        <Card>
          <Table headers={['Resource', 'Type', 'Offline', 'Added', '']}>
            {data!.map((r) => (
              <tr key={r.id}>
                <td className="td">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <span className="font-medium">{r.title}</span>
                  </div>
                </td>
                <td className="td">
                  <Badge tone="info">{r.type.replace(/_/g, ' ').toLowerCase()}</Badge>
                </td>
                <td className="td">
                  {r.isDownloadable ? (
                    <Badge tone="good">available</Badge>
                  ) : (
                    <span className="text-xs text-slate-400">stream only</span>
                  )}
                </td>
                <td className="td text-slate-600">
                  {format(new Date(r.createdAt), 'dd MMM yyyy')}
                </td>
                <td className="td text-right">
                  <a
                    href={r.url?.startsWith('/api/uploads/') ? `${API_BASE}${r.url.slice(4)}` : r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline"
                  >
                    {r.isDownloadable ? (
                      <Download className="h-4 w-4" aria-hidden />
                    ) : (
                      <ExternalLink className="h-4 w-4" aria-hidden />
                    )}
                    Open
                  </a>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <AddResourceModal
        open={adding}
        onClose={() => setAdding(false)}
        onDone={() => {
          setAdding(false);
          qc.invalidateQueries({ queryKey: ['library'] });
        }}
      />
    </>
  );
}

function AddResourceModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<string>('PDF');
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDownloadable, setIsDownloadable] = useState(true);

  const save = useMutation({
    mutationFn: async () => {
      let finalUrl = url;
      let fileKey: string | undefined;
      let mimeType: string | undefined;
      let sizeBytes: number | undefined;

      if (file) {
        const body = new FormData();
        body.append('file', file);
        const upload = (await api.post<any>('/uploads', body)).data;
        finalUrl = upload.url;
        fileKey = upload.fileKey;
        mimeType = upload.mimeType;
        sizeBytes = upload.sizeBytes;
      }

      // No lessonId: the resource lives in the library until a course uses it.
      return (
        await api.post('/resources', {
          title,
          type,
          url: finalUrl,
          fileKey,
          mimeType,
          sizeBytes,
          isDownloadable,
          inLibrary: true,
        })
      ).data;
    },
    onSuccess: () => {
      setTitle('');
      setUrl('');
      setFile(null);
      onDone();
    },
  });

  return (
    <Modal
      open={open}
      title="Add a library resource"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!title || (!url && !file) || save.isPending}
            onClick={() => save.mutate()}
          >
            <Upload className="h-4 w-4" aria-hidden />
            {save.isPending ? 'Saving…' : 'Add to library'}
          </button>
        </>
      }
    >
      <Field label="Title">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <Field label="Type">
        <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {RESOURCE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, ' ').toLowerCase()}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Upload a file" hint="PDF, document, image, presentation or video, up to 200 MB.">
        <input type="file" className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </Field>

      <Field label="…or link to an external resource">
        <input
          className="input"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={!!file}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isDownloadable}
          onChange={(e) => setIsDownloadable(e.target.checked)}
        />
        Allow download for offline use at low-bandwidth sites
      </label>

      {save.isError && <p className="mt-3 text-sm text-red-600">{errorMessage(save.error)}</p>}
    </Modal>
  );
}
