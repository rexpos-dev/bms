import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditLogsService } from './audit-logs.service';
import { EventsService } from './events.service';

// Friendly module names per top-level resource path.
const RESOURCE_NAMES: Record<string, string> = {
  clients: 'Client',
  'software-products': 'Product',
  licenses: 'License',
  'nenpos-clients': 'NENPOS Client',
  jobs: 'Job',
  'job-orders': 'Job Order',
  'dev-projects': 'Dev Project',
  earnings: 'Earning',
  withdrawals: 'Withdrawal',
  users: 'User',
  kpis: 'KPI',
  'company-profile': 'Company Profile',
  backups: 'Backup',
};

const ACTION_VERBS: Record<string, string> = {
  POST: 'created',
  PUT: 'updated',
  PATCH: 'updated',
  DELETE: 'deleted',
};

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly auditLogsService: AuditLogsService,
    private readonly eventsService: EventsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const request = http.getRequest();
    const { method, url, ip, body } = request;
    const userAgent = request.get('user-agent') || '';

    // Only log mutations (POST, PUT, DELETE, PATCH)
    const isMutation = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method);
    
    // We want to log login attempts (POST /api/auth/login)
    // and all other successful mutations for authenticated users.
    const isLogin = url.includes('/auth/login');
    const isLogout = url.includes('/auth/logout');

    return next.handle().pipe(
      tap({
        next: async (response) => {
          if (isMutation || isLogout) {
            let userId = request.user?.id;

            // For login, extract userId from response if successful
            if (isLogin && response?.user?.id) {
              userId = response.user.id;
            }

            if (userId || isLogin) {
              await this.logAction(request, userId, response);
            }

            // Broadcast data change to all SSE subscribers (skip auth-only calls).
            // Include who made the change (actor) and which module was affected.
            if (isMutation && !isLogin && !url.includes('/auth/')) {
              const parts = url.split('/').filter((p) => p && p !== 'api');
              const resource = parts[0] ?? 'unknown';
              this.eventsService.emit({
                resource,
                module: RESOURCE_NAMES[resource] ?? resource,
                action: ACTION_VERBS[method] ?? 'updated',
                actor: request.user?.fullName,
                actorRole: request.user?.role,
              });
            }
          }
        },
        error: async (error) => {
          // Log failed login attempts
          if (isLogin) {
            await this.logAction(request, undefined, null, error);
          }
        },
      }),
    );
  }

  private async logAction(request: any, userId: string | undefined, response: any, error?: any) {
    const { method, url, ip, body } = request;
    const userAgent = request.get('user-agent') || '';
    const isLogin = url.includes('/auth/login');

    // Scrub sensitive fields
    const metadata = { ...body };
    const sensitiveKeys = ['password', 'refreshToken', 'token', 'secret', 'mfaSecret'];
    for (const key of sensitiveKeys) {
      if (metadata[key]) metadata[key] = '********';
    }

    let action = this.deriveActionName(method, url);
    if (error) {
      action = `Failed ${action} (${error.status || error.code || 'Error'})`;
    }

    try {
      await this.auditLogsService.record({
        userId,
        action,
        ipAddress: ip,
        device: userAgent,
        metadata: {
          method,
          url,
          payload: metadata,
          error: error ? { message: error.message, status: error.status } : undefined,
          // Don't log the entire response as it might be huge, but maybe some key info
          response: isLogin && response ? { success: true } : undefined,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to record audit log: ${err.message}`);
    }
  }

  private deriveActionName(method: string, url: string): string {
    if (url.includes('/auth/login')) return 'User Login';
    if (url.includes('/auth/logout')) return 'User Logout';
    if (url.includes('/auth/refresh')) return 'Token Refresh';

    const parts = url.split('/').filter(p => p && p !== 'api');
    const resourcePath = parts[0] || 'unknown';
    const resourceName = RESOURCE_NAMES[resourcePath] || resourcePath;
    
    switch (method) {
      case 'POST': return `Created ${resourceName}`;
      case 'PUT':
      case 'PATCH': return `Updated ${resourceName}`;
      case 'DELETE': return `Deleted ${resourceName}`;
      default: return `${method} ${url}`;
    }
  }
}
