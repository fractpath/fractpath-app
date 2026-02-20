import type { Anchor } from "../editing/fieldMeta.js";
export type KioskSelectProps = {
    value: number;
    anchors: [Anchor, Anchor, Anchor, Anchor];
    unit: "currency" | "percent" | "number" | "months" | "years";
    onSelectAnchor: (value: number) => void;
    customValue: string;
    onChangeCustom: (value: string) => void;
    onBlurCustom: () => void;
    disabled?: boolean;
    error?: string;
};
export declare function KioskSelect({ value, anchors, unit, onSelectAnchor, customValue, onChangeCustom, onBlurCustom, disabled, error, }: KioskSelectProps): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=KioskSelect.d.ts.map