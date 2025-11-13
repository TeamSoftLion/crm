import { Module } from '@nestjs/common';
import { GroupsService } from './group.service';
import { GroupsController } from './group.controller';

@Module({
  providers: [GroupsService],
  controllers: [GroupsController],
  exports: [GroupsService],
})
export class GroupModule {}
