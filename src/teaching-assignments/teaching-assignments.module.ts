import { Module } from '@nestjs/common';
import { TeachingAssignmentsService } from './teaching-assignments.service';
import { TeachingAssignmentsController } from './teaching-assignments.controller';
import { PrismaService } from 'prisma/prisma.service';

@Module({
  controllers: [TeachingAssignmentsController],
  providers: [TeachingAssignmentsService, PrismaService],
  exports: [TeachingAssignmentsService],
})
export class TeachingAssignmentsModule {}
