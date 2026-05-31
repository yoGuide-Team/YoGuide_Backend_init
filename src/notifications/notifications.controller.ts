import {
  Controller, Get, Param, Patch, Post,
  UseGuards, Request,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { NotificationsService } from './notifications.service';
import { Request as ExpressRequest } from 'express';

interface AuthRequest extends ExpressRequest {
  user: {
    id: string;
    email?: string;
  };
}
 
@UseGuards(AuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}
 
  /** GET /notifications – list for current user (newest first) */
@Get()
list(@Request() req: AuthRequest) {
  return this.svc.findForUser(req.user.id);
}

@Patch(':id/read')
markRead(
  @Param('id') id: string,
  @Request() req: AuthRequest,
) {
  return this.svc.markOneRead(id, req.user.id);
}

@Post('mark-all-read')
markAll(@Request() req: AuthRequest) {
  return this.svc.markAllRead(req.user.id);
}
}