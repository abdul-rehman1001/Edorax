import { Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { useState } from "react";

export function CourseCurriculumUpgradeBanner({
  courseSlug,
  onUpgrade,
}: {
  courseSlug: string;
  onUpgrade?: () => Promise<void> | void;
}) {
  const [upgrading, setUpgrading] = useState(false);
  const [upgraded, setUpgraded] = useState(false);

  const handleUpgrade = async () => {
    try {
      setUpgrading(true);
      if (onUpgrade) {
        await onUpgrade();
      } else {
        const res = await fetch(`/api/v1/courses/${encodeURIComponent(courseSlug)}/upgrade-curriculum`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) {
          setUpgraded(true);
          window.location.reload();
        }
      }
    } finally {
      setUpgrading(false);
    }
  };

  if (upgraded) return null;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3.5 sm:px-5">
      <div className="flex items-start gap-3 min-w-0">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary">
          <Sparkles className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">New Curriculum Available!</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            New chapters have been published for this course. Your completed chapters remain saved.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleUpgrade}
        disabled={upgrading}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
      >
        {upgrading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Updating...
          </>
        ) : (
          <>
            Upgrade Curriculum
            <ArrowRight className="size-4" />
          </>
        )}
      </button>
    </div>
  );
}
