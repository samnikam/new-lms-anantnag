import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_KEY, AuditMeta } from '../decorators/audit.decorator';

/** Writes an AuditLog row for any route annotated with @Audit(). */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.get<AuditMeta>(AUDIT_KEY, context.getHandler());
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest();
    return next.handle().pipe(
      tap((result) => {
        this.prisma.auditLog
          .create({
            data: {
              actorId: req.user?.id ?? null,
              action: meta.action,
              entity: meta.entity,
              entityId: result?.id ?? req.params?.id ?? null,
              after: sanitize(result),
              ip: req.ip,
              userAgent: req.headers?.['user-agent'],
            },
          })
          .catch(() => undefined); // auditing must never break the request
      }),
    );
  }
}

const REDACTED = new Set([
  'passwordHash',
  'password',
  'newPassword',
  'currentPassword',
  'tokenHash',
  'kioskPasswordHash',
  'kioskPassword',
  'verifyToken',
  'zoomStartUrl',
]);

/**
 * Strips secrets from an audited payload.
 *
 * The walk is recursive: audited handlers routinely return nested relations
 * (a scheduled broadcast carries its target classrooms, for instance), so a
 * top-level-only sweep would let a nested credential hash reach the log.
 */
function sanitize(value: unknown, depth = 0): any {
  if (depth > 8 || value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return value.map((item) => sanitize(item, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (REDACTED.has(key)) continue;
    output[key] = typeof item === 'object' && item !== null ? sanitize(item, depth + 1) : item;
  }
  return output;
}
