---
Timestamp: 2025-04-08 01:52:19 UTC
Mode: technical-architect
Event: DESIGN
---

**Context:** Improving arrow annotation rendering in `src/utils/drawingUtils.ts`.

**Details:**
User feedback indicated that while arrow line thickness scales correctly with `style.lineWidth`, the arrowhead size remains fixed. This creates a visual mismatch, especially with thicker lines.

The plan is to modify the `drawArrow` function in `src/utils/drawingUtils.ts` to calculate arrowhead dimensions (length and width/angle) based on the provided `style.lineWidth`. This will ensure the arrowhead scales proportionally with the line.

**Action:**
Delegating the implementation of this modification to the `code` mode via `new_task` because the `technical-architect` mode cannot edit `.ts` files. The `code` mode will be instructed to:
1. Read `src/utils/drawingUtils.ts` to understand the current `drawArrow` implementation.
2. Modify the arrowhead drawing logic within `drawArrow` to scale based on `style.lineWidth`. A scaling factor (e.g., `baseSize * (1 + (lineWidth - 1) * 0.5)`) should be applied to the arrowhead dimensions.
3. Ensure the changes handle both single and double arrows correctly.

**Rationale:**
This change will improve the visual consistency and quality of arrow annotations at different line thicknesses. Delegation is necessary due to mode permissions.