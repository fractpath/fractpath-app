import type { FieldKey } from "./fieldMeta.js";
export type TabKey = "payments" | "ownership" | "assumptions" | "protections" | "fees";
export type TabSection = {
    label: string;
    fieldKeys: FieldKey[];
};
export type TabConfig = {
    key: TabKey;
    label: string;
    sections: TabSection[];
};
export declare const TAB_CONFIG: TabConfig[];
//# sourceMappingURL=tabConfig.d.ts.map