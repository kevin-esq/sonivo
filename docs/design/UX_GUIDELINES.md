# Sonivo UX guidelines

These guidelines apply when researching, prototyping, or changing Sonivo interfaces. Product behavior and accepted architecture remain defined by `CONTEXT.md`, product/domain docs, and accepted ADRs.

## Experience principles

- Make common tasks recognizable without requiring musical or computer knowledge. Prefer concrete labels used by the people doing the task; explain a necessary musical term where it first matters.
- Give each screen one clear next action. Keep related information together and preserve a predictable way back.
- Use progressive disclosure for optional or advanced controls. Keep them available, name the entry point plainly, and preserve entered values when sections open or close.
- Prefer recognition over memory: show the current selection, meaningful defaults, and consequences before a decision.
- Prevent avoidable mistakes and make recovery visible. Errors say what happened, what the person can do next, and whether their work is safe.
- Match confirmation effort to risk and reversibility. Explain destructive scope; do not interrupt routine reversible actions.
- Reuse established Sonivo patterns before creating new interaction models. Familiarity should come from consistency and clear language, not imitation of another product.

## Interaction and content

- Use one primary action per task surface, with secondary actions visually quieter and destructive actions separated by context and impact.
- Use a page for sustained or multi-step work, a dialog for a short focused decision, a popover for a small anchored choice, and a menu for infrequent actions. Do not nest dialogs.
- Preserve a user's work on validation errors, network failures, cancel, and return whenever the product contract allows it.
- Use direct, brief copy. Define unfamiliar music terms in context; avoid unexplained abbreviations and backend terminology.
- Distinguish loading, empty, error, success, disabled, and permission states. Do not communicate state by color alone.

## Accessibility and responsive behavior

- Target WCAG 2.2 AA. Provide semantic names, labels, instructions, error associations, and status announcements.
- Keep all actions operable by keyboard, show visible focus, maintain logical focus order, and restore focus when an overlay closes.
- Preserve usable touch targets (prefer 44 by 44 CSS pixels), reflow content at narrow widths, and do not rely on hover.
- Honor reduced-motion preferences. Check contrast in both Sonivo themes and group brand accents.
- Validate representative desktop and mobile widths with keyboard and assistive-technology checks for changed interactions.

## Evidence discipline

During research and review, label statements **Observed**, **Inferred**, or **Proposed**. Cite the route, reproducible steps, test, or source file behind each material finding. Do not describe a proposal as shipped or verified.
