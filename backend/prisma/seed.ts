/**
 * Seeds a realistic deployment matching the bid's footprint:
 * 21 sites, 42 classroom panels + 42 OPS PCs, 2 broadcast studios.
 */
import { PrismaClient, Role, DeviceType, DeviceStatus, ContentState, QuestionType, SessionMode } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const hash = (plain: string) => argon2.hash(plain, { type: argon2.argon2id });

const SITE_NAMES = [
  'Pahalgam', 'Aru', 'Betab Valley', 'Chandanwari', 'Mamal', 'Ganeshbal',
  'Frislan', 'Batakote', 'Laripora', 'Hapatnar', 'Akhal', 'Salia',
  'Yannar', 'Sallar', 'Dhaknad', 'Kanjulwan', 'Seer', 'Nowbugh',
  'Sagam', 'Aishmuqam', 'Langanbal',
];

async function main() {
  console.log('Seeding Hybrid Learning LMS Portal…');

  // ── Sites, classrooms and devices ────────────────────────────────
  const sites = [];
  for (const [i, name] of SITE_NAMES.entries()) {
    const site = await prisma.site.upsert({
      where: { code: `SITE-${String(i + 1).padStart(2, '0')}` },
      update: {},
      create: {
        code: `SITE-${String(i + 1).padStart(2, '0')}`,
        name: `Govt. School ${name}`,
        district: 'Anantnag',
        consigneeAddr: `${name}, R&B Division Pahalgam, J&K`,
        contactName: `Site Coordinator ${i + 1}`,
        contactPhone: `94190${String(10000 + i).slice(-5)}`,
        internetLink: `BSNL-FTTH-${1000 + i}`,
      },
    });
    sites.push(site);
  }

  // 42 panels across 21 sites = 2 classrooms per site.
  let panelSeq = 0;
  for (const [siteIndex, site] of sites.entries()) {
    for (let room = 1; room <= 2; room++) {
      panelSeq += 1;
      // The first two rooms of the first site are the broadcast studios.
      const isStudio = siteIndex === 0;
      const code = `${site.code}-R${room}`;

      const classroom = await prisma.classroom.upsert({
        where: { code },
        update: {},
        create: {
          siteId: site.id,
          name: isStudio ? `Broadcast Studio ${room}` : `Classroom ${room}`,
          code,
          capacity: 40,
          isStudio,
          kioskUsername: `kiosk-${code.toLowerCase()}`,
          kioskPasswordHash: await hash('Kiosk@2026'),
        },
      });

      const devices: Array<[DeviceType, string]> = [
        [DeviceType.INTERACTIVE_PANEL, `IP-${String(panelSeq).padStart(3, '0')}`],
        [DeviceType.OPS_PC, `OPS-${String(panelSeq).padStart(3, '0')}`],
      ];
      if (isStudio) devices.push([DeviceType.PTZ_CAMERA, `PTZ-${room}`]);
      if (room === 1) devices.push([DeviceType.UPS, `UPS-${site.code}`]);

      for (const [type, serialNo] of devices) {
        await prisma.device.upsert({
          where: { serialNo },
          update: {},
          create: {
            classroomId: classroom.id,
            type,
            serialNo,
            model: type === DeviceType.INTERACTIVE_PANEL ? '75" 4K Interactive Panel' : undefined,
            // Most sites reporting in; a couple offline, as in real operation.
            status: panelSeq % 9 === 0 ? DeviceStatus.OFFLINE : DeviceStatus.ONLINE,
            lastSeenAt: panelSeq % 9 === 0 ? new Date(Date.now() - 3600_000) : new Date(),
          },
        });
      }
    }
  }

  // ── Users ────────────────────────────────────────────────────────
  const password = await hash('Password@123');

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@lms.gov.in' },
    update: {},
    create: { email: 'admin@lms.gov.in', fullName: 'System Administrator', role: Role.SUPER_ADMIN, passwordHash: password },
  });

  await prisma.user.upsert({
    where: { email: 'academic@lms.gov.in' },
    update: {},
    create: { email: 'academic@lms.gov.in', fullName: 'Dr. Nasreen Akhtar', role: Role.ACADEMIC_ADMIN, passwordHash: password },
  });

  const teacher = await prisma.user.upsert({
    where: { email: 'teacher@lms.gov.in' },
    update: {},
    create: {
      email: 'teacher@lms.gov.in',
      fullName: 'Imtiyaz Ahmad Bhat',
      role: Role.TEACHER,
      passwordHash: password,
      siteId: sites[0].id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'content@lms.gov.in' },
    update: {},
    create: { email: 'content@lms.gov.in', fullName: 'Content Desk', role: Role.CONTENT_MANAGER, passwordHash: password },
  });

  await prisma.user.upsert({
    where: { email: 'oversight@pwd.jk.gov.in' },
    update: {},
    create: {
      email: 'oversight@pwd.jk.gov.in',
      fullName: 'PWD Monitoring Cell',
      role: Role.DEPT_OVERSIGHT,
      passwordHash: password,
    },
  });

  const student = await prisma.user.upsert({
    where: { email: 'student@lms.gov.in' },
    update: {},
    create: {
      email: 'student@lms.gov.in',
      fullName: 'Aaliya Jan',
      role: Role.STUDENT,
      passwordHash: password,
      siteId: sites[0].id,
      mobile: '9419011111',
    },
  });

  const parent = await prisma.user.upsert({
    where: { email: 'parent@lms.gov.in' },
    update: {},
    create: {
      email: 'parent@lms.gov.in',
      fullName: 'Mohammad Yousuf Jan',
      role: Role.PARENT,
      passwordHash: password,
      mobile: '9419022222',
    },
  });

  await prisma.parentStudentLink.upsert({
    where: { parentId_studentId: { parentId: parent.id, studentId: student.id } },
    update: { status: 'APPROVED' },
    create: {
      parentId: parent.id,
      studentId: student.id,
      relation: 'father',
      status: 'APPROVED',
      approvedBy: superAdmin.id,
      approvedAt: new Date(),
    },
  });

  // A cohort of learners spread across the sites.
  const cohort = [student];
  for (let i = 1; i <= 24; i++) {
    const email = `student${i}@lms.gov.in`;
    cohort.push(
      await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          fullName: `Learner ${i}`,
          role: Role.STUDENT,
          passwordHash: password,
          siteId: sites[i % sites.length].id,
        },
      }),
    );
  }

  // ── Academic structure ───────────────────────────────────────────
  const year = await prisma.academicYear.upsert({
    where: { name: '2026-27' },
    update: {},
    create: {
      name: '2026-27',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2027-03-31'),
      isCurrent: true,
    },
  });

  const batch = await prisma.batch.upsert({
    where: { academicYearId_name: { academicYearId: year.id, name: 'Class 10 — A' } },
    update: {},
    create: {
      academicYearId: year.id,
      siteId: sites[0].id,
      name: 'Class 10 — A',
      grade: '10',
      section: 'A',
    },
  });

  // ── Course with modules, lessons and resources ───────────────────
  const course = await prisma.course.upsert({
    where: { code: 'SCI-10' },
    update: {},
    create: {
      code: 'SCI-10',
      title: 'Science — Class 10',
      description: 'Physics, Chemistry and Biology for Class 10, delivered in hybrid mode.',
      category: 'Science',
      level: 'Class 10',
      objectives: 'Build conceptual clarity across the Class 10 science syllabus.',
      durationHours: 120,
      state: ContentState.PUBLISHED,
      publishedAt: new Date(),
      requiredLessonPct: 80,
      passMark: 40,
    },
  });

  await prisma.courseTeacher.upsert({
    where: { courseId_teacherId: { courseId: course.id, teacherId: teacher.id } },
    update: {},
    create: { courseId: course.id, teacherId: teacher.id, isLead: true },
  });

  const moduleTitles = ['Light and Reflection', 'Chemical Reactions', 'Life Processes'];
  for (const [mi, title] of moduleTitles.entries()) {
    const existing = await prisma.module.findFirst({ where: { courseId: course.id, title } });
    const mod =
      existing ??
      (await prisma.module.create({ data: { courseId: course.id, title, position: mi } }));

    for (let li = 0; li < 3; li++) {
      const lessonTitle = `${title} — Part ${li + 1}`;
      const has = await prisma.lesson.findFirst({ where: { moduleId: mod.id, title: lessonTitle } });
      if (has) continue;

      const lesson = await prisma.lesson.create({
        data: {
          moduleId: mod.id,
          title: lessonTitle,
          content: `Lesson notes for ${lessonTitle}.`,
          position: li,
          durationMin: 35,
          state: ContentState.PUBLISHED,
        },
      });

      await prisma.resource.create({
        data: {
          lessonId: lesson.id,
          title: `${lessonTitle} — study notes`,
          type: 'PDF',
          url: 'https://example.org/notes.pdf',
          state: ContentState.PUBLISHED,
          isDownloadable: true, // available in the offline pack
          inLibrary: true,
        },
      });
    }
  }

  // ── Enrollments ──────────────────────────────────────────────────
  for (const learner of cohort) {
    await prisma.enrollment.upsert({
      where: { studentId_courseId: { studentId: learner.id, courseId: course.id } },
      update: {},
      create: { studentId: learner.id, courseId: course.id, batchId: batch.id },
    });
  }

  // ── Question bank and a quiz ─────────────────────────────────────
  const existingQuestions = await prisma.question.count({ where: { courseId: course.id } });
  if (existingQuestions === 0) {
    const bank = [
      { body: 'The image formed by a plane mirror is always:', options: ['Real and inverted', 'Virtual and erect', 'Real and erect', 'Virtual and inverted'], correct: 1 },
      { body: 'The chemical formula of quicklime is:', options: ['CaO', 'CaCO3', 'Ca(OH)2', 'CaSO4'], correct: 0 },
      { body: 'Which organ produces bile in the human body?', options: ['Pancreas', 'Stomach', 'Liver', 'Kidney'], correct: 2 },
      { body: 'The SI unit of the power of a lens is:', options: ['Metre', 'Dioptre', 'Watt', 'Candela'], correct: 1 },
      { body: 'Photosynthesis mainly occurs in the:', options: ['Root', 'Stem', 'Leaf', 'Flower'], correct: 2 },
    ];

    const quiz = await prisma.quiz.create({
      data: {
        courseId: course.id,
        title: 'Unit Test 1 — Science',
        description: 'Covers reflection, chemical reactions and life processes.',
        durationMin: 20,
        maxAttempts: 2,
        passMark: 40,
        published: true,
        proctoringEnabled: true,
        maxTabSwitches: 3,
      },
    });

    for (const [qi, item] of bank.entries()) {
      const question = await prisma.question.create({
        data: {
          courseId: course.id,
          topic: 'Unit 1',
          type: QuestionType.MCQ_SINGLE,
          body: item.body,
          marks: 2,
          options: {
            create: item.options.map((body, position) => ({
              body,
              position,
              isCorrect: position === item.correct,
            })),
          },
        },
      });
      await prisma.quizQuestion.create({
        data: { quizId: quiz.id, questionId: question.id, position: qi },
      });
    }
  }

  // ── An assignment ────────────────────────────────────────────────
  const hasAssignment = await prisma.assignment.findFirst({ where: { courseId: course.id } });
  if (!hasAssignment) {
    await prisma.assignment.create({
      data: {
        courseId: course.id,
        batchId: batch.id,
        title: 'Ray diagram worksheet',
        instructions: 'Draw ray diagrams for concave mirrors at all six object positions.',
        maxMarks: 20,
        dueAt: new Date(Date.now() + 7 * 864e5),
        allowLate: true,
        latePenaltyPct: 10,
        createdById: teacher.id,
        published: true,
      },
    });
  }

  // ── A broadcast session from Studio 1 to every classroom panel ───
  const studio = await prisma.classroom.findFirst({ where: { isStudio: true } });
  const targets = await prisma.classroom.findMany({ where: { isStudio: false }, take: 40 });

  const hasSession = await prisma.liveSession.findFirst({ where: { mode: SessionMode.BROADCAST } });
  if (!hasSession && studio) {
    const start = new Date(Date.now() + 864e5);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 45 * 60_000);

    const session = await prisma.liveSession.create({
      data: {
        title: 'Live: Reflection of Light — Studio Broadcast',
        description: 'Relayed simultaneously to all participating classrooms.',
        courseId: course.id,
        batchId: batch.id,
        hostId: teacher.id,
        mode: SessionMode.BROADCAST,
        originRoomId: studio.id,
        scheduledStart: start,
        scheduledEnd: end,
        moderatedQA: true,
        streamUrl: '/relay/demo/index.m3u8',
        targets: { create: targets.map((t) => ({ classroomId: t.id })) },
      },
    });

    await prisma.calendarEvent.create({
      data: {
        title: session.title,
        type: 'CLASS',
        startAt: start,
        endAt: end,
        courseId: course.id,
        batchId: batch.id,
        sessionId: session.id,
        academicYearId: year.id,
        createdById: teacher.id,
      },
    });
  }

  console.log(`
Seed complete.

  Sites: ${sites.length}   Classrooms: ${panelSeq}   Studios: 2

  Sign in with (password: Password@123)
    Super Admin        admin@lms.gov.in
    Academic Admin     academic@lms.gov.in
    Teacher            teacher@lms.gov.in
    Content Manager    content@lms.gov.in
    Student            student@lms.gov.in
    Parent             parent@lms.gov.in
    Dept. Oversight    oversight@pwd.jk.gov.in

  Classroom kiosk login: kiosk-site-02-r1 / Kiosk@2026
`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
