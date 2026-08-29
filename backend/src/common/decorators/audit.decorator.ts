import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';
export interface AuditMeta {
  action: string;
  entity: string;
}

/** Mark a privileged route so the AuditInterceptor records actor/action/target. */
export const Audit = (action: string, entity: string) =>
  SetMetadata(AUDIT_KEY, { action, entity } as AuditMeta);
