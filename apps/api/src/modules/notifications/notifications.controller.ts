import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import type { PaginationQuery } from '@ts/types';
import { paginationSchema, type z } from '@ts/validation';
import { idParamSchema } from '../../common/dto/phase7.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { NotificationsService } from './notifications.service';

type IdParam = z.infer<typeof idParamSchema>;

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Query(new ZodValidationPipe(paginationSchema)) query: PaginationQuery) {
    return this.notifications.list(query);
  }

  @Patch(':id/read')
  markRead(@Param(new ZodValidationPipe(idParamSchema)) id: IdParam) {
    return this.notifications.markRead(id);
  }
}
