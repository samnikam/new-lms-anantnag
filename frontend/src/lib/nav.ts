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

  { to: '/courses', label: 'Courses', icon: BookOpen, roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'CONTENT_MANAGER'] },
  { to: '/my-learning', label: 'My Learning', icon: GraduationCap, roles: ['STUDENT'] },

  { to: '/live', label: 'Live & Broadcast', icon: Video, roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'STUDENT'] },
  { to: '/calendar', label: 'Timetable', icon: CalendarDays, roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'] },

  { to: '/attendance', label: 'Attendance', icon: ListChecks, roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'STUDENT'] },
  { to: '/assignments', label: 'Assignments', icon: ClipboardList, roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'STUDENT'] },
  { to: '/quizzes', label: 'Quizzes & Exams', icon: FileCheck2, roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'STUDENT'] },
  { to: '/certificates', label: 'Certificates', icon: FileBadge, roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'STUDENT'] },

  { to: '/users', label: 'Users & Roles', icon: Users, roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN'] },
  { to: '/academic', label: 'Academic Structure', icon: UserSquare2, roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN'] },
  { to: '/sites', label: 'Sites & Devices', icon: Building2, roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'DEPT_OVERSIGHT'] },

  { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['SUPER_ADMIN', 'ACADEMIC_ADMIN', 'TEACHER', 'DEPT_OVERSIGHT'] },
  { to: '/announcements', label: 'Announcements', icon: Megaphone, roles: ALL },
  { to: '/support', label: 'Help & Support', icon: LifeBuoy, roles: ALL },
  { to: '/audit', label: 'Audit Logs', icon: ScrollText, roles: ['SUPER_ADMIN'] },
  { to: '/kiosk', label: 'Classroom Panel', icon: MonitorPlay, roles: ['SUPER_ADMIN'] },
];

export function navFor(role: Role) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
