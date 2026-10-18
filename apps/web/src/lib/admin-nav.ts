import type { Permission } from '@mdg/domain';

export interface AdminNavItem {
  href: string;
  label: string;
  description: string;
  icon: string;
  permission: Permission;
}

export interface AdminNavGroup {
  heading: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavGroup[] = [
  {
    heading: 'Operations',
    items: [
      { href: '/admin', label: 'Overview', description: 'Live operations at a glance', icon: 'grid', permission: 'dashboard:view' },
      { href: '/admin/reservations', label: 'Reservations', description: 'Search, check in and out', icon: 'calendar', permission: 'reservation:read' },
      { href: '/admin/rooms', label: 'Rooms & housekeeping', description: 'Readiness, tasks and blocks', icon: 'bed', permission: 'inventory:read' },
      { href: '/admin/guests', label: 'Guests', description: 'Guest profiles and history', icon: 'users', permission: 'guest:read' },
    ],
  },
  {
    heading: 'Revenue',
    items: [
      { href: '/admin/payments', label: 'Payments', description: 'Take payments and approve refunds', icon: 'card', permission: 'payment:read' },
      { href: '/admin/reports', label: 'Reports', description: 'Occupancy, ADR, RevPAR, cash', icon: 'chart', permission: 'report:view' },
    ],
  },
  {
    heading: 'Content & services',
    items: [
      { href: '/admin/content', label: 'Content', description: 'Pages, menu, boutique and events', icon: 'document', permission: 'content:read' },
      { href: '/admin/notifications', label: 'Notifications', description: 'Delivery queue and failures', icon: 'bell', permission: 'notification:read' },
    ],
  },
  {
    heading: 'Administration',
    items: [
      { href: '/admin/team', label: 'Team', description: 'Staff accounts and roles', icon: 'shield', permission: 'staff:manage' },
      { href: '/admin/audit', label: 'Audit log', description: 'Every change, who did what', icon: 'list', permission: 'audit:read' },
    ],
  },
];
