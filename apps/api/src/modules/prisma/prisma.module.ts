import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** P04: the generated client is the single, process-wide database access path. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
