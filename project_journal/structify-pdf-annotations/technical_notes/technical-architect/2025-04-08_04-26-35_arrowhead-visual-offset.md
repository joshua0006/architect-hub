---
Timestamp: 2025-04-08 04:26:35 UTC
Mode: technical-architect
Event: DESIGN
---

**Context:** Arrowhead rendering in `src/utils/drawingUtils.ts` (`drawArrow` function).

**Details:**
Reintroduced a small forward offset for the arrowhead tip position. Instead of the tip being exactly at the line's endpoint, it's now pushed slightly forward along the line's direction vector. The offset distance is calculated as half the scaled line width (`(style.lineWidth * scale) * 0.5`).

**Rationale:**
The previous implementation placed the arrowhead tip precisely at the line endpoint. While geometrically correct, this caused the visual base of the arrowhead to appear slightly behind the line's end, making the line look like it extended past the arrowhead. This change adjusts the position for better visual alignment, ensuring the arrowhead base appears closer to the intended endpoint of the line segment. This applies to both single and double arrows.

**Alternatives Considered:**
- Keeping the tip exactly at the endpoint (previous state): Rejected due to visual misalignment reported by the user.
- Adjusting the line endpoint itself: Rejected as it would shorten the actual line segment, which might not be desired. Offsetting only the arrowhead rendering maintains the line's true length.

**Next Steps:**
- Code changes applied by `code` mode.
- Monitor visual results after the change is applied.