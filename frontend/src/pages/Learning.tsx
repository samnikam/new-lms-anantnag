import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle, Download, FileText, PlayCircle } from 'lucide-react';
import clsx from 'clsx';
import { api, errorMessage } from '../lib/api';
import {
  Card,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  ProgressBar,
} from '../components/ui';

export function MyLearningPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['my-courses'],
    queryFn: async () => (await api.get<any[]>('/progress/my-courses')).data,
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  return (
    <>
      <PageHeader title="My Learning" description="Your enrolled courses and progress." />

      {!data?.length ? (
        <EmptyState
          title="You are not enrolled in any course yet"
          description="Courses appear here once an administrator enrols you."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((course) => (
            <Card key={course.courseId}>
              <div className="flex h-full flex-col">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{course.code}</p>
                <h2 className="mt-1 text-lg font-semibold text-ink">{course.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {course.lessonsCompleted} of {course.lessonsTotal} lessons complete
                </p>

                <div className="my-4">
                  <ProgressBar value={course.completionPct} />
                </div>

                <Link to={`/learn/${course.courseId}`} className="btn-primary mt-auto w-full">
                  <PlayCircle className="h-4 w-4" aria-hidden />
                  {course.completionPct > 0 ? 'Resume' : 'Start learning'}
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

/** Distraction-free course player with resume and completion tracking. */
export function CoursePlayerPage() {
  const { courseId } = useParams();
  const qc = useQueryClient();
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['player', courseId],
    queryFn: async () => (await api.get<any>(`/courses/${courseId}/player`)).data,
  });

  // Land on the resume point the first time the player loads.
  useEffect(() => {
    if (data && !activeLessonId) setActiveLessonId(data.resumeLessonId);
  }, [data, activeLessonId]);

  const lessons = useMemo(
    () => data?.modules.flatMap((m: any) => m.lessons) ?? [],
    [data],
  );
  const lesson = lessons.find((l: any) => l.id === activeLessonId) ?? lessons[0];

  const complete = useMutation({
    mutationFn: async (lessonId: string) =>
      (await api.post('/progress/track', { courseId, lessonId, completed: true })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['player', courseId] });
      qc.invalidateQueries({ queryKey: ['my-courses'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  if (isLoading) return <Loading />;
  if (error) return <ErrorState message={errorMessage(error)} onRetry={refetch} />;

  const index = lessons.findIndex((l: any) => l.id === lesson?.id);
  const next = lessons[index + 1];

  return (
    <>
      <PageHeader
        title={data.course.title}
        description={`${data.lessonsCompleted} of ${data.lessonsTotal} lessons complete`}
        actions={<Link to="/my-learning" className="btn-secondary">Back to my learning</Link>}
      />

      <div className="mb-6 max-w-md">
        <ProgressBar value={data.completionPct} label="Course progress" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Contents */}
        <nav className="card max-h-[70vh] overflow-y-auto p-3" aria-label="Course contents">
          {data.modules.map((mod: any) => (
            <section key={mod.id} className="mb-4">
              <h2 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {mod.title}
              </h2>
              <ul>
                {mod.lessons.map((l: any) => (
                  <li key={l.id}>
                    <button
                      type="button"
                      onClick={() => setActiveLessonId(l.id)}
                      className={clsx(
                        'flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors',
                        l.id === lesson?.id ? 'bg-brand-50 text-brand-800' : 'text-ink-soft hover:bg-slate-50',
                      )}
                    >
                      {l.completed ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                      ) : (
                        <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                      )}
                      <span>{l.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>

        {/* Lesson */}
        {lesson ? (
          <Card>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-xl font-semibold text-ink">{lesson.title}</h2>
              {lesson.completed ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" aria-hidden />
                  Completed
                </span>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => complete.mutate(lesson.id)}
                  disabled={complete.isPending}
                >
                  Mark as complete
                </button>
              )}
            </div>

            <div className="prose prose-slate max-w-none text-sm leading-relaxed">
              {lesson.content ?? 'No lesson notes have been added yet.'}
            </div>

            {lesson.resources?.length > 0 && (
              <div className="mt-6 border-t border-slate-200 pt-4">
                <h3 className="mb-3 text-sm font-semibold text-ink">Resources</h3>
                <ul className="space-y-2">
                  {lesson.resources.map((r: any) => (
                    <li key={r.id}>
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 text-sm text-brand-700 hover:underline"
                      >
                        {r.isDownloadable ? (
                          <Download className="h-4 w-4" aria-hidden />
                        ) : (
                          <FileText className="h-4 w-4" aria-hidden />
                        )}
                        {r.title}
                        <span className="text-xs text-slate-400">({r.type.toLowerCase()})</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {next && (
              <div className="mt-6 flex justify-end border-t border-slate-200 pt-4">
                <button type="button" className="btn-secondary" onClick={() => setActiveLessonId(next.id)}>
                  Next lesson: {next.title}
                </button>
              </div>
            )}
          </Card>
        ) : (
          <EmptyState title="This course has no published lessons yet" />
        )}
      </div>
    </>
  );
}
