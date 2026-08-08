import { addDays, toDateKey } from "@/lib/date-utils";
import type { ActivityResult, StudyActivity, StudyData, StudySubject } from "@/types/activity";

export const defaultSubjects: StudySubject[] = [
  {
    id: "subject-cardiology",
    name: "Cardiologia",
    topics: ["Arritmias", "IAM", "Insuficiência Cardíaca", "Hipertensão"],
  },
  {
    id: "subject-pediatrics",
    name: "Pediatria",
    topics: ["Pneumonia", "Neonatologia", "Vacinação", "Puericultura"],
  },
  {
    id: "subject-neurology",
    name: "Neurologia",
    topics: ["AVC", "Epilepsia", "Cefaleias", "Demências"],
  },
  {
    id: "subject-gynecology",
    name: "Ginecologia",
    topics: ["Pré-natal", "Climatério", "Contracepção", "Sangramento uterino"],
  },
];

interface SeedActivityOptions {
  id: string;
  date: Date;
  type: StudyActivity["type"];
  subject: string;
  topic: string;
  estimatedMinutes: number;
  questionCount?: number;
  priority?: StudyActivity["priority"];
  status?: StudyActivity["status"];
  notes?: string;
  result?: ActivityResult;
}

function seedActivity(options: SeedActivityOptions): StudyActivity {
  const createdAt = addDays(options.date, -7).toISOString();
  const completed = options.status === "completed";

  return {
    id: options.id,
    type: options.type,
    subject: options.subject,
    topic: options.topic,
    date: toDateKey(options.date),
    estimatedMinutes: options.estimatedMinutes,
    questionCount: options.questionCount,
    priority: options.priority ?? "medium",
    status: options.status ?? "planned",
    notes: options.notes,
    createdAt,
    completedAt: completed ? options.date.toISOString() : undefined,
    result: options.result,
  };
}

export function createDemoActivities(today = new Date()): StudyActivity[] {
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);

  return [
    seedActivity({
      id: "demo-study-complete",
      date: addDays(startOfToday, -7),
      type: "study",
      subject: "Cardiologia",
      topic: "Insuficiência Cardíaca",
      estimatedMinutes: 45,
      priority: "high",
      status: "completed",
      result: {
        actualMinutes: 52,
        perceivedDifficulty: "normal",
        studyMethods: ["class", "summary"],
        notes: "Revisados os critérios de Framingham.",
      },
    }),
    seedActivity({
      id: "demo-exercise-complete",
      date: addDays(startOfToday, -5),
      type: "exercise",
      subject: "Pediatria",
      topic: "Pneumonia",
      estimatedMinutes: 35,
      questionCount: 20,
      status: "completed",
      result: {
        questionsAnswered: 20,
        correctAnswers: 16,
        wrongAnswers: 4,
        accuracy: 80,
        perceivedDifficulty: "normal",
        errorReasons: ["mixed_concepts", "inattention"],
      },
    }),
    seedActivity({
      id: "demo-review-complete",
      date: addDays(startOfToday, -3),
      type: "review",
      subject: "Neurologia",
      topic: "Epilepsia",
      estimatedMinutes: 25,
      questionCount: 12,
      priority: "medium",
      status: "completed",
      result: {
        questionsAnswered: 12,
        correctAnswers: 9,
        wrongAnswers: 3,
        accuracy: 75,
        perceivedDifficulty: "hard",
        errorReasons: ["forgot"],
      },
    }),
    seedActivity({
      id: "demo-overdue-avc",
      date: addDays(startOfToday, -2),
      type: "reinforcement",
      subject: "Neurologia",
      topic: "AVC",
      estimatedMinutes: 30,
      questionCount: 15,
      priority: "critical",
      notes: "Refazer questões sobre janela terapêutica.",
    }),
    seedActivity({
      id: "demo-today-study",
      date: startOfToday,
      type: "study",
      subject: "Cardiologia",
      topic: "Insuficiência Cardíaca",
      estimatedMinutes: 40,
      priority: "high",
      notes: "Foco no tratamento da IC com fração reduzida.",
    }),
    seedActivity({
      id: "demo-today-review",
      date: startOfToday,
      type: "review",
      subject: "Cardiologia",
      topic: "Arritmias",
      estimatedMinutes: 25,
      questionCount: 10,
      priority: "medium",
      notes: "Revisão D+7.",
    }),
    seedActivity({
      id: "demo-today-exercise",
      date: startOfToday,
      type: "exercise",
      subject: "Pediatria",
      topic: "Pneumonia",
      estimatedMinutes: 35,
      questionCount: 20,
      priority: "medium",
    }),
    seedActivity({
      id: "demo-prenatal",
      date: addDays(startOfToday, 3),
      type: "study",
      subject: "Ginecologia",
      topic: "Pré-natal",
      estimatedMinutes: 50,
      priority: "medium",
    }),
    seedActivity({
      id: "demo-hypertension",
      date: addDays(startOfToday, 6),
      type: "exercise",
      subject: "Cardiologia",
      topic: "Hipertensão",
      estimatedMinutes: 35,
      questionCount: 25,
      priority: "low",
    }),
    seedActivity({
      id: "demo-pediatrics-review",
      date: addDays(startOfToday, 10),
      type: "review",
      subject: "Pediatria",
      topic: "Vacinação",
      estimatedMinutes: 20,
      questionCount: 10,
      priority: "high",
      status: "attention",
      notes: "Revisar atualização do calendário vacinal.",
    }),
    seedActivity({
      id: "demo-neuro-study",
      date: addDays(startOfToday, 14),
      type: "study",
      subject: "Neurologia",
      topic: "Cefaleias",
      estimatedMinutes: 45,
      priority: "medium",
    }),
    seedActivity({
      id: "demo-iam-reinforcement",
      date: addDays(startOfToday, 18),
      type: "reinforcement",
      subject: "Cardiologia",
      topic: "IAM",
      estimatedMinutes: 30,
      questionCount: 15,
      priority: "high",
    }),
  ];
}

export function createDemoData(today = new Date()): StudyData {
  return {
    version: 1,
    activities: createDemoActivities(today),
    subjects: defaultSubjects.map((subject) => ({ ...subject, topics: [...subject.topics] })),
  };
}
