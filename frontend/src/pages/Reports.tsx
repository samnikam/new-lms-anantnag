import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { API_BASE, api, errorMessage, getAccessToken } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  Card,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  ProgressBar,
  Table,
} from '../components/ui';

type ReportKey = 'site-utilization' | 'completion' | 'attendance' | 'assessment' | 'enrollment';

const REPORTS: Array<{ key: ReportKey; label: string; roles: string[] }> = [
  { key: 'site-utilization', label: 'Site utilization', roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'DEPT_OVERSIGHT'] },
  { key: 'completion', label: 'Course completion', roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'DEPT_OVERSIGHT'] },
  { key: 'attendance', label: 'Attendance', roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER'] },
  { key: 'assessment', label: 'Assessment', roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER'] },
  { key: 'enrollment', label: 'Enrolment', roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER'] },
];

export function ReportsPage() {
  const { user } = useAuth();
  const available = REPORTS.filter((r) => r.roles.includes(user!.role));
  const [report, setReport] = useState<ReportKey>(available[0]?.key ?? 'completion');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['report', report],
    queryFn: async () => (await api.get<any[]>(`/reports/${report}`)).data,
  });

  /**
   * The export endpoint streams a file, so it is fetched with the bearer token
   * and saved from a blob rather than opened as a plain link.
   */
  async function download() {
    const res = await fetch(`${API_BASE}/reports/export?report=${report}`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
      credentials: 'include',
    });
    if (!res.ok) return;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${report}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Reports & Analytics"
        description="Filtered reports with CSV export, including site rollups for department reporting."
        actions={
          <button type="button" className="btn-secondary" onClick={download}>
            <Download className="h-4 w-4" aria-hidden />
            Export CSV
          </button>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {available.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setReport(r.key)}
            className={report === r.key ? 'btn-primary' : 'btn-secondary'}
          >
            {r.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={errorMessage(error)} onRetry={refetch} />
      ) : !data?.length ? (
        <EmptyState title="No data for this report yet" />
      ) : (
        <div className="space-y-6">
          {report === 'site-utilization' && <SiteUtilization rows={data} />}
          {report === 'completion' && <Completion rows={data} />}
          {report === 'attendance' && <Attendance rows={data} />}
          {report === 'assessment' && <Assessment rows={data} />}
          {report === 'enrollment' && <Enrollment rows={data} />}
        </div>
      )}
    </>
  );
}

function SiteUtilization({ rows }: { rows: any[] }) {
  return (
    <>
      <Card title="Device uptime by site">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={rows.map((r) => ({ name: r.siteCode, uptime: r.deviceUptimePct }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-45} textAnchor="end" height={60} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
            <Tooltip />
            <Bar dataKey="uptime" fill="#1e4d8f" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Site-wise utilization">
        <Table
          headers={['Site', 'Classrooms', 'Learners', 'Sessions', 'Degraded', 'Avg. headcount', 'Uptime']}
        >
          {rows.map((r) => (
            <tr key={r.siteId}>
              <td className="td">
                <p className="font-medium">{r.siteName}</p>
                <p className="text-xs text-slate-500">{r.siteCode}</p>
              </td>
              <td className="td tabular-nums">{r.classrooms}</td>
              <td className="td tabular-nums">{r.students}</td>
              <td className="td tabular-nums">{r.sessionsReceived}</td>
              <td className="td tabular-nums">{r.sessionsDegraded}</td>
              <td className="td tabular-nums">{r.avgHeadcount}</td>
              <td className="td w-36">
                <ProgressBar value={r.deviceUptimePct} />
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

function Completion({ rows }: { rows: any[] }) {
  return (
    <Card title="Course completion">
      <Table headers={['Course', 'Code', 'Enrolled', 'Completed', 'Completion', 'Certificates']}>
        {rows.map((r) => (
          <tr key={r.courseId}>
            <td className="td font-medium">{r.course}</td>
            <td className="td text-slate-600">{r.code}</td>
            <td className="td tabular-nums">{r.enrolled}</td>
            <td className="td tabular-nums">{r.completed}</td>
            <td className="td w-40">
              <ProgressBar value={r.completionPct} />
            </td>
            <td className="td tabular-nums">{r.certificatesIssued}</td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function Attendance({ rows }: { rows: any[] }) {
  return (
    <Card title="Attendance by learner">
      <Table headers={['Learner', 'Site', 'Present', 'Sessions', 'Attendance']}>
        {rows.map((r) => (
          <tr key={r.studentId}>
            <td className="td font-medium">{r.name}</td>
            <td className="td text-slate-600">{r.site}</td>
            <td className="td tabular-nums">{r.present}</td>
            <td className="td tabular-nums">{r.total}</td>
            <td className="td w-40">
              <ProgressBar value={r.percentage} />
            </td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function Assessment({ rows }: { rows: any[] }) {
  return (
    <Card title="Assessment performance">
      <Table headers={['Quiz', 'Attempts', 'Passed', 'Pass rate', 'Average score', 'Integrity flags']}>
        {rows.map((r) => (
          <tr key={r.quizId}>
            <td className="td font-medium">{r.quiz}</td>
            <td className="td tabular-nums">{r.attempts}</td>
            <td className="td tabular-nums">{r.passed}</td>
            <td className="td tabular-nums">{r.passPct}%</td>
            <td className="td tabular-nums">{r.averageScorePct}%</td>
            <td className="td tabular-nums">{r.attemptsWithIntegrityFlags}</td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function Enrollment({ rows }: { rows: any[] }) {
  return (
    <Card title="Enrolments">
      <Table headers={['Learner', 'Site', 'Course', 'Batch', 'Status']}>
        {rows.map((r, i) => (
          <tr key={i}>
            <td className="td font-medium">{r.student}</td>
            <td className="td text-slate-600">{r.site}</td>
            <td className="td text-slate-600">{r.course}</td>
            <td className="td text-slate-600">{r.batch}</td>
            <td className="td text-slate-600">{r.status.toLowerCase()}</td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}
