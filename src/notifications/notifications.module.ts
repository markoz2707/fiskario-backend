import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { PushNotificationService } from './services/push-notification.service';
import { DeadlineManagementService } from './services/deadline-management.service';
import { StatusCenterService } from './services/status-center.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [
    PushNotificationService,
    DeadlineManagementService,
    StatusCenterService,
  ],
  exports: [
    PushNotificationService,
    DeadlineManagementService,
    StatusCenterService,
  ],
})
export class NotificationsModule {}
