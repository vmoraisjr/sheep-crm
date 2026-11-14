export type Role = 'owner' | 'admin' | 'member';
export function canManageOrganization(role: Role) {return role === 'owner' || role === 'admin';}
export function isRole(value:unknown):value is Role {return value==='owner'||value==='admin'||value==='member';}
