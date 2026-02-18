import type { FractPathCalculatorWidgetProps } from "./types.js";
import { WiredCalculatorWidget } from "./wired.js";

export function FractPathCalculatorWidget(props: FractPathCalculatorWidgetProps) {
  return <WiredCalculatorWidget {...props} />;
}
