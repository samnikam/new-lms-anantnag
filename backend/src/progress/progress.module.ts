import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

@Module({
  imports: [UsersModule, CertificatesModule],
  controllers: [ProgressController],
  providers: [ProgressService],
  exports: [ProgressService],
})
export class ProgressModule {}
