import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Produces a consistent error envelope across the whole API.
 * Shape:
 *   {
 *     statusCode: number,
 *     error: string,                    // 'Bad Request' | 'Unauthorized' | ...
 *     message: string | string[],       // human or validator messages
 *     timestamp: string,                // ISO
 *     path: string                      // request path
 *   }
 *
 * Documented at the `ApiErrorResponse` schema in `common/responses.ts`.
 */
@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpException');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'Unexpected error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      if (typeof r === 'string') {
        message = r;
        error = HttpStatus[status] ?? 'Error';
      } else if (typeof r === 'object' && r !== null) {
        const body = r as Record<string, unknown>;
        message = (body.message as string | string[]) ?? exception.message;
        error = (body.error as string) ?? HttpStatus[status] ?? 'Error';
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      message = exception.message;
    }

    res.status(status).json({
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
      path: req.url,
    });
  }
}
