import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService, Phase7NotificationsService } from './notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [{ provide: NotificationsService, useClass: Phase7NotificationsService }],
  exports: [NotificationsService],
})
export class NotificationsModule {}
