TICKET WGT-020 — Share mode (ungated)

Objective
Support mode="share" where outputs are visible immediately and email gating is disabled.

Deliverables
- Widget prop: mode: "default" | "share"
- Share badge + note (or events so wrapper can render)
- CTA to app signup includes persona param

Acceptance Criteria
- No blur, no email input, no lead submission in share mode
- Emits share_mode_viewed event with persona
