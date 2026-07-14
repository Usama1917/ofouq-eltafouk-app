import { and, eq } from "drizzle-orm";
import { db } from "../index";
import {
  academicYearsTable,
  lessonsTable,
  subjectsTable,
  unitsTable,
} from "../schema/academic";
import { subjectSubscriptionsTable } from "../schema/subscriptions";
import { usersTable } from "../schema/users";
import { videoSegmentsTable, videosTable } from "../schema/videos";

type DemoLesson = {
  title: string;
  description: string;
  orderIndex: number;
  video: {
    title: string;
    description: string;
    subject: string;
    videoUrl: string;
    thumbnailUrl: string;
    duration: number;
    instructor: string;
    segments: Array<{
      title: string;
      startSeconds: number;
      segmentType: "parts" | "topics" | "questions";
      orderIndex: number;
    }>;
  };
};

const DEMO_STUDENT_EMAIL = "student@demo.com";

const DEMO_ACADEMIC_CONTENT = [
  {
    name: "الصف الأول الثانوي",
    description: "مسار تجريبي منشور لاختبار دروس الفيديو على الموبايل.",
    orderIndex: 1,
    subjects: [
      {
        name: "الرياضيات",
        icon: "📐",
        description: "دروس تأسيسية في الجبر والدوال.",
        unitLabel: "unit",
        orderIndex: 1,
        units: [
          {
            name: "الجبر والدوال",
            description: "مفاهيم أساسية قبل حل المسائل.",
            orderIndex: 1,
            lessons: [
              {
                title: "مقدمة في الدوال",
                description: "فهم معنى الدالة والتمثيل البياني.",
                orderIndex: 1,
                video: {
                  title: "مقدمة في الدوال",
                  description: "شرح مبسط لمفهوم الدالة مع أمثلة مرئية.",
                  subject: "الرياضيات",
                  videoUrl: "https://www.youtube.com/watch?v=IHZwWFHWa-w",
                  thumbnailUrl: "https://i.ytimg.com/vi/IHZwWFHWa-w/hqdefault.jpg",
                  duration: 1020,
                  instructor: "التفوق",
                  segments: [
                    { title: "الفكرة الأساسية", startSeconds: 0, segmentType: "parts", orderIndex: 1 },
                    { title: "أمثلة محلولة", startSeconds: 300, segmentType: "parts", orderIndex: 2 },
                    { title: "تطبيق سريع", startSeconds: 720, segmentType: "questions", orderIndex: 3 },
                  ],
                },
              },
              {
                title: "قراءة الرسم البياني",
                description: "كيف نستخرج القيم والمجالات من الرسم.",
                orderIndex: 2,
                video: {
                  title: "قراءة الرسم البياني",
                  description: "تدريب مرئي على قراءة العلاقات من الرسوم البيانية.",
                  subject: "الرياضيات",
                  videoUrl: "https://www.youtube.com/watch?v=aircAruvnKk",
                  thumbnailUrl: "https://i.ytimg.com/vi/aircAruvnKk/hqdefault.jpg",
                  duration: 1180,
                  instructor: "التفوق",
                  segments: [
                    { title: "قراءة المحاور", startSeconds: 0, segmentType: "parts", orderIndex: 1 },
                    { title: "تحليل القيم", startSeconds: 360, segmentType: "topics", orderIndex: 2 },
                  ],
                },
              },
            ] satisfies DemoLesson[],
          },
        ],
      },
      {
        name: "الفيزياء",
        icon: "⚡",
        description: "مفاهيم الحركة والقوى بصورة مبسطة.",
        unitLabel: "unit",
        orderIndex: 2,
        units: [
          {
            name: "الحركة في خط مستقيم",
            description: "السرعة والعجلة والتمثيل البياني للحركة.",
            orderIndex: 1,
            lessons: [
              {
                title: "السرعة والعجلة",
                description: "مقارنة عملية بين السرعة المتوسطة والعجلة.",
                orderIndex: 1,
                video: {
                  title: "السرعة والعجلة",
                  description: "شرح تطبيقي للحركة في خط مستقيم.",
                  subject: "الفيزياء",
                  videoUrl: "https://www.youtube.com/watch?v=kMCR6Ox9fYo",
                  thumbnailUrl: "https://i.ytimg.com/vi/kMCR6Ox9fYo/hqdefault.jpg",
                  duration: 900,
                  instructor: "التفوق",
                  segments: [
                    { title: "تعريف السرعة", startSeconds: 0, segmentType: "parts", orderIndex: 1 },
                    { title: "تعريف العجلة", startSeconds: 240, segmentType: "parts", orderIndex: 2 },
                  ],
                },
              },
            ] satisfies DemoLesson[],
          },
        ],
      },
    ],
  },
] as const;

export type SeedDemoAcademicResult = {
  years: number;
  subjects: number;
  units: number;
  lessons: number;
  videos: number;
  segments: number;
  subscriptions: number;
};

async function upsertYear(input: {
  name: string;
  description: string;
  orderIndex: number;
}) {
  const [existing] = await db
    .select({ id: academicYearsTable.id })
    .from(academicYearsTable)
    .where(eq(academicYearsTable.name, input.name))
    .limit(1);

  if (existing) {
    await db
      .update(academicYearsTable)
      .set({
        description: input.description,
        orderIndex: input.orderIndex,
        isPublished: true,
      })
      .where(eq(academicYearsTable.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(academicYearsTable)
    .values({
      name: input.name,
      description: input.description,
      orderIndex: input.orderIndex,
      isPublished: true,
    })
    .returning({ id: academicYearsTable.id });

  return created.id;
}

async function upsertSubject(yearId: number, input: {
  name: string;
  icon: string;
  description: string;
  unitLabel: string;
  orderIndex: number;
}) {
  const [existing] = await db
    .select({ id: subjectsTable.id })
    .from(subjectsTable)
    .where(and(eq(subjectsTable.yearId, yearId), eq(subjectsTable.name, input.name)))
    .limit(1);

  if (existing) {
    await db
      .update(subjectsTable)
      .set({
        icon: input.icon,
        description: input.description,
        unitLabel: input.unitLabel,
        orderIndex: input.orderIndex,
        isPublished: true,
      })
      .where(eq(subjectsTable.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(subjectsTable)
    .values({
      yearId,
      name: input.name,
      icon: input.icon,
      description: input.description,
      unitLabel: input.unitLabel,
      orderIndex: input.orderIndex,
      isPublished: true,
    })
    .returning({ id: subjectsTable.id });

  return created.id;
}

async function upsertUnit(subjectId: number, input: {
  name: string;
  description: string;
  orderIndex: number;
}) {
  const [existing] = await db
    .select({ id: unitsTable.id })
    .from(unitsTable)
    .where(and(eq(unitsTable.subjectId, subjectId), eq(unitsTable.name, input.name)))
    .limit(1);

  if (existing) {
    await db
      .update(unitsTable)
      .set({
        description: input.description,
        orderIndex: input.orderIndex,
        isPublished: true,
      })
      .where(eq(unitsTable.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(unitsTable)
    .values({
      subjectId,
      name: input.name,
      description: input.description,
      orderIndex: input.orderIndex,
      isPublished: true,
    })
    .returning({ id: unitsTable.id });

  return created.id;
}

async function upsertVideo(input: DemoLesson["video"]) {
  const [existing] = await db
    .select({ id: videosTable.id })
    .from(videosTable)
    .where(eq(videosTable.title, input.title))
    .limit(1);

  const values = {
    title: input.title,
    description: input.description,
    subject: input.subject,
    videoUrl: input.videoUrl,
    thumbnailUrl: input.thumbnailUrl,
    posterUrl: input.thumbnailUrl,
    duration: input.duration,
    instructor: input.instructor,
    videoType: "youtube",
    publishStatus: "published",
  };

  if (existing) {
    await db.update(videosTable).set(values).where(eq(videosTable.id, existing.id));
    return existing.id;
  }

  const [created] = await db.insert(videosTable).values(values).returning({ id: videosTable.id });
  return created.id;
}

async function upsertLesson(unitId: number, input: DemoLesson, videoId: number) {
  const [existing] = await db
    .select({ id: lessonsTable.id })
    .from(lessonsTable)
    .where(and(eq(lessonsTable.unitId, unitId), eq(lessonsTable.title, input.title)))
    .limit(1);

  const values = {
    title: input.title,
    description: input.description,
    videoId,
    orderIndex: input.orderIndex,
    isPublished: true,
  };

  if (existing) {
    await db.update(lessonsTable).set(values).where(eq(lessonsTable.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(lessonsTable)
    .values({ unitId, ...values })
    .returning({ id: lessonsTable.id });

  return created.id;
}

async function upsertSegment(videoId: number, input: DemoLesson["video"]["segments"][number]) {
  const [existing] = await db
    .select({ id: videoSegmentsTable.id })
    .from(videoSegmentsTable)
    .where(and(eq(videoSegmentsTable.videoId, videoId), eq(videoSegmentsTable.title, input.title)))
    .limit(1);

  const values = {
    title: input.title,
    startSeconds: input.startSeconds,
    segmentType: input.segmentType,
    orderIndex: input.orderIndex,
  };

  if (existing) {
    await db.update(videoSegmentsTable).set(values).where(eq(videoSegmentsTable.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(videoSegmentsTable)
    .values({ videoId, ...values })
    .returning({ id: videoSegmentsTable.id });

  return created.id;
}

async function upsertDemoStudentSubscription(yearId: number, subjectId: number) {
  const [student] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, DEMO_STUDENT_EMAIL))
    .limit(1);

  if (!student) {
    return null;
  }

  const now = new Date();
  const [existing] = await db
    .select({ id: subjectSubscriptionsTable.id })
    .from(subjectSubscriptionsTable)
    .where(
      and(
        eq(subjectSubscriptionsTable.studentId, student.id),
        eq(subjectSubscriptionsTable.subjectId, subjectId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(subjectSubscriptionsTable)
      .set({
        yearId,
        source: "demo_seed",
        status: "active",
        updatedAt: now,
      })
      .where(eq(subjectSubscriptionsTable.id, existing.id));
    return existing.id;
  }

  const [created] = await db
    .insert(subjectSubscriptionsTable)
    .values({
      studentId: student.id,
      yearId,
      subjectId,
      source: "demo_seed",
      status: "active",
      updatedAt: now,
    })
    .returning({ id: subjectSubscriptionsTable.id });

  return created.id;
}

export async function seedDemoAcademic(): Promise<SeedDemoAcademicResult> {
  const result: SeedDemoAcademicResult = {
    years: 0,
    subjects: 0,
    units: 0,
    lessons: 0,
    videos: 0,
    segments: 0,
    subscriptions: 0,
  };

  for (const year of DEMO_ACADEMIC_CONTENT) {
    const yearId = await upsertYear(year);
    result.years += 1;

    for (const subject of year.subjects) {
      const subjectId = await upsertSubject(yearId, subject);
      result.subjects += 1;

      const subscriptionId = await upsertDemoStudentSubscription(yearId, subjectId);
      if (subscriptionId) result.subscriptions += 1;

      for (const unit of subject.units) {
        const unitId = await upsertUnit(subjectId, unit);
        result.units += 1;

        for (const lesson of unit.lessons) {
          const videoId = await upsertVideo(lesson.video);
          result.videos += 1;

          await upsertLesson(unitId, lesson, videoId);
          result.lessons += 1;

          for (const segment of lesson.video.segments) {
            await upsertSegment(videoId, segment);
            result.segments += 1;
          }
        }
      }
    }
  }

  return result;
}
