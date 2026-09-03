import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, isSameDay, isToday } from 'date-fns';
import { CalendarPlus, Pencil, Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';
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
} from '../components/ui';

const EVENT_TYPES = ['CLASS', 'EXAM', 'DEADLINE', 'HOLIDAY', 'EVENT'] as const;

const TYPE_TONE: Record<string, 'info' | 'bad' | 'warn' | 'good' | 'neutral'> = {
  CLASS: 'info',
  EXAM: 'bad',
  DEADLINE: 'warn',
  HOLIDAY: 'good',
  EVENT: 'neutral',
};

/** What each role is told the screen is for. */
const ROLE_BLURB: Record<string, string> = {
  SUPER_ADMIN: 'Every timetable across all sites. You can create, edit and remove entries.',
  ACADEMIC_ADMIN: 'The official timetable for your school. You can create, edit and remove entries.',
  TEACHER: 'Your own teaching timetable — the classes and courses assigned to you.',
  STUDENT: 'Your class timetable, exams and deadlines.',
  PARENT: "Your child's timetable, exams and deadlines.",
  CONTENT_MANAGER: 'Scheduled academic events.',
  DEPT_OVERSIGHT: 'Scheduled academic events.',
};

const EMPTY = {
  title: '',
  type: 'CLASS' as string,
  date: '',
  startTime: '09:00',
  endTime: '10:00',
  courseId: '',
  // One value drives both: 'class:<id>' or 'batch:<id>'.
  audience: '',
  siteId: '',
};

export function TimetablePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [typeFilter, setTypeFilter] = useState('');
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);

  const { data: perms } = useQuery({
    queryKey: ['calendar', 'permissions'],
    queryFn: async () => (await api.get<any>('/calendar/permissions')).data,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['calendar', typeFilter],
    queryFn: async () =>
      (await api.get<any[]>('/calendar', { params: { type: typeFilter || undefined } })).data,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/calendar/${id}`)).data,
    onSuccess: () => {
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const canManage = !!perms?.canCreate;

  // Group into days so it reads as an agenda rather than a flat list.
  const days = (data ?? []).reduce<Array<{ date: Date; events: any[] }>>((acc, event) => {
    const date = new Date(event.startAt);
    const day = acc.find((d) => isSameDay(d.date, date));
    if (day) day.events.push(event);
    else acc.push({ date, events: [event] });
    return acc;
  }, []);

  return (
    <>
      <PageHeader
        title="Timetable"
        description={ROLE_BLURB[user!.role] ?? 'Classes, exams and deadlines.'}
        actions={
          canManage && (
            <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
              <CalendarPlus className="h-4 w-4" aria-hidden />
              Add entry
            </button>
          )
        }
      />

      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTypeFilter('')}
            className={typeFilter === '' ? 'btn-primary' : 'btn-secondary'}
          >
            All
          </button>
          {EVENT_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTypeFilter(t)}
              className={typeFilter === t ? 'btn-primary' : 'btn-secondary'}
            >
              {t.toLowerCase()}
            </button>
          ))}
        </div>
      </Card>

      {remove.isError && (
        <div className="mb-4">
          <ErrorState message={errorMessage(remove.error)} />
        </div>
      )}

      {!days.length ? (
        <EmptyState
          title="Nothing scheduled"
          description={
            canManage
              ? 'Add the first timetable entry — classes, exams, deadlines or holidays.'
              : 'Scheduled classes and deadlines appear here.'
          }
          action={
            canManage && (
              <button type="button" className="btn-primary" onClick={() => setCreating(true)}>
                Add entry
              </button>
            )
          }
        />
      ) : (
        <div className="space-y-4">
          {days.map((day) => (
            <Card
              key={day.date.toISOString()}
              title={`${format(day.date, 'EEEE, dd MMMM yyyy')}${isToday(day.date) ? ' · Today' : ''}`}
            >
              <ul className="divide-y divide-slate-100">
                {day.events.map((event) => (
                  <li key={event.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-ink">{event.title}</p>
                        <Badge tone={TYPE_TONE[event.type] ?? 'neutral'}>
                          {event.type.toLowerCase()}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {[event.course?.title, event.batch?.name ?? event.schoolClass?.name, event.site?.name]
                          .filter(Boolean)
                          .join(' · ') || 'Everyone'}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm tabular-nums text-slate-600">
                        {format(new Date(event.startAt), 'HH:mm')} –{' '}
                        {format(new Date(event.endAt), 'HH:mm')}
                      </span>
                      {canManage && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded p-1.5 text-brand-700 hover:bg-brand-50"
                            aria-label={`Edit ${event.title}`}
                            onClick={() => setEditing(event)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-1.5 text-red-600 hover:bg-red-50"
                            aria-label={`Delete ${event.title}`}
                            onClick={() => setConfirmDelete(event)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <EntryModal
        open={creating || !!editing}
        event={editing}
        scopedSiteId={perms?.scopedToSiteId ?? null}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onDone={() => {
          setCreating(false);
          setEditing(null);
          qc.invalidateQueries({ queryKey: ['calendar'] });
        }}
      />

      <Modal
        open={!!confirmDelete}
        title={`Remove "${confirmDelete?.title ?? ''}"?`}
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
              Remove entry
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">
          This removes the entry from every timetable that shows it. Entries created by a live
          session are removed by cancelling that session instead.
        </p>
      </Modal>
    </>
  );
}

function EntryModal({
  open,
  event,
  scopedSiteId,
  onClose,
  onDone,
}: {
  open: boolean;
  event: any | null;
  scopedSiteId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY);
  const [conflict, setConflict] = useState<string | null>(null);
  const isEdit = !!event;

  const { data: courses } = useQuery({
    queryKey: ['courses', 'picker'],
    queryFn: async () => (await api.get<any>('/courses', { params: { limit: 100 } })).data,
    enabled: open,
  });

  // Classes carry their sections, so one query drives the whole picker.
  const { data: classes } = useQuery({
    queryKey: ['classes'],
    queryFn: async () => (await api.get<any[]>('/classes')).data,
    enabled: open,
  });

  // Sections with no class attached would otherwise be unreachable.
  const { data: batches } = useQuery({
    queryKey: ['batches'],
    queryFn: async () => (await api.get<any[]>('/batches')).data,
    enabled: open,
  });

  const { data: years } = useQuery({
    queryKey: ['academic-years'],
    queryFn: async () => (await api.get<any[]>('/academic-years')).data,
    enabled: open,
  });

  const { data: sites } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => (await api.get<any[]>('/sites')).data,
    enabled: open && !scopedSiteId,
  });

  useEffect(() => {
    if (!open) return;
    setConflict(null);
    if (event) {
      const start = new Date(event.startAt);
      const end = new Date(event.endAt);
      setForm({
        title: event.title ?? '',
        type: event.type ?? 'CLASS',
        date: format(start, 'yyyy-MM-dd'),
        startTime: format(start, 'HH:mm'),
        endTime: format(end, 'HH:mm'),
        courseId: event.courseId ?? '',
        audience: event.batchId
          ? `batch:${event.batchId}`
          : event.classId
            ? `class:${event.classId}`
            : '',
        siteId: event.siteId ?? '',
      });
    } else {
      setForm({ ...EMPTY, date: format(new Date(), 'yyyy-MM-dd') });
    }
  }, [open, event]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        type: form.type,
        startAt: new Date(`${form.date}T${form.startTime}`).toISOString(),
        endAt: new Date(`${form.date}T${form.endTime}`).toISOString(),
        courseId: form.courseId || undefined,
        classId: form.audience.startsWith('class:') ? form.audience.slice(6) : undefined,
        batchId: form.audience.startsWith('batch:') ? form.audience.slice(6) : undefined,
        siteId: scopedSiteId ?? form.siteId ?? undefined,
      };
      return isEdit
        ? (await api.patch(`/calendar/${event.id}`, payload)).data
        : (await api.post('/calendar', payload)).data;
    },
    onSuccess: (result: any) => {
      // A clash is reported, not blocked — the office may intend it.
      if (result?.conflict) {
        setConflict(result.conflict.message);
        return;
      }
      onDone();
    },
  });

  // Creating a subject needs a code; derive one so the user never types it.
  const createSubject = useMutation({
    mutationFn: async (title: string) => {
      const code =
        title
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 12) || 'SUBJ';
      return (await api.post<any>('/courses', { code: `${code}-${Date.now() % 1000}`, title })).data;
    },
    onSuccess: (created) => {
      setForm((f) => ({ ...f, courseId: created.id }));
      qc.invalidateQueries({ queryKey: ['courses'] });
    },
  });

  const { data: sitesForCreate } = useQuery({
    queryKey: ['sites'],
    queryFn: async () => (await api.get<any[]>('/sites')).data,
    enabled: open,
  });

  const createGroup = useMutation({
    mutationFn: async (name: string) => {
      const year = years?.find((y: any) => y.isCurrent) ?? years?.[0];
      if (!year) throw new Error('Add an academic year first, under Academic Structure.');

      // A class belongs to one school, so fall back to the only one available
      // rather than failing on a field the user was never shown.
      const siteId = scopedSiteId ?? form.siteId ?? sitesForCreate?.[0]?.id;
      if (!siteId) throw new Error('Add a school first, under Sites & Devices.');

      return (await api.post<any>('/classes', { academicYearId: year.id, siteId, name })).data;
    },
    onSuccess: (created) => {
      setForm((f) => ({ ...f, audience: `class:${created.id}` }));
      qc.invalidateQueries({ queryKey: ['classes'] });
    },
  });

  const timesValid = form.startTime < form.endTime;

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit timetable entry' : 'Add to timetable'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={conflict ? onDone : onClose}>
            {conflict ? 'Done' : 'Cancel'}
          </button>
          {!conflict && (
            <button
              type="button"
              className="btn-primary"
              disabled={!form.title || !form.date || !timesValid || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Add to timetable'}
            </button>
          )}
        </>
      }
    >
      {conflict ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Saved, but it overlaps something else</p>
          <p className="mt-1">{conflict}</p>
          <p className="mt-2 text-xs">
            The entry was added — review the timetable if this was not intended.
          </p>
        </div>
      ) : (
        <>
          <Field
            label="What is happening?"
            hint="Shown on the timetable, e.g. Mathematics — Period 1, or Half-yearly exam."
          >
            <input
              className="input"
              placeholder="Mathematics — Period 1"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>

          <Field label="Kind of entry">
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm({ ...form, type: t })}
                  className={clsx(
                    'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                    form.type === t
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-slate-300 bg-white text-ink-soft hover:bg-slate-50',
                  )}
                >
                  {t.toLowerCase()}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Date">
              <input
                className="input"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </Field>
            <Field label="From">
              <input
                className="input"
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              />
            </Field>
            <Field label="To" error={!timesValid ? 'Must be after the start time.' : undefined}>
              <input
                className="input"
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
              />
            </Field>
          </div>

          <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Who is it for?
          </p>

          <PickerWithCreate
            label="Subject"
            hint="The course this class belongs to. Leave as “Any subject” for a holiday or a general notice."
            emptyLabel="Any subject"
            value={form.courseId}
            onChange={(v) => setForm({ ...form, courseId: v })}
            options={(courses?.items ?? []).map((c: any) => ({ id: c.id, label: c.title }))}
            createLabel="New subject"
            createPlaceholder="e.g. Mathematics — Class 10"
            onCreate={(name) => createSubject.mutate(name)}
            creating={createSubject.isPending}
            createError={createSubject.isError ? errorMessage(createSubject.error) : undefined}
          />

          <ClassPicker
            value={form.audience}
            onChange={(v) => setForm({ ...form, audience: v })}
            classes={classes ?? []}
            looseBatches={(batches ?? []).filter((b: any) => !b.classId)}
            onCreateClass={(name) => createGroup.mutate(name)}
            creating={createGroup.isPending}
            createError={createGroup.isError ? errorMessage(createGroup.error) : undefined}
          />

          {scopedSiteId ? (
            <p className="text-xs text-slate-500">
              This entry is added to your school automatically.
            </p>
          ) : (
            <Field label="School" hint="Leave as “All schools” to publish everywhere.">
              <select
                className="input"
                value={form.siteId}
                onChange={(e) => setForm({ ...form, siteId: e.target.value })}
              >
                <option value="">All schools</option>
                {sites?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {save.isError && <p className="mt-3 text-sm text-red-600">{errorMessage(save.error)}</p>}
        </>
      )}
    </Modal>
  );
}

/**
 * A dropdown that can also create the thing it is picking. Without this, an
 * empty list is a dead end — the user has to leave the form, create the record
 * elsewhere, and start over.
 */
function PickerWithCreate({
  label,
  hint,
  emptyLabel,
  value,
  onChange,
  options,
  createLabel,
  createPlaceholder,
  onCreate,
  creating,
  createError,
}: {
  label: string;
  hint: string;
  emptyLabel: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; label: string }>;
  createLabel: string;
  createPlaceholder: string;
  onCreate: (name: string) => void;
  creating: boolean;
  createError?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  return (
    <Field label={label} hint={adding ? undefined : hint} error={createError}>
      {adding ? (
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1"
            placeholder={createPlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button
            type="button"
            className="btn-primary"
            disabled={!name.trim() || creating}
            onClick={() => {
              onCreate(name.trim());
              setName('');
              setAdding(false);
            }}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setAdding(false);
              setName('');
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <select
            className="input flex-1"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">{emptyLabel}</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn-secondary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            {createLabel}
          </button>
        </div>
      )}
    </Field>
  );
}

/**
 * Who the entry is for: a whole class, or one section within it. Most school
 * timetable entries apply to the class, so that is the first option under each
 * heading rather than something to hunt for.
 */
function ClassPicker({
  value,
  onChange,
  classes,
  looseBatches,
  onCreateClass,
  creating,
  createError,
}: {
  value: string;
  onChange: (v: string) => void;
  classes: any[];
  looseBatches: any[];
  onCreateClass: (name: string) => void;
  creating: boolean;
  createError?: string;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');

  return (
    <Field
      label="Class"
      hint={
        adding
          ? undefined
          : 'Pick a whole class, or one of its sections. Leave as “All students” for a holiday or a school-wide notice.'
      }
      error={createError}
    >
      {adding ? (
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1"
            placeholder="e.g. Class 11"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <button
            type="button"
            className="btn-primary"
            disabled={!name.trim() || creating}
            onClick={() => {
              onCreateClass(name.trim());
              setName('');
              setAdding(false);
            }}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setAdding(false);
              setName('');
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <select className="input flex-1" value={value} onChange={(e) => onChange(e.target.value)}>
            <option value="">All students</option>

            {classes.map((c) => (
              <optgroup key={c.id} label={`${c.name}${c.site?.name ? ` · ${c.site.name}` : ''}`}>
                <option value={`class:${c.id}`}>{c.name} — whole class</option>
                {c.batches?.map((b: any) => (
                  <option key={b.id} value={`batch:${b.id}`}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
            ))}

            {looseBatches.length > 0 && (
              <optgroup label="Other groups">
                {looseBatches.map((b) => (
                  <option key={b.id} value={`batch:${b.id}`}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          <button type="button" className="btn-secondary" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            New class
          </button>
        </div>
      )}
    </Field>
  );
}
