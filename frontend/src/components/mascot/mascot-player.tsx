"use client";

import Link from "next/link";
import { CourseNavigationProvider } from "@buildment/learning-ui/components/learn/course-navigation";
import { MascotPlayer as SharedMascotPlayer } from "@buildment/learning-ui/mascot/MascotPlayer";
import { useMascotReactions } from "@/lib/engagement/use-mascot";

/** The shared player (packages/learning-ui/src/mascot) on the web's routing and reactions. */
export function MascotPlayer() {
  return (
    <CourseNavigationProvider Link={Link}>
      <SharedMascotPlayer useReactions={useMascotReactions} />
    </CourseNavigationProvider>
  );
}
