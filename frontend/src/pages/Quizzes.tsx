import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Clock, ShieldAlert } from 'lucide-react';
import clsx from 'clsx';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  Modal,
  PageHeader,
  StatusBadge,
  Table,
} from '../components/ui';

export function QuizzesPage() {
  const { user } = useAuth();
  const isStudent = user!.role === 'STUDENT';
  const [results, setResults] = useState<string | null>(null);

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
