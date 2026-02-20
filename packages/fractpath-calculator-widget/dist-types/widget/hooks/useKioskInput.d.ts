export type UseKioskInputOptions = {
    value: number;
    anchors: Array<{
        label: string;
        value: number;
    }>;
    onCommit: (value: number) => void;
    parseRaw?: (raw: string) => number;
};
export declare function useKioskInput({ value, anchors, onCommit, parseRaw }: UseKioskInputOptions): {
    isAnchorMatch: boolean;
    displayCustom: string;
    selectAnchor: (anchorValue: number) => void;
    focusCustom: () => void;
    changeCustom: (raw: string) => void;
    blurCustom: () => void;
};
//# sourceMappingURL=useKioskInput.d.ts.map