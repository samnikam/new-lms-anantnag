import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Clock, Plus, ShieldAlert, X } from 'lucide-react';
import clsx from 'clsx';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  Field,
  Modal,
  PageHeader,
  StatusBadge,
  Table,
} from '../components/ui';

export function QuizzesPage() {
  const { user } = useAuth();
  const isStudent = user!.role === 'STUDENT';
  const canAuthor = ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER'].includes(user!.role);
  const qc = useQueryClient();
  const [results, setResults] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['quizzes'],
    queryFn: async () => (await api.get<any[]>('/quizzes')).data,
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Quizzes & Examinations"
        description={isStudent ? 'Open assessments and your results.' : 'Question bank, quizzes and results.'}
        actions={
          canAuthor && (
            <button type="button" className="btn-primary" onClick={() => setBuilding(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              New quiz
            </button>
          )
        }
      />

      {!data?.length ? (
        <EmptyState title="No quizzes yet" />
      ) : (
        <Card>
          <Table headers={['Quiz', 'Course', 'Duration', 'Questions', 'Integrity', '']}>
            {data.map((q: any) => (
              <tr key={q.id}>
                <td className="td">
                  <p className="font-medium">{q.title}</p>
                  <p className="text-xs text-slate-500">
                    Pass mark {q.passMark}% · {q.maxAttempts} attempt{q.maxAttempts === 1 ? '' : 's'}
                  </p>
                </td>
                <td className="td text-slate-600">{q.course.title}</td>
                <td className="td whitespace-nowrap text-slate-600">{q.durationMin} min</td>
                <td className="td tabular-nums">{q._count.questions}</td>
                <td className="td">
                  {q.proctoringEnabled ? (
                    <Badge tone="warn">
                      <ShieldAlert className="mr-1 h-3 w-3" aria-hidden />
                      proctored
                    </Badge>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="td text-right">
                  {isStudent ? (
                    q.published && (
                      <Link to={`/quizzes/${q.id}/attempt`} className="text-sm text-brand-700 hover:underline">
                        Start
                      </Link>
                    )
                  ) : (
                    <button
                      type="button"
                      className="text-sm text-brand-700 hover:underline"
                      onClick={() => setResults(q.id)}
                    >
                      Results ({q._count.attempts})
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <ResultsModal quizId={results} onClose={() => setResults(null)} />
      <QuizBuilderModal
        open={building}
        onClose={() => setBuilding(false)}
        onDone={() => {
          setBuilding(false);
          qc.invalidateQueries({ queryKey: ['quizzes'] });
        }}
      />
    </>
  );
}

function ResultsModal({ quizId, onClose }: { quizId: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['quiz-results', quizId],
    queryFn: async () => (await api.get<any[]>(`/quizzes/${quizId}/results`)).data,
    enabled: !!quizId,
  });

  const publish = useMutation({
    mutationFn: async () => (await api.post(`/quizzes/${quizId}/publish-results`, {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quizzes'] }),
  });

  return (
    <Modal
      open={!!quizId}
      title="Quiz results"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button type="button" className="btn-primary" onClick={() => publish.mutate()} disabled={publish.isPending}>
            Publish results to learners
          </button>
        </>
      }
    >
      {isLoading ? (
        <Loading />
      ) : !data?.length ? (
        <EmptyState title="No attempts yet" />
      ) : (
        <Table headers={['Learner', 'Score', 'Result', 'Integrity flags']}>
          {data.map((a: any) => (
            <tr key={a.id}>
              <td className="td font-medium">{a.student.fullName}</td>
              <td className="td tabular-nums">
                {a.score ?? '—'}/{a.maxScore ?? '—'}
              </td>
              <td className="td">
                {a.passed === null ? (
                  <Badge tone="warn">manual review</Badge>
                ) : a.passed ? (
                  <Badge tone="good">passed</Badge>
                ) : (
                  <Badge tone="bad">not passed</Badge>
                )}
              </td>
              <td className="td">
                {a.proctorFlags.length ? (
                  <Badge tone="warn">{a.proctorFlags.length} flagged</Badge>
                ) : (
                  <span className="text-xs text-slate-400">clean</span>
                )}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Modal>
  );
}

/**
 * Learner attempt view. When proctoring is on, leaving the window is reported
 * to the server, which auto-submits once the configured budget is exceeded.
 */
export function QuizAttemptPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [warning, setWarning] = useState('');
  const [result, setResult] = useState<any>(null);
  const submittedRef = useRef(false);

  const { data: attempt, isLoading, error } = useQuery({
    queryKey: ['attempt', id],
    queryFn: async () => (await api.post<any>(`/quizzes/${id}/attempts`, {})).data,
    retry: false,
    refetchOnMount: false,
    staleTime: Infinity,
  });

  const saveAnswer = useMutation({
    mutationFn: async ({ questionId, selectedIds }: { questionId: string; selectedIds: string[] }) =>
      (await api.post(`/attempts/${attempt.attemptId}/answers`, { questionId, selectedIds })).data,
  });

  const submit = useMutation({
    mutationFn: async () => (await api.post(`/attempts/${attempt.attemptId}/submit`, {})).data,
    onSuccess: (data) => setResult(data),
  });

  const flag = useMutation({
    mutationFn: async (type: string) =>
      (await api.post(`/attempts/${attempt.attemptId}/flags`, { type })).data,
    onSuccess: (data: any) => {
      if (data.autoSubmitted) {
        submittedRef.current = true;
        setResult({ autoSubmitted: true, message: data.message });
      } else if (data.remaining !== undefined) {
        setWarning(
          `Leaving the exam window is recorded. ${data.remaining} switch${data.remaining === 1 ? '' : 'es'} remaining before this attempt is submitted automatically.`,
        );
      }
    },
  });

  const doSubmit = useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    submit.mutate();
  }, [submit]);

  // Countdown; the attempt submits itself when the clock runs out.
  useEffect(() => {
    if (!attempt?.expiresAt || result) return;
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) doSubmit();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [attempt, result, doSubmit]);

  // Integrity: report tab/window switches while the attempt is open.
  useEffect(() => {
    if (!attempt?.proctoringEnabled || result) return;
    const onHidden = () => {
      if (document.hidden) flag.mutate('TAB_SWITCH');
    };
    const onBlur = () => flag.mutate('WINDOW_BLUR');
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('blur', onBlur);
    };
  }, [attempt, result, flag]);

  if (isLoading) return <Loading label="Preparing your attempt…" />;
  if (error) return <ErrorState message={errorMessage(error)} />;

  if (result) {
    return (
      <Card className="mx-auto max-w-lg">
        <div className="py-6 text-center">
          <h2 className="text-xl font-semibold text-ink">
            {result.autoSubmitted ? 'Attempt submitted automatically' : 'Attempt submitted'}
          </h2>
          {result.message && <p className="mt-2 text-sm text-amber-700">{result.message}</p>}

          {result.awaitingManualReview ? (
            <p className="mt-4 text-sm text-ink-soft">
              Some answers need a teacher to review them. Your result will appear once marking is complete.
            </p>
          ) : result.resultVisible === false ? (
            <p className="mt-4 text-sm text-ink-soft">
              Your answers are recorded. Results will be visible once your teacher publishes them.
            </p>
          ) : (
            result.score !== undefined && (
              <p className="mt-4 text-3xl font-semibold tabular-nums">
                {result.score}/{result.maxScore}
              </p>
            )
          )}

          <button type="button" className="btn-primary mt-6" onClick={() => navigate('/quizzes')}>
            Back to quizzes
          </button>
        </div>
      </Card>
    );
  }

  const minutes = remaining !== null ? Math.floor(remaining / 60) : 0;
  const seconds = remaining !== null ? remaining % 60 : 0;
  const answered = Object.values(answers).filter((a) => a.length).length;

  return (
    <>
      <PageHeader
        title={attempt.title}
        description={`${attempt.questions.length} questions · ${answered} answered`}
        actions={
          <>
            <span
              className={clsx(
                'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold tabular-nums',
                remaining !== null && remaining < 120 ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-ink',
              )}
            >
              <Clock className="h-4 w-4" aria-hidden />
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </span>
            <button type="button" className="btn-primary" onClick={doSubmit} disabled={submit.isPending}>
              Submit attempt
            </button>
          </>
        }
      />

      {attempt.proctoringEnabled && (
        <div className="mb-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            This is a proctored assessment. Switching tabs or windows is recorded, and the attempt is
            submitted automatically after {attempt.maxTabSwitches} switches.
          </p>
        </div>
      )}

      {warning && (
        <div role="alert" className="mb-4 flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>{warning}</p>
        </div>
      )}

      <div className="space-y-4">
        {attempt.questions.map((q: any, index: number) => (
          <Card key={q.questionId}>
            <fieldset>
              <legend className="mb-3 text-sm font-medium text-ink">
                <span className="mr-2 text-slate-400">Q{index + 1}.</span>
                {q.body}
                <span className="ml-2 text-xs text-slate-400">({q.marks} marks)</span>
              </legend>

              <div className="space-y-2">
                {q.options.map((option: any) => {
                  const multi = q.type === 'MCQ_MULTI';
                  const selected = (answers[q.questionId] ?? []).includes(option.id);
                  return (
                    <label
                      key={option.id}
                      className={clsx(
                        'flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors',
                        selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:bg-slate-50',
                      )}
                    >
                      <input
                        type={multi ? 'checkbox' : 'radio'}
                        name={q.questionId}
                        checked={selected}
                        onChange={(e) => {
                          const current = answers[q.questionId] ?? [];
                          const next = multi
                            ? e.target.checked
                              ? [...current, option.id]
                              : current.filter((id) => id !== option.id)
                            : [option.id];
                          setAnswers((prev) => ({ ...prev, [q.questionId]: next }));
                          saveAnswer.mutate({ questionId: q.questionId, selectedIds: next });
                        }}
                      />
                      {option.body}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </Card>
        ))}
      </div>

      <div className="mt-6 flex justify-end">
        <button type="button" className="btn-primary" onClick={doSubmit} disabled={submit.isPending}>
          {submit.isPending ? 'Submitting…' : 'Submit attempt'}
        </button>
      </div>
    </>
  );
}

/**
 * Quiz builder. A quiz is questions plus rules, so this walks both: write the
 * questions into the course bank, pick which ones the quiz uses, then publish.
 */
function QuizBuilderModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<'details' | 'questions'>('details');
  const [quiz, setQuiz] = useState<any | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [form, setForm] = useState({
    courseId: '',
    title: '',
    description: '',
    durationMin: 30,
    maxAttempts: 1,
    passMark: 40,
    proctoringEnabled: false,
    maxTabSwitches: 3,
  });

  const { data: courses } = useQuery({
    queryKey: ['courses', 'picker'],
    queryFn: async () => (await api.get<any>('/courses', { params: { limit: 100 } })).data,
    enabled: open,
  });

  const { data: bank, refetch: refetchBank } = useQuery({
    queryKey: ['questions', form.courseId],
    queryFn: async () =>
      (await api.get<any[]>('/questions', { params: { courseId: form.courseId } })).data,
    enabled: open && !!form.courseId,
  });

  const createQuiz = useMutation({
    mutationFn: async () =>
      (
        await api.post<any>('/quizzes', {
          ...form,
          durationMin: Number(form.durationMin),
          maxAttempts: Number(form.maxAttempts),
          passMark: Number(form.passMark),
          maxTabSwitches: Number(form.maxTabSwitches),
          description: form.description || undefined,
        })
      ).data,
    onSuccess: (created) => {
      setQuiz(created);
      setStep('questions');
    },
  });

  const attachAndPublish = useMutation({
    mutationFn: async () => {
      await api.post(`/quizzes/${quiz.id}/questions`, {
        items: picked.map((questionId) => ({ questionId })),
      });
      return (await api.post(`/quizzes/${quiz.id}/publish`, {})).data;
    },
    onSuccess: () => {
      setStep('details');
      setQuiz(null);
      setPicked([]);
      setForm({ ...form, title: '', description: '' });
      onDone();
    },
  });

  const close = () => {
    setStep('details');
    setQuiz(null);
    setPicked([]);
    onClose();
  };

  return (
    <Modal
      open={open}
      title={step === 'details' ? 'New quiz' : `Add questions — ${quiz?.title ?? ''}`}
      onClose={close}
      footer={
        step === 'details' ? (
          <>
            <button type="button" className="btn-secondary" onClick={close}>
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!form.courseId || !form.title || createQuiz.isPending}
              onClick={() => createQuiz.mutate()}
            >
              Next: questions
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-secondary" onClick={close}>
              Finish later
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={picked.length === 0 || attachAndPublish.isPending}
              onClick={() => attachAndPublish.mutate()}
            >
              Publish quiz ({picked.length})
            </button>
          </>
        )
      }
    >
      {step === 'details' ? (
        <>
          <Field label="Course">
            <select
              className="input"
              value={form.courseId}
              onChange={(e) => setForm({ ...form, courseId: e.target.value })}
            >
              <option value="">Select a course…</option>
              {courses?.items?.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Title">
            <input
              className="input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </Field>

          <Field label="Description">
            <textarea
              className="input"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Duration (min)">
              <input
                className="input"
                type="number"
                min={1}
                value={form.durationMin}
                onChange={(e) => setForm({ ...form, durationMin: Number(e.target.value) })}
              />
            </Field>
            <Field label="Attempts allowed">
              <input
                className="input"
                type="number"
                min={1}
                value={form.maxAttempts}
                onChange={(e) => setForm({ ...form, maxAttempts: Number(e.target.value) })}
              />
            </Field>
            <Field label="Pass mark (%)">
              <input
                className="input"
                type="number"
                min={0}
                max={100}
                value={form.passMark}
                onChange={(e) => setForm({ ...form, passMark: Number(e.target.value) })}
              />
            </Field>
          </div>

          <label className="mb-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.proctoringEnabled}
              onChange={(e) => setForm({ ...form, proctoringEnabled: e.target.checked })}
            />
            Proctor this assessment (record window switches)
          </label>

          {form.proctoringEnabled && (
            <Field
              label="Switches allowed before auto-submit"
              hint="The attempt submits itself once this is exceeded."
            >
              <input
                className="input"
                type="number"
                min={1}
                value={form.maxTabSwitches}
                onChange={(e) => setForm({ ...form, maxTabSwitches: Number(e.target.value) })}
              />
            </Field>
          )}

          {createQuiz.isError && (
            <p className="text-sm text-red-600">{errorMessage(createQuiz.error)}</p>
          )}
        </>
      ) : (
        <>
          <QuestionComposer courseId={form.courseId} onCreated={() => refetchBank()} />

          <h3 className="mb-2 mt-6 text-sm font-semibold text-ink">
            Question bank for this course
          </h3>
          {!bank?.length ? (
            <EmptyState
              title="No questions yet"
              description="Write the first question above; it stays in the bank for reuse."
            />
          ) : (
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
              {bank.map((q) => (
                <li key={q.id} className="py-2">
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={picked.includes(q.id)}
                      onChange={(e) =>
                        setPicked((prev) =>
                          e.target.checked ? [...prev, q.id] : prev.filter((x) => x !== q.id),
                        )
                      }
                    />
                    <span>
                      <span className="font-medium">{q.body}</span>
                      <span className="block text-xs text-slate-500">
                        {q.type.replace(/_/g, ' ').toLowerCase()} · {q.marks} mark
                        {q.marks === 1 ? '' : 's'} · {q.options.length} options
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {attachAndPublish.isError && (
            <p className="mt-3 text-sm text-red-600">{errorMessage(attachAndPublish.error)}</p>
          )}
        </>
      )}
    </Modal>
  );
}

/** Writes one question into the course bank. */
function QuestionComposer({
  courseId,
  onCreated,
}: {
  courseId: string;
  onCreated: () => void;
}) {
  const [body, setBody] = useState('');
  const [marks, setMarks] = useState(1);
  const [options, setOptions] = useState([
    { body: '', isCorrect: true },
    { body: '', isCorrect: false },
  ]);

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/questions', {
          courseId,
          type: 'MCQ_SINGLE',
          body,
          marks: Number(marks),
          options: options.filter((o) => o.body.trim()),
        })
      ).data,
    onSuccess: () => {
      setBody('');
      setOptions([
        { body: '', isCorrect: true },
        { body: '', isCorrect: false },
      ]);
      onCreated();
    },
  });

  const filled = options.filter((o) => o.body.trim());
  const canSave = body.trim() && filled.length >= 2 && filled.some((o) => o.isCorrect);

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <h3 className="mb-3 text-sm font-semibold text-ink">Write a question</h3>

      <Field label="Question">
        <input className="input" value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>

      <p className="label">Options — select the correct one</p>
      {options.map((o, i) => (
        <div key={i} className="mb-2 flex items-center gap-2">
          <input
            type="radio"
            name="correct-option"
            checked={o.isCorrect}
            onChange={() =>
              setOptions(options.map((x, j) => ({ ...x, isCorrect: i === j })))
            }
            aria-label={`Option ${i + 1} is correct`}
          />
          <input
            className="input"
            placeholder={`Option ${i + 1}`}
            value={o.body}
            onChange={(e) =>
              setOptions(options.map((x, j) => (i === j ? { ...x, body: e.target.value } : x)))
            }
          />
          {options.length > 2 && (
            <button
              type="button"
              className="rounded p-1.5 text-red-600 hover:bg-red-50"
              aria-label={`Remove option ${i + 1}`}
              onClick={() => setOptions(options.filter((_, j) => j !== i))}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setOptions([...options, { body: '', isCorrect: false }])}
        >
          Add option
        </button>
        <div className="w-28">
          <label className="label">Marks</label>
          <input
            className="input"
            type="number"
            min={1}
            value={marks}
            onChange={(e) => setMarks(Number(e.target.value))}
          />
        </div>
        <button
          type="button"
          className="btn-primary"
          disabled={!canSave || create.isPending}
          onClick={() => create.mutate()}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add to bank
        </button>
      </div>

      {create.isError && <p className="mt-2 text-sm text-red-600">{errorMessage(create.error)}</p>}
    </div>
  );
}
