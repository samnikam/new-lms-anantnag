import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { IsString } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Audit } from '../common/decorators/audit.decorator';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';
import { CertificatesService } from './certificates.service';

class IssueDto {
  @IsString() studentId!: string;
  @IsString() courseId!: string;
}

@ApiTags('certificates')
@Controller()
export class CertificatesController {
  constructor(
    private certificates: CertificatesService,
    private users: UsersService,
  ) {}

  /** Public verification page — no authentication, by design. */
  @Public()
  @Get('verify/:token')
  verify(@Param('token') token: string) {
    return this.certificates.verify(token);
  }

  @Get('certificates')
  list(@CurrentUser() user: AuthUser, @Query('courseId') courseId?: string) {
    return this.certificates.list({
      studentId: user.role === Role.STUDENT ? user.id : undefined,
      courseId,
    });
  }

  @Get('certificates/student/:studentId')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN, Role.TEACHER, Role.PARENT)
  async forStudent(@Param('studentId') studentId: string, @CurrentUser() user: AuthUser) {
    await this.users.assertParentAccess(user, studentId);
    return this.certificates.list({ studentId });
  }

  @Get('certificates/:id/download')
  async download(@Param('id') id: string, @Res() res: Response) {
    const { buffer, fileName } = await this.certificates.renderPdf(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Post('certificates/issue')
  @Roles(Role.SUPER_ADMIN, Role.ACADEMIC_ADMIN)
  @Audit('certificate.issue', 'Certificate')
  issue(@Body() dto: IssueDto) {
    return this.certificates.issue(dto.studentId, dto.courseId);
  }

  @Post('certificates/:id/revoke')
  @Roles(Role.SUPER_ADMIN)
  @Audit('certificate.revoke', 'Certificate')
  revoke(@Param('id') id: string) {
    return this.certificates.revoke(id);
  }
}
