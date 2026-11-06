import { requireLearnSurface } from "@/server/auth/guards";

export default async function LearnMainLayout({ children }: { children: React.ReactNode }) {
  await requireLearnSurface();
  return children;
}
