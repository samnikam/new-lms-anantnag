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
  LibraryBig,
  LifeBuoy,
  ListChecks,
  Megaphone,
  Bell,
  ScrollText,
  SlidersHorizontal,
  UserCircle,
  Users,
  UserSquare2,
  Video,
} from 'lucide-react';
import type { Role } from './auth';

/** Sidebar sections, in the order they appear. */
export const NAV_GROUPS = [
  'main',
  'learning',
  'administration',
  'insights',
  'communication',
  'system',
  'account',
] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export const GROUP_LABELS: Record<NavGroup, string | null> = {
  main: null, // Dashboard sits above the first heading
  learning: 'Learning',
  administration: 'Administration',
  insights: 'Insights',
  communication: 'Communication',
  system: 'System',
  account: 'Account',
};

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  group: NavGroup;
  roles: Role[];
  /**
   * Per-role wording. Several screens are shared but scoped differently by the
   * server — a teacher's course list is their own assignments, an admin's is
   * the whole catalogue. The label should say which.
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

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, group: 'main', roles: ALL },

  // ── Learning ──────────────────────────────────────────────────────────
  {
    to: '/courses',
    label: 'Subjects',
    icon: BookOpen,
    group: 'learning',
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'CONTENT_MANAGER'],
    labelByRole: { TEACHER: 'My Subjects' },
  },
  {
    to: '/my-learning',
    label: 'My Learning',
    icon: GraduationCap,
    group: 'learning',
    roles: ['STUDENT'],
  },
  {
    to: '/library',
    label: 'Content Library',
    labelByRole: { ACADEMIC_ADMIN: 'Content' },
    icon: LibraryBig,
    group: 'learning',
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'CONTENT_MANAGER'],
  },
  {
    to: '/live',
    label: 'Live & Broadcast',
    icon: Video,
    group: 'learning',
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'STUDENT'],
    labelByRole: { TEACHER: 'My Live Classes', STUDENT: 'Join Live Class' },
  },
  {
    to: '/calendar',
    label: 'Timetable',
    icon: CalendarDays,
    group: 'learning',
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
    labelByRole: { TEACHER: 'My Timetable', PARENT: "Child's Timetable" },
  },
  {
    to: '/attendance',
    label: 'Attendance',
    icon: ListChecks,
    group: 'learning',
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'STUDENT'],
    labelByRole: { TEACHER: 'Mark Attendance', STUDENT: 'My Attendance' },
  },
  {
    to: '/assignments',
    label: 'Assignments',
    icon: ClipboardList,
    group: 'learning',
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'STUDENT'],
    labelByRole: { TEACHER: 'Grading', STUDENT: 'My Assignments' },
  },
  {
    to: '/quizzes',
    label: 'Quizzes & Exams',
    icon: FileCheck2,
    group: 'learning',
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'STUDENT'],
    labelByRole: { TEACHER: 'Question Bank & Exams', STUDENT: 'My Quizzes' },
  },
  {
    to: '/certificates',
    label: 'Certificates',
    icon: FileBadge,
    group: 'learning',
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'STUDENT'],
    labelByRole: { STUDENT: 'My Certificates' },
  },

  // ── Administration ────────────────────────────────────────────────────
  {
    to: '/users',
    label: 'Users & Roles',
    icon: Users,
    group: 'administration',
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN'],
    // An Academic Admin manages teaching staff and learners, never administrators.
    labelByRole: { ACADEMIC_ADMIN: 'Users' },
  },
  {
    to: '/classes',
    label: 'Classes',
    icon: GraduationCap,
    group: 'administration',
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN'],
  },
  {
    to: '/academic',
    label: 'Academic Structure',
    icon: UserSquare2,
    group: 'administration',
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN'],
  },
  {
    to: '/sites',
    label: 'Sites & Devices',
    icon: Building2,
    group: 'administration',
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'DEPT_OVERSIGHT'],
    labelByRole: { ACADEMIC_ADMIN: 'Sites & Classrooms', DEPT_OVERSIGHT: 'Site Monitoring' },
  },

  // ── Insights ──────────────────────────────────────────────────────────
  {
    to: '/reports',
    label: 'Reports & Analytics',
    icon: BarChart3,
    group: 'insights',
    roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'DEPT_OVERSIGHT'],
    labelByRole: { TEACHER: 'Learner Progress', DEPT_OVERSIGHT: 'Utilization Reports' },
  },

  // ── Communication ─────────────────────────────────────────────────────
  { to: '/announcements', label: 'Announcements', icon: Megaphone, group: 'communication', roles: ALL },
  { to: '/notifications', label: 'Notifications', icon: Bell, group: 'communication', roles: ALL },
  { to: '/support', label: 'Help & Support', icon: LifeBuoy, group: 'communication', roles: ALL },
  { to: '/profile', label: 'My Profile', icon: UserCircle, group: 'account', roles: ALL },

  // ── System (Super Admin only) ─────────────────────────────────────────
  {
    to: '/settings',
    label: 'System Settings',
    icon: SlidersHorizontal,
    group: 'system',
    roles: ['SUPER_ADMIN'],
  },
  { to: '/audit', label: 'Audit Logs', icon: ScrollText, group: 'system', roles: ['SUPER_ADMIN'] },
];

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role)).map((item) => ({
    ...item,
    label: item.labelByRole?.[role] ?? item.label,
  }));
}

/** Groups the role's items in section order, dropping sections it cannot see. */
export function navSectionsFor(role: Role): Array<{ group: NavGroup; label: string | null; items: NavItem[] }> {
  const items = navFor(role);
  return NAV_GROUPS.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    items: items.filter((i) => i.group === group),
  })).filter((section) => section.items.length > 0);
}
