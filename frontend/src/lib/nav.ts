import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardList,
  FileBadge,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Megaphone,
  MonitorPlay,
  SlidersHorizontal,
  ScrollText,
  Users,
  UserSquare2,
  Video,
} from 'lucide-react';
import type { Role } from './auth';

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: Role[];
  /**
   * Per-role wording. Several screens are shared but scoped differently by the
   * server — a teacher's course list is their own assignments, an admin's is
   * the whole catalogue. The label should say which, rather than leaving every
   * role to read the same word and assume the same screen.
   */
  labelByRole?: Partial<Record<Role, string>>;
}

const ALL: Role[] = [
  'SUPER_ADMIN',
  'ACADEMIC_ADMIN',
  'TEACHER',
  'STUDENT',
  'PARENT',
  'CONTENT_MANAGER',
  'DEPT_OVERSIGHT',
];

/**
 * The sidebar is built from this list, filtered by role — a role never sees a
 * module it cannot use (§7: never show irrelevant modules).
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ALL },

  {
    to: '/courses',
    label: 'Courses',
    icon: BookOpen,
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'CONTENT_MANAGER'],
    labelByRole: {
      SUPER_ADMIN: 'All Courses',
      ACADEMIC_ADMIN: 'Course Catalogue',
      TEACHER: 'My Courses',
      CONTENT_MANAGER: 'Content Library',
    },
  },
  { to: '/my-learning', label: 'My Learning', icon: GraduationCap, roles: ['STUDENT'] },

  {
    to: '/live',
    label: 'Live & Broadcast',
    icon: Video,
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'STUDENT'],
    labelByRole: { TEACHER: 'My Live Classes', STUDENT: 'Join Live Class' },
  },
  {
    to: '/calendar',
    label: 'Timetable',
    icon: CalendarDays,
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
    labelByRole: { TEACHER: 'My Timetable', PARENT: "Child's Timetable" },
  },

  {
    to: '/attendance',
    label: 'Attendance',
    icon: ListChecks,
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'STUDENT'],
    labelByRole: {
      ACADEMIC_ADMIN: 'Attendance Oversight',
      TEACHER: 'Mark Attendance',
      STUDENT: 'My Attendance',
    },
  },
  {
    to: '/assignments',
    label: 'Assignments',
    icon: ClipboardList,
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'STUDENT'],
    labelByRole: { TEACHER: 'Grading', STUDENT: 'My Assignments' },
  },
  {
    to: '/quizzes',
    label: 'Quizzes & Exams',
    icon: FileCheck2,
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'STUDENT'],
    labelByRole: { TEACHER: 'Question Bank & Exams', STUDENT: 'My Quizzes' },
  },
  {
    to: '/certificates',
    label: 'Certificates',
    icon: FileBadge,
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'STUDENT'],
    labelByRole: { STUDENT: 'My Certificates' },
  },

  {
    to: '/users',
    label: 'Users & Roles',
    icon: Users,
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN'],
    // An Academic Admin manages teaching staff and learners, never administrators.
    labelByRole: { ACADEMIC_ADMIN: 'Staff & Learners' },
  },
  { to: '/academic', label: 'Academic Structure', icon: UserSquare2, roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN'] },
  {
    to: '/sites',
    label: 'Sites & Devices',
    icon: Building2,
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'DEPT_OVERSIGHT'],
    labelByRole: { DEPT_OVERSIGHT: 'Site Monitoring' },
  },

  {
    to: '/reports',
    label: 'Reports',
    icon: BarChart3,
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'DEPT_OVERSIGHT'],
    labelByRole: {
      SUPER_ADMIN: 'Platform Reports',
      ACADEMIC_ADMIN: 'Academic Reports',
      TEACHER: 'Learner Progress',
      DEPT_OVERSIGHT: 'Utilization Reports',
    },
  },
  { to: '/announcements', label: 'Announcements', icon: Megaphone, roles: ALL },
  { to: '/support', label: 'Help & Support', icon: LifeBuoy, roles: ALL },
  { to: '/settings', label: 'System Settings', icon: SlidersHorizontal, roles: ['SUPER_ADMIN'] },
  { to: '/audit', label: 'Audit Logs', icon: ScrollText, roles: ['SUPER_ADMIN'] },
  { to: '/kiosk', label: 'Classroom Panel', icon: MonitorPlay, roles: ['SUPER_ADMIN'] },
];

export function navFor(role: Role) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) => ({
    ...item,
    label: item.labelByRole?.[role] ?? item.label,
  }));
}
