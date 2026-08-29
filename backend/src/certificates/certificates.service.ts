import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class CertificatesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  /** Issues a certificate with a unique number and a public verification token. */
  async issue(studentId: string, courseId: string) {
    const existing = await this.prisma.certificate.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (existing) return existing;

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (enrollment?.status !== 'COMPLETED') {
      throw new BadRequestException('The learner has not completed this course yet.');
    }

    const year = new Date().getFullYear();
    const seq = (await this.prisma.certificate.count()) + 1;
    const certificate = await this.prisma.certificate.create({
      data: {
        studentId,
        courseId,
        certificateNo: `PWD-LMS/${year}/${String(seq).padStart(6, '0')}`,
        verifyToken: randomBytes(16).toString('hex'),
      },
      include: { course: { select: { title: true } } },
    });

    await this.notifications.notifyStudentAndGuardians(studentId, {
      type: 'CERTIFICATE_ISSUED',
      title: 'Certificate issued',
      body: `Your certificate for ${certificate.course.title} is ready to download.`,
      link: '/certificates',
    });

    return certificate;
  }

  list(filter: { studentId?: string; courseId?: string }) {
    return this.prisma.certificate.findMany({
      where: { ...filter, revokedAt: null },
      include: {
        course: { select: { id: true, title: true, code: true } },
        student: { select: { id: true, fullName: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  /** Public verification by certificate number or QR token (§5.11). */
  async verify(token: string) {
    const certificate = await this.prisma.certificate.findFirst({
      where: { OR: [{ verifyToken: token }, { certificateNo: token }] },
      include: {
        student: { select: { fullName: true } },
        course: { select: { title: true, code: true } },
      },
    });

    if (!certificate) {
      return { valid: false, message: 'No certificate matches this number or code.' };
    }
    if (certificate.revokedAt) {
      return { valid: false, message: 'This certificate has been revoked.' };
    }

    return {
      valid: true,
      certificateNo: certificate.certificateNo,
      holder: certificate.student.fullName,
      course: certificate.course.title,
      courseCode: certificate.course.code,
      issuedAt: certificate.issuedAt,
    };
  }

  revoke(id: string) {
    return this.prisma.certificate.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  /** Renders the downloadable PDF certificate. */
  async renderPdf(id: string): Promise<{ buffer: Buffer; fileName: string }> {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id },
      include: {
        student: { select: { fullName: true } },
        course: { select: { title: true, code: true } },
      },
    });
    if (!certificate) throw new NotFoundException('Certificate not found.');

    const verifyUrl = `${process.env.PUBLIC_URL ?? 'http://localhost:5173'}/verify/${certificate.verifyToken}`;

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    doc.rect(20, 20, doc.page.width - 40, doc.page.height - 40).lineWidth(3).stroke('#1e3a5f');

    doc.fontSize(12).fillColor('#555').text('PUBLIC WORKS DEPARTMENT, J&K — R&B DIVISION PAHALGAM', { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(28).fillColor('#1e3a5f').text('Certificate of Completion', { align: 'center' });
    doc.moveDown(1.2);

    doc.fontSize(14).fillColor('#333').text('This is to certify that', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(26).fillColor('#000').text(certificate.student.fullName, { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).fillColor('#333').text('has successfully completed the course', { align: 'center' });
    doc.moveDown(0.4);
    doc.fontSize(18).fillColor('#1e3a5f')
      .text(`${certificate.course.title} (${certificate.course.code})`, { align: 'center' });

    doc.moveDown(2);
    doc.fontSize(11).fillColor('#555');
    doc.text(`Certificate No: ${certificate.certificateNo}`, 60, doc.page.height - 140);
    doc.text(`Issued on: ${certificate.issuedAt.toLocaleDateString('en-IN')}`, 60, doc.page.height - 122);
    doc.text(`Verify at: ${verifyUrl}`, 60, doc.page.height - 104);

    doc.text('Authorised Signatory', doc.page.width - 250, doc.page.height - 110, { width: 190, align: 'right' });

    doc.end();

    const buffer: Buffer = await new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    return { buffer, fileName: `${certificate.certificateNo.replace(/\//g, '-')}.pdf` };
  }
}
