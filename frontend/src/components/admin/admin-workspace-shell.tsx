"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen,
  Building2,
  ClipboardList,
  BadgePercent,
  History,
  LayoutDashboard,
  LineChart,
  Menu,
  Users,
} from "lucide-react";
import { WorkspaceAccountMenu } from "@/components/workspace/workspace-account-menu";
import { Logo } from "@/components/brand/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/notification-bell";

type AdminNavItem = {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  active: boolean;
  badge?: number;
};

export function AdminWorkspaceShell({
  children,
  user,
  pendingRequests,
  organizationCount,
  signOutAction,
}: {
  children: ReactNode;
  user: { name?: string | null; email?: string | null };
  pendingRequests: number;
  organizationCount: number;
  signOutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const navItems: AdminNavItem[] = [
    {
      label: "Overview",
      href: "/admin",
      icon: LayoutDashboard,
      active: pathname === "/admin",
    },
    {
      label: "Organizations",
      href: "/admin/organizations",
      icon: Building2,
      active: pathname.startsWith("/admin/organizations"),
      badge: organizationCount,
    },
    {
      label: "Requests",
      href: "/admin/requests",
      icon: ClipboardList,
      active: pathname === "/admin/requests",
      badge: pendingRequests,
    },
    {
      label: "Courses",
      href: "/admin/courses",
      icon: BookOpen,
      active: pathname === "/admin/courses",
    },
    {
      label: "Discounts",
      href: "/admin/discounts",
      icon: BadgePercent,
      active: pathname.startsWith("/admin/discounts"),
    },
    {
      label: "Users",
      href: "/admin/users",
      icon: Users,
      active: pathname === "/admin/users",
    },
    {
      label: "Trends",
      href: "/admin/trends",
      icon: LineChart,
      active: pathname === "/admin/trends",
    },
    {
      label: "Audit",
      href: "/admin/audit",
      icon: History,
      active: pathname === "/admin/audit",
    },
  ];

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur lg:hidden">
        <Link href="/admin" aria-label="Platform admin">
          <Logo size="sm" />
        </Link>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <WorkspaceAccountMenu current="admin" user={{ ...user, role: "ADMIN" }} signOutAction={signOutAction} compact />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="grid size-9 place-items-center rounded-lg border bg-card outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Open admin navigation"
                />
              }
            >
              <Menu className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-2rem))] p-1.5">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Platform admin</DropdownMenuLabel>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <DropdownMenuItem
                      key={item.href}
                      className={cn(item.active && "bg-accent font-medium")}
                      onClick={() => router.push(item.href)}
                    >
                      <Icon className="size-4" />
                      <span className="flex-1">{item.label}</span>
                      {item.badge != null && item.badge > 0 ? (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          {item.badge}
                        </span>
                      ) : null}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-card lg:flex">
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4">
          <Link href="/admin" className="inline-flex outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Logo size="sm" />
          </Link>
          <NotificationBell />
        </div>

        <nav aria-label="Platform admin" className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={item.active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  item.active
                    ? "bg-foreground text-background shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.badge != null && item.badge > 0 ? (
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums",
                      item.active ? "bg-background/20 text-background" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t p-2">
          <WorkspaceAccountMenu current="admin" user={{ ...user, role: "ADMIN" }} signOutAction={signOutAction} />
        </div>
      </aside>

      <main className="min-h-dvh lg:pl-60">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
