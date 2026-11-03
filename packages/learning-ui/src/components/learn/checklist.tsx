"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "../../lib/utils";
import { Check, CheckCircle2, ListChecks } from "lucide-react";
import { fireMiniConfetti } from "./mini-confetti";

function Checkbox(props: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground",
        props.className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="grid place-content-center text-current [&>svg]:size-3.5">
        <Check className="size-3" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export type ChecklistItemData = {
  id: string;
  label: string;
  defaultChecked?: boolean;
};

type ChecklistContextValue = {
  initialChecks: Record<string, boolean>;
  onToggle?: (itemId: string, checked: boolean) => void | Promise<void>;
};

const ChecklistContext = createContext<ChecklistContextValue | null>(null);

export function ChecklistProvider({
  initialChecks,
  onToggle,
  children,
}: {
  initialChecks: Record<string, boolean>;
  onToggle?: (itemId: string, checked: boolean) => void | Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <ChecklistContext.Provider value={{ initialChecks, onToggle }}>
      {children}
    </ChecklistContext.Provider>
  );
}

function parseLabel(label: string) {
  const parts = label.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && !part.startsWith("**")) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={index}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function ChecklistItemRow({
  item,
  checked,
  onToggle,
}: {
  item: ChecklistItemData;
  checked: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <li>
      <label
        className={cn(
          "group flex cursor-pointer items-start gap-3.5 rounded-xl px-3 py-3.5 transition-colors",
          "hover:bg-muted/60",
          checked && "bg-ok-soft hover:bg-ok-soft"
        )}
      >
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onToggle(value === true)}
          className={cn(
            "mt-0.5 size-5 rounded-md border-2",
            checked && "border-ok bg-ok"
          )}
          aria-label={item.label.replace(/\*\*/g, "")}
        />
        <span
          className={cn(
            "min-w-0 flex-1 text-[15px] leading-relaxed text-foreground",
            checked && "text-muted-foreground line-through decoration-muted-foreground/80"
          )}
        >
          {parseLabel(item.label)}
        </span>
        {checked ? (
          <CheckCircle2
            className="mt-0.5 size-4 shrink-0 text-ok opacity-100 transition-opacity"
            aria-hidden
          />
        ) : (
          <span className="mt-0.5 size-4 shrink-0" aria-hidden />
        )}
      </label>
    </li>
  );
}

/** Shared card styling — gate and section checklists use the same look (see 2.16 verify). */
const CARD_STYLES = {
  border: "border-border",
  headerBg: "bg-muted/50",
  headerText: "text-foreground",
  subText: "text-muted-foreground",
  iconBg: "bg-primary/15",
  bodyBg: "bg-card",
  progress: "bg-muted",
  progressFill: "bg-ok",
  badge: "bg-muted text-muted-foreground",
} as const;

export function Checklist({
  items,
  section,
  variant = "inline",
  isGate = false,
  initialChecks: initialChecksProp,
  onToggle: onToggleProp,
}: {
  items?: Array<ChecklistItemData | string>;
  section?: string;
  variant?: "gate" | "section" | "inline";
  isGate?: boolean;
  initialChecks?: Record<string, boolean>;
  onToggle?: (itemId: string, checked: boolean) => void | Promise<void>;
}) {
  const ctx = useContext(ChecklistContext);
  const initialChecks = initialChecksProp ?? ctx?.initialChecks ?? {};
  const cardRef = useRef<HTMLDivElement>(null);
  const confettiFiredRef = useRef(false);

  const normalizedItems = useMemo<ChecklistItemData[]>(() => {
    if (!Array.isArray(items)) return [];
    return items.map((item, index) => {
      if (typeof item === "string") {
        return { id: `item-${index}`, label: item };
      }
      return {
        id: item?.id || `item-${index}`,
        label: item?.label || "",
        defaultChecked: item?.defaultChecked,
      };
    });
  }, [items]);

  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const item of normalizedItems) {
      initial[item.id] = initialChecks[item.id] ?? item.defaultChecked ?? false;
    }
    return initial;
  });

  const toggle = useCallback(
    (id: string, next: boolean) => {
      const previous = checkedMap[id] ?? false;
      const nextMap = { ...checkedMap, [id]: next };
      setCheckedMap(nextMap);
      void Promise.resolve((onToggleProp ?? ctx?.onToggle)?.(id, next))
        .then(() => {
          const finished = normalizedItems.length > 0 && normalizedItems.every((item) => nextMap[item.id]);
          if (finished) window.dispatchEvent(new CustomEvent("buildment:reflection-complete"));
        })
        .catch(() => {
          setCheckedMap((prev) => ({ ...prev, [id]: previous }));
        });
    },
    [checkedMap, ctx, normalizedItems, onToggleProp]
  );

  const checkedCount = useMemo(
    () => normalizedItems.filter((item) => checkedMap[item.id]).length,
    [normalizedItems, checkedMap]
  );
  const total = normalizedItems.length;
  const progress = total > 0 ? (checkedCount / total) * 100 : 0;
  const allDone = total > 0 && checkedCount === total;

  useEffect(() => {
    if (!allDone || confettiFiredRef.current || !cardRef.current) return;
    confettiFiredRef.current = true;
    fireMiniConfetti(cardRef.current);
  }, [allDone]);

  // Legacy `variant="gate"` from older compiles maps to the same card as section/inline.
  const showSectionTitle = Boolean(section) || variant === "section";
  const gateMode = isGate || variant === "gate";

  const headerTitle = showSectionTitle
    ? section ?? (gateMode ? "Show what you can do" : "Checklist")
    : section ?? "Checklist";

  const label = gateMode ? "Ready to show" : "Checklist";

  return (
    <div
      ref={cardRef}
      className={cn(
        "not-prose my-8 overflow-hidden rounded-2xl border ",
        CARD_STYLES.border,
        CARD_STYLES.bodyBg
      )}
      data-checklist
      data-checklist-variant={gateMode ? "gate" : variant}
    >
      <div className={cn("border-b border-border px-5 py-4", CARD_STYLES.headerBg)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl",
                CARD_STYLES.iconBg
              )}
            >
              <ListChecks className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {label}
              </p>
              <p className={cn("mt-0.5 text-base font-semibold leading-snug", CARD_STYLES.headerText)}>
                {headerTitle}
              </p>
              {gateMode ? (
                <p className={cn("mt-1 text-sm", CARD_STYLES.subText)}>
                  Tick an item only when you can show it working or explain it in your own words.
                </p>
              ) : null}
            </div>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums",
              CARD_STYLES.badge
            )}
          >
            {checkedCount}/{total}
          </span>
        </div>

        <div className={cn("mt-4 h-1.5 overflow-hidden rounded-full", CARD_STYLES.progress)}>
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300 ease-out",
              CARD_STYLES.progressFill
            )}
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={checkedCount}
            aria-valuemin={0}
            aria-valuemax={total}
          />
        </div>
      </div>

      <ul className="space-y-0.5 p-2 sm:p-3">
        {normalizedItems.map((item) => (
          <ChecklistItemRow
            key={item.id}
            item={item}
            checked={Boolean(checkedMap[item.id])}
            onToggle={(next) => toggle(item.id, next)}
          />
        ))}
      </ul>

      {allDone ? (
        <div className="border-t border-ok bg-ok-soft px-5 py-3.5">
          <p className="flex items-center gap-2 text-sm font-medium text-ok">
            <CheckCircle2 className="size-4 shrink-0 text-ok" aria-hidden />
            All items complete — nice work!
          </p>
        </div>
      ) : null}
    </div>
  );
}
