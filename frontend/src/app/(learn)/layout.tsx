import { requireLearnSurface } from "@/server/auth/guards";
import { AppActivityTracker } from "@/components/app-activity-tracker";
import { NotificationCenter } from "@/components/notifications/notification-center";
import { MascotPlayer } from "@/components/mascot/mascot-player";
import { AccountSetupPrompt } from "@/components/auth/account-setup-prompt";
import { DailyStreakPopup } from "@/components/learn/daily-streak-popup";

export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  const user = await requireLearnSurface();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <AppActivityTracker />
      <NotificationCenter />
      <MascotPlayer />
      <AccountSetupPrompt user={user} />
      <DailyStreakPopup userId={user.id} />
      {children}
    </div>
  );
}
