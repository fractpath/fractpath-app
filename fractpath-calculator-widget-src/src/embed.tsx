import { createRoot, type Root } from "react-dom/client";
import type { CalculatorMode, CalculatorPersona, FullDealSnapshotV1 } from "./widget/types.js";
import { WiredCalculatorWidget } from "./widget/wired.js";

export type MountFractpathWidgetArgs = {
  el: HTMLElement;
  persona: CalculatorPersona;
  mode: CalculatorMode;
  snapshot?: FullDealSnapshotV1;
  onSave?: (snapshot: FullDealSnapshotV1) => void;
};

let root: Root | null = null;

export function mountFractpathWidget(args: MountFractpathWidgetArgs) {
  const { el, persona, mode, snapshot, onSave } = args;
  if (!el) return;

  if (!root) root = createRoot(el);

  root.render(
    <WiredCalculatorWidget
      persona={persona}
      mode={mode}
      initialSnapshot={snapshot}
      onSave={(payload) => {
        const snap = payload as FullDealSnapshotV1;
        onSave?.(snap);
        const w = window as any;
        if (typeof w.__fractpath_saveSnapshot === "function") {
          w.__fractpath_saveSnapshot(snap);
        }
      }}
    />
  );
}
