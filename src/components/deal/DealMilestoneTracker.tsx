"use client";

import {
  CUSTOMER_MILESTONES,
  getStageMeta,
  type WorkflowStage,
} from "@/lib/workflow/milestones";

interface Props {
  currentStage: WorkflowStage;
  stageNote?: string | null;
}

type MilestoneState = "completed" | "current" | "upcoming";

export function DealMilestoneTracker({ currentStage, stageNote }: Props) {
  const currentMeta = getStageMeta(currentStage);

  if (!currentMeta.customerLabel) return null;

  const currentStageNum = currentMeta.stageNumber;

  const milestones = CUSTOMER_MILESTONES.map((m) => {
    const milestoneStageNums = m.stages.map(
      (s) => getStageMeta(s).stageNumber,
    );
    const minNum = Math.min(...milestoneStageNums);
    const maxNum = Math.max(...milestoneStageNums);
    const isCurrent = m.stages.includes(currentStage);

    let state: MilestoneState;
    if (isCurrent) {
      state = "current";
    } else if (maxNum < currentStageNum) {
      state = "completed";
    } else {
      state = "upcoming";
    }

    return { label: m.label, state, minNum };
  });

  const hasVisible = milestones.some(
    (m) => m.state === "current" || m.state === "completed",
  );
  if (!hasVisible) return null;

  return (
    <section className="rounded-lg border overflow-hidden">
      <div className="bg-muted/40 px-4 py-2 text-sm font-medium border-b">
        Progress
      </div>
      <div className="p-4 space-y-3">
        <ol className="space-y-2">
          {milestones.map((m) => (
            <li
              key={m.label}
              className={`flex items-start gap-2.5 text-sm ${
                m.state === "upcoming" ? "opacity-40" : ""
              }`}
            >
              <span
                className={`mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  m.state === "completed"
                    ? "bg-emerald-500 text-white"
                    : m.state === "current"
                      ? "bg-blue-600 text-white ring-2 ring-blue-200"
                      : "border-2 border-muted-foreground/30 bg-transparent"
                }`}
              >
                {m.state === "completed" ? "✓" : m.state === "current" ? "●" : ""}
              </span>
              <span
                className={
                  m.state === "current" ? "font-medium text-blue-700" : ""
                }
              >
                {m.label}
                {m.state === "current" && stageNote && (
                  <span className="block text-xs text-muted-foreground mt-0.5 font-normal">
                    {stageNote}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>

        <p className="text-xs text-muted-foreground border-t pt-3">
          This is an exploratory summary and does not represent a commitment or contract.
        </p>
      </div>
    </section>
  );
}
