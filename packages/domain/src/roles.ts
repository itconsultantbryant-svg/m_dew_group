export const ROLES = [
  'OWNER',
  'GENERAL_MANAGER',
  'FRONT_DESK',
  'FINANCE',
  'HOUSEKEEPING',
  'RESTAURANT',
  'BOUTIQUE',
  'ENTERTAINMENT',
  'CONTENT_EDITOR',
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'dashboard:view',
  'reservation:read',
  'reservation:create',
  'reservation:update',
  'reservation:cancel',
  'reservation:checkin',
  'reservation:checkout',
  'reservation:assign_room',
  'reservation:override',
  'inventory:read',
  'inventory:block',
  'housekeeping:read',
  'housekeeping:update',
  'maintenance:read',
  'maintenance:manage',
  'payment:read',
  'payment:record',
  'payment:refund',
  'folio:read',
  'folio:adjust',
  'report:view',
  'report:export',
  'content:read',
  'content:edit',
  'content:publish',
  'menu:manage',
  'boutique:manage',
  'events:manage',
  'guest:read',
  'guest:manage',
  'staff:manage',
  'audit:read',
  'settings:manage',
  'notification:read',
  'notification:retry',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const FRONT_DESK: Permission[] = [
  'dashboard:view',
  'reservation:read',
  'reservation:create',
  'reservation:update',
  'reservation:cancel',
  'reservation:checkin',
  'reservation:checkout',
  'reservation:assign_room',
  'inventory:read',
  'housekeeping:read',
  'housekeeping:update',
  'maintenance:read',
  'maintenance:manage',
  'payment:read',
  'payment:record',
  'folio:read',
  'guest:read',
  'guest:manage',
  'notification:read',
  'content:read',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: [...PERMISSIONS],
  GENERAL_MANAGER: PERMISSIONS.filter((p) => p !== 'settings:manage'),
  FRONT_DESK,
  FINANCE: [
    'dashboard:view',
    'reservation:read',
    'inventory:read',
    'payment:read',
    'payment:record',
    'payment:refund',
    'folio:read',
    'folio:adjust',
    'report:view',
    'report:export',
    'guest:read',
    'audit:read',
  ],
  HOUSEKEEPING: [
    'dashboard:view',
    'inventory:read',
    'housekeeping:read',
    'housekeeping:update',
    'maintenance:read',
    'maintenance:manage',
    'reservation:read',
  ],
  RESTAURANT: ['dashboard:view', 'menu:manage', 'content:read', 'content:edit', 'guest:read'],
  BOUTIQUE: ['dashboard:view', 'boutique:manage', 'content:read', 'content:edit'],
  ENTERTAINMENT: ['dashboard:view', 'events:manage', 'content:read', 'content:edit'],
  CONTENT_EDITOR: ['dashboard:view', 'content:read', 'content:edit', 'content:publish', 'menu:manage', 'boutique:manage', 'events:manage'],
};

export function hasPermission(role: Role | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function hasAnyPermission(role: Role | undefined | null, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}
