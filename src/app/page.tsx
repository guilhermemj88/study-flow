import { StudyFlowApp } from "@/components/study-flow-app";
import { requirePageUser } from "@/lib/auth/server-session";

export default async function CalendarRoute() {
  await requirePageUser();
  return <StudyFlowApp view="calendar" />;
}
