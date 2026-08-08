import type { Metadata } from "next";
import { StudyFlowApp } from "@/components/study-flow-app";

export const metadata: Metadata = { title: "Matérias" };

export default function SubjectsRoute() {
  return <StudyFlowApp view="subjects" />;
}
