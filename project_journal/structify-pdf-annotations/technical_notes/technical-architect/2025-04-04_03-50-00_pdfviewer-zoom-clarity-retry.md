---
Timestamp: 2025-04-04 03:50:00 UTC
Mode: technical-architect
Event: DESIGN_UPDATE
---

**Context:** Persistent user feedback regarding pixelated text and lines in `src/components/PDFViewer.tsx` when zooming in, despite previous rendering optimizations (stable zoom mechanics, initial load fix, devicePixelRatio handling, print intent).

**Details:**
Reverting to more aggressive `qualityMultiplier` values in an attempt to improve rendering resolution at high zoom levels. The standard configurations and previous attempts did not sufficiently address the clarity issue.

**Proposed Adjustment:**
- Modify the `qualityMultiplier` calculation in `renderPdfPage` to use higher tiers:
  - `scale > 1.0`: multiplier `1.5`
  - `scale > 1.5`: multiplier `2.0`
  - `scale > 2.5`: multiplier `2.5`

**Rationale:**
This directly increases the resolution of the intermediate canvas rendering, which is the most likely factor influencing perceived pixelation within the rendering pipeline itself. This is combined with existing `devicePixelRatio` handling.

**Risks:**
- Increased memory consumption due to larger canvas buffer sizes.
- Potential performance degradation during rendering, especially on less powerful devices.

**Next Steps:**
- Code change delegated to `code` mode (Task already created).
- User to test zoom clarity again after the change.
- If pixelation persists, further investigation might need to focus on CSS interference, specific PDF font issues, or browser rendering limitations.

---