import type { DraftCanonicalInputs, FieldErrors, PreviewState } from "../editing/types.js";
import type { CalculatorPersona } from "../types.js";
type DraftPath = `deal_terms.${string & keyof DraftCanonicalInputs["deal_terms"]}` | `scenario.${string & keyof DraftCanonicalInputs["scenario"]}`;
type DealEditModalProps = {
    draft: DraftCanonicalInputs;
    errors: FieldErrors;
    preview: PreviewState;
    persona: CalculatorPersona;
    permissions?: {
        canEdit?: boolean;
    };
    setField: (path: DraftPath, value: unknown) => void;
    onBlurCompute: () => void;
    onSave: (draft: DraftCanonicalInputs) => void;
    onClose: () => void;
};
export declare function DealEditModal({ draft, errors, preview, persona, permissions, setField, onBlurCompute, onSave, onClose, }: DealEditModalProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=DealEditModal.d.ts.map