import { Annotation, Point, StampType, AnnotationStyle } from "../types/annotation";

// Helper function to validate points
export const isValidPoint = (point: Point | undefined): point is Point => {
  return (
    point !== undefined &&
    typeof point.x === "number" &&
    typeof point.y === "number" &&
    !isNaN(point.x) &&
    !isNaN(point.y)
  );
};

// Drawing functions
export const drawCircle = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  diameterMode: boolean = false,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  if (!isValidPoint(start) || !isValidPoint(end)) return;

  let centerX, centerY, radius;

  if (diameterMode) {
    // In diameter mode, center is midpoint between two points
    centerX = (start.x + end.x) / 2 * scale;
    centerY = (start.y + end.y) / 2 * scale;
    // Calculate radius as half the distance between points
    radius = Math.sqrt(
      Math.pow((end.x - start.x) * scale, 2) + Math.pow((end.y - start.y) * scale, 2)
    ) / 2;
  } else {
    // In center-radius mode, first point is center
    centerX = start.x * scale;
    centerY = start.y * scale;
    // Calculate radius as the distance between points
    radius = Math.sqrt(
      Math.pow((end.x - start.x) * scale, 2) + Math.pow((end.y - start.y) * scale, 2)
    );
  }

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.stroke();
};

export const drawLine = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  style: AnnotationStyle,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  if (!isValidPoint(start) || !isValidPoint(end)) return;
// Apply style
ctx.lineWidth = style.lineWidth * scale;
ctx.strokeStyle = style.color;
ctx.globalAlpha = style.opacity;

ctx.beginPath();
  ctx.beginPath();
  ctx.moveTo(start.x * scale, start.y * scale);
  ctx.lineTo(end.x * scale, end.y * scale);
  ctx.stroke();
};

export const drawRectangle = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  if (!isValidPoint(start) || !isValidPoint(end)) return;

  const width = (end.x - start.x) * scale;
  const height = (end.y - start.y) * scale;

  // Draw the rectangle
  ctx.beginPath();
  ctx.rect(start.x * scale, start.y * scale, width, height);
  ctx.stroke();
};

export const drawTriangle = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  if (!isValidPoint(start) || !isValidPoint(end)) return;

  // Calculate center-based triangle
  const centerX = (start.x + end.x) / 2;
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  ctx.beginPath();
  // Top point
  ctx.moveTo(centerX * scale, start.y * scale);
  // Bottom left
  ctx.lineTo((centerX - width / 2) * scale, (start.y + height) * scale);
  // Bottom right
  ctx.lineTo((centerX + width / 2) * scale, (start.y + height) * scale);
  ctx.closePath();
  ctx.stroke();
};

export const drawStar = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  if (!isValidPoint(start) || !isValidPoint(end)) return;

  const centerX = (start.x + end.x) / 2;
  const centerY = (start.y + end.y) / 2;
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  const outerRadius = Math.min(width, height) / 2;
  const innerRadius = outerRadius * 0.4;
  const spikes = 5;
  const angleOffset = -Math.PI / 2; // Start from top

  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (i * Math.PI) / spikes + angleOffset;
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;

    if (i === 0) {
      ctx.moveTo(x * scale, y * scale);
    } else {
      ctx.lineTo(x * scale, y * scale);
    }
  }
  ctx.closePath();
  ctx.stroke();
};

export const drawNoSymbol = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  if (!isValidPoint(start) || !isValidPoint(end)) return;

  // Calculate circle parameters
  const width = Math.abs((end.x - start.x) * scale);
  const height = Math.abs((end.y - start.y) * scale);
  const centerX = start.x * scale + width / 2;
  const centerY = start.y * scale + height / 2;
  const radius = Math.min(width, height) / 2;

  // Draw the circle
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.stroke();

  // Draw the diagonal line
  ctx.beginPath();
  const lineOffset = radius * Math.cos(Math.PI / 4);
  ctx.moveTo(centerX - lineOffset, centerY - lineOffset);
  ctx.lineTo(centerX + lineOffset, centerY + lineOffset);
  ctx.stroke();
};

// Add helper function for drawing arrow heads
export const drawArrowHead = (
  ctx: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  scale: number,
  isReversed: boolean = false
) => {
  const headLength = 15 * scale;
  const angle = Math.atan2((to.y - from.y) * scale, (to.x - from.x) * scale);

  const x = isReversed ? from.x * scale : to.x * scale;
  const y = isReversed ? from.y * scale : to.y * scale;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(
    x - headLength * Math.cos(angle - Math.PI / 6),
    y - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(x, y);
  ctx.lineTo(
    x - headLength * Math.cos(angle + Math.PI / 6),
    y - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
};

// Add arrow drawing function
export const drawArrow = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  isDoubleArrow: boolean = false,
  style: AnnotationStyle,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  // ctx.save(); // Removed to inherit context settings like lineWidth
  ctx.lineCap = "butt"; // Use butt cap to prevent line extending beyond shortened points
  ctx.lineJoin = "round";

  // Apply style
  ctx.lineWidth = style.lineWidth * scale;
  ctx.strokeStyle = style.color;
  ctx.fillStyle = style.color; // For arrowheads
  ctx.globalAlpha = style.opacity;

  // Helper function to draw a single arrowhead shape
  const drawSingleArrowhead = (
    ctx: CanvasRenderingContext2D,
    tipX: number,
    tipY: number,
    basePoint1X: number,
    basePoint1Y: number,
    basePoint2X: number,
    basePoint2Y: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(basePoint1X, basePoint1Y);
    ctx.lineTo(basePoint2X, basePoint2Y);
    ctx.closePath();
    ctx.fill();
  };

  // Calculate direction vector and length
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  let ux = 0;
  let uy = 0;
  if (len > 0) {
    ux = dx / len;
    uy = dy / len;
  }

  // Calculate arrowhead parameters
  // const angle = Math.atan2(dy, dx); // Angle not directly needed for vector approach
  const baseHeadLength = 8; // Base size before scaling by line width
  const effectiveLineWidth = Math.max(1, style.lineWidth || 1);
  const lineWidthScaleFactor = 1 + (effectiveLineWidth - 1) * 0.5; // Scale factor based on line width
  const scaledHeadLength = baseHeadLength * lineWidthScaleFactor * scale; // Final head length including canvas scale
  const halfBaseWidth = scaledHeadLength * Math.sin(Math.PI / 6); // Half the width of the arrowhead base (using 30 deg angle)
  
  // Calculate shortening distance including half line width
  const shorteningDistance = scaledHeadLength + (style.lineWidth * scale * 0.5);
  
  // Calculate shortened line endpoints using the calculated distance
  const shortenedEndX = end.x * scale - ux * shorteningDistance;
  const shortenedEndY = end.y * scale - uy * shorteningDistance;
  let shortenedStartX = start.x * scale; // Initialize for potential double arrow use
  let shortenedStartY = start.y * scale; // Initialize for potential double arrow use
  let startDrawX = start.x * scale;
  let startDrawY = start.y * scale;

  // Adjust start point for double arrows using the calculated distance, ensuring line is long enough
  if (isDoubleArrow && len > shorteningDistance * 2) {
    // Update the pre-declared variables
    shortenedStartX = start.x * scale + ux * shorteningDistance;
    shortenedStartY = start.y * scale + uy * shorteningDistance;
    startDrawX = shortenedStartX;
    startDrawY = shortenedStartY;
  // If line is shorter than the shortening distance, don't draw line (make start/end same)
  // If line is shorter than the shortening distance(s), don't draw line (make start/end same)
  } else if (len <= shorteningDistance || (isDoubleArrow && len <= shorteningDistance * 2)) {
      startDrawX = shortenedEndX; // Effectively makes line zero length
      startDrawY = shortenedEndY;
  }


  // Draw the main line (potentially shortened)
  // Only draw line if it's longer than the shortening distance(s) needed
  if (len > shorteningDistance || (isDoubleArrow && len > shorteningDistance * 2)) {
    ctx.beginPath();
    ctx.moveTo(startDrawX, startDrawY);
    ctx.lineTo(shortenedEndX, shortenedEndY);
    ctx.stroke();
  }

  // --- Draw Arrowhead at End ---
  // Only draw if the line has length (or is just an arrowhead)
  if (len > 0) {
      // Calculate tip relative to the shortened end point, extending outwards
      const endTipX = shortenedEndX + ux * scaledHeadLength;
      const endTipY = shortenedEndY + uy * scaledHeadLength;

      // Calculate base points relative to the shortened end point
      const endBasePoint1X = shortenedEndX - uy * halfBaseWidth;
      const endBasePoint1Y = shortenedEndY + ux * halfBaseWidth;
      const endBasePoint2X = shortenedEndX + uy * halfBaseWidth;
      const endBasePoint2Y = shortenedEndY - ux * halfBaseWidth;

      drawSingleArrowhead(
        ctx,
        endTipX,
        endTipY,
        endBasePoint1X,
        endBasePoint1Y,
        endBasePoint2X,
        endBasePoint2Y
      );
  }


  // --- Draw Arrowhead at Start (if double arrow) ---
  // Only draw if double arrow and line has length (and shortening occurred)
  if (isDoubleArrow && len > scaledHeadLength * 2) {
    // Calculate tip relative to the shortened start point, extending outwards
    const startTipX = shortenedStartX - ux * scaledHeadLength;
    const startTipY = shortenedStartY - uy * scaledHeadLength;

    // Calculate base points relative to the shortened start point
    const startBasePoint1X = shortenedStartX - uy * halfBaseWidth;
    const startBasePoint1Y = shortenedStartY + ux * halfBaseWidth;
    const startBasePoint2X = shortenedStartX + uy * halfBaseWidth;
    const startBasePoint2Y = shortenedStartY - ux * halfBaseWidth;

    drawSingleArrowhead(
      ctx,
      startTipX,
      startTipY,
      startBasePoint1X,
      startBasePoint1Y,
      startBasePoint2X,
      startBasePoint2Y
    );
  }

  // ctx.restore(); // Removed as save() was removed
};

// Add tick (checkmark) drawing function
export const drawTick = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  if (!isValidPoint(start) || !isValidPoint(end)) return;

  const width = Math.abs((end.x - start.x) * scale);
  const height = Math.abs((end.y - start.y) * scale);
  const size = Math.min(width, height);

  // Calculate points for the tick
  const x = start.x * scale;
  const y = start.y * scale + size / 2;

  ctx.beginPath();
  ctx.moveTo(x, y);
  // First line (short)
  ctx.lineTo(x + size * 0.3, y + size * 0.3);
  // Second line (long)
  ctx.lineTo(x + size, y - size * 0.5);
  ctx.stroke();
};

// Add cross (X) drawing function
export const drawCross = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  if (!isValidPoint(start) || !isValidPoint(end)) return;

  const width = Math.abs((end.x - start.x) * scale);
  const height = Math.abs((end.y - start.y) * scale);
  const size = Math.min(width, height);

  const x = start.x * scale;
  const y = start.y * scale;

  // Draw first diagonal line (\)
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + size, y + size);
  ctx.stroke();

  // Draw second diagonal line (/)
  ctx.beginPath();
  ctx.moveTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.stroke();
};

// Update text drawing function
export const drawText = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  style: AnnotationStyle,
  scale: number,
  isForExport: boolean = false
) => {
  if (!points || !points.length || !style.text) return;
  
  const position = points[0];
  const { text, textOptions = {} } = style;
  
  const fontSize = (textOptions.fontSize || 14) * scale;
  const fontFamily = textOptions.fontFamily || 'Arial';
  
  // Set font style
  let fontStyle = '';
  if (textOptions.bold) fontStyle += 'bold ';
  if (textOptions.italic) fontStyle += 'italic ';
  
  ctx.font = `${fontStyle}${fontSize}px ${fontFamily}`;
  ctx.fillStyle = style.color;
  ctx.globalAlpha = style.opacity;
  
  // Split text by newlines and draw each line
  const lines = text.split('\n');
  const lineHeight = fontSize * 1.2;
  
  lines.forEach((line, i) => {
    ctx.fillText(line, position.x * scale, (position.y + i * lineHeight / scale) * scale);
  });
  
  // Add underline if needed
  if (textOptions.underline) {
    ctx.beginPath();
    lines.forEach((line, i) => {
      const metrics = ctx.measureText(line);
      const y = (position.y + i * lineHeight / scale) * scale + 3;
      ctx.moveTo(position.x * scale, y);
      ctx.lineTo(position.x * scale + metrics.width, y);
    });
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
};

// Update sticky note drawing function
export const drawStickyNote = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  style: AnnotationStyle,
  scale: number,
  isForExport: boolean = false
) => {
  if (!points || !points.length) return;
  
  const position = points[0];
  const { text = '', textOptions = {} } = style;
  
  // Define sticky note dimensions
  const width = 200 * scale;
  const height = 150 * scale;
  const cornerSize = 20 * scale;
  
  // Draw the note background
  ctx.save();
  
  // Fixed style for sticky notes - ignore user style
  const noteColor = '#FFD700'; // Always yellow
  
  ctx.fillStyle = noteColor;
  ctx.globalAlpha = 1.0; // Fixed opacity
  
  // Shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 5 * scale;
  ctx.shadowOffsetX = 2 * scale;
  ctx.shadowOffsetY = 2 * scale;
  
  // Main rectangle
  ctx.beginPath();
  ctx.moveTo(position.x * scale, position.y * scale);
  ctx.lineTo(position.x * scale + width - cornerSize, position.y * scale);
  ctx.lineTo(position.x * scale + width, position.y * scale + cornerSize);
  ctx.lineTo(position.x * scale + width, position.y * scale + height);
  ctx.lineTo(position.x * scale, position.y * scale + height);
  ctx.closePath();
  ctx.fill();
  
  // Draw the folded corner
  ctx.beginPath();
  ctx.moveTo(position.x * scale + width - cornerSize, position.y * scale);
  ctx.lineTo(position.x * scale + width - cornerSize, position.y * scale + cornerSize);
  ctx.lineTo(position.x * scale + width, position.y * scale + cornerSize);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.fill();
  
  // Reset shadow for text
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  // Draw the text
  if (text) {
    // Fixed font style for sticky notes
    const fontSize = 14 * scale; // Fixed font size
    const fontFamily = 'Arial';  // Fixed font family
    
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = '#000000'; // Black text on sticky note
    ctx.globalAlpha = 1.0;
    
    // Calculate text area with padding
    const padding = 10 * scale;
    const textX = position.x * scale + padding;
    const textY = position.y * scale + padding + fontSize * 0.8; // Adjust for baseline
    
    // Split text by newlines and draw each line
    const lines = text.split('\n');
    const lineHeight = fontSize * 1.2;
    
    lines.forEach((line, i) => {
      const maxWidth = width - 2 * padding;
      ctx.fillText(line, textX, textY + i * lineHeight, maxWidth);
    });
  }
  
  ctx.restore();
};

// Add helper function for text positioning
export const getTextPosition = (point: Point, scale: number) => {
  return {
    x: point.x * scale,
    y: point.y * scale,
  };
};

// Note: The primary AnnotationStyle type is imported from "../types/annotation"
// This local definition is removed to avoid conflicts and ensure the imported type is used.

// Add highlight drawing function
export const drawHighlight = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  style: AnnotationStyle,
  scale: number,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;

  // Save context state
  ctx.save();

  // Set highlight specific styles - cap opacity at 0.7
  let cappedOpacity = Math.min(style.opacity || 0.3, 0.7);
  
  // For exports, ensure opacity is within a good visible range for PDFs
  if (isForExport) {
    // Slightly boost opacity for exports to ensure visibility
    cappedOpacity = Math.min(Math.max(cappedOpacity, 0.4), 0.7);
  }
  
  ctx.globalAlpha = cappedOpacity;
  ctx.fillStyle = style.color || "#FFFF00"; // Use style color or default to yellow
  ctx.strokeStyle = style.color || "#FFFF00"; // Add a stroke in the same color
  ctx.lineWidth = (isForExport ? 1.5 : 1) * scale;
  
  // No need for line dash in highlight
  ctx.setLineDash([]);

  // For highlight we use the current points to create a rectangle or path
  const [start, ...rest] = points;

  if (points.length === 2) {
    // Simple case with two points - draw a rectangle
    const end = points[1];

    // Get the dimensions - make sure coordinates are scaled correctly
    const x = Math.min(start.x, end.x) * scale;
    const y = Math.min(start.y, end.y) * scale;
    const width = Math.abs(end.x - start.x) * scale;
    const height = Math.abs(end.y - start.y) * scale;

    // For exports, slightly enhance dimensions to fix rounding issues
    if (isForExport) {
      ctx.fillRect(x, y, Math.max(width, 1), Math.max(height, 1));
      // Add a subtle border to ensure visibility
      ctx.strokeRect(x, y, Math.max(width, 1), Math.max(height, 1));
    } else {
      ctx.fillRect(x, y, width, height);
    }
  } else if (points.length > 2) {
    // More complex path for freeform highlight
    ctx.beginPath();
    ctx.moveTo(start.x * scale, start.y * scale);

    // Draw path through all points
    rest.forEach(point => {
      ctx.lineTo(point.x * scale, point.y * scale);
    });

    // For exports, ensure stroke is visible
    if (isForExport) {
      ctx.lineWidth = 1.5 * scale;
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.restore();
};

// Add new function for smooth freehand drawing
export const drawSmoothFreehand = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  style: AnnotationStyle,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;

  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.lineWidth * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = style.opacity;

  // Apply scaling to all points first
  const scaledPoints = points.map((p) => ({
    x: p.x * scale,
    y: p.y * scale,
  }));

  ctx.beginPath();
  ctx.moveTo(scaledPoints[0].x, scaledPoints[0].y);

  // Use cubic Bezier curves with tension for smooth drawing
  const tension = 0.5; // Adjust this value (0-1) for different smoothness
  let previousControlPoint: Point | null = null;

  for (let i = 0; i < scaledPoints.length - 1; i++) {
    const current = scaledPoints[i];
    const next = scaledPoints[i + 1];
    const nextNext = scaledPoints[i + 2] || next;

    // Calculate control points using cardinal spline logic
    const cp1 = {
      x: current.x + (next.x - (scaledPoints[i - 1]?.x || current.x)) * tension,
      y: current.y + (next.y - (scaledPoints[i - 1]?.y || current.y)) * tension,
    };

    const cp2 = {
      x: next.x - (nextNext.x - current.x) * tension,
      y: next.y - (nextNext.y - current.y) * tension,
    };

    // Smooth connection between segments
    if (previousControlPoint) {
      ctx.bezierCurveTo(
        previousControlPoint.x,
        previousControlPoint.y,
        cp1.x,
        cp1.y,
        current.x,
        current.y
      );
    }

    ctx.bezierCurveTo(cp1.x, cp1.y, cp2.x, cp2.y, next.x, next.y);

    previousControlPoint = cp2;
  }

  ctx.stroke();
  ctx.restore();
};

// Update drawAnnotation function
export const drawAnnotation = (
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  scale: number,
  isForExport: boolean = false
) => {
  ctx.save();
  ctx.strokeStyle = annotation.style.color;
  ctx.fillStyle = annotation.style.color;
  ctx.lineWidth = annotation.style.lineWidth * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = annotation.style.opacity;

  // For exports, ensure visibility by slightly increasing line width
  if (isForExport) {
    ctx.lineWidth = Math.max(ctx.lineWidth, 1.5 * scale); // Minimum line width for exports
  }

  switch (annotation.type) {
    case "freehand":
      drawSmoothFreehand(ctx, annotation.points, scale, annotation.style, isForExport);
      break;
    case "line":
      drawLine(ctx, annotation.points, scale, annotation.style, isForExport);
      break;
    case "rectangle":
      drawRectangle(ctx, annotation.points, scale, isForExport);
      break;
    case "circle":
      // Support circleDiameterMode from the style property
      const diameterMode = annotation.style.circleDiameterMode as boolean || false;
      // Pass the diameterMode and isForExport to the drawCircle function
      drawCircle(ctx, annotation.points, scale, diameterMode, isForExport);
      break;
    case "arrow":
    case "doubleArrow":
      drawArrow(
        ctx,
        annotation.points,
        scale,
        annotation.type === "doubleArrow",
        annotation.style,
        isForExport
      );
      break;
    case "stamp":
    case "stampApproved":
    case "stampRejected":
    case "stampRevision":
      drawStamp(ctx, annotation.points, annotation.style, scale, isForExport);
      break;
    case "triangle":
      drawTriangle(ctx, annotation.points, scale, isForExport);
      break;
    case "star":
      drawStar(ctx, annotation.points, scale, isForExport);
      break;
    case "noSymbol" as any:
      drawNoSymbol(ctx, annotation.points, scale, isForExport);
      break;
    case "tick" as any:
      drawTick(ctx, annotation.points, scale, isForExport);
      break;
    case "cross" as any:
      drawCross(ctx, annotation.points, scale, isForExport);
      break;
    case "text":
      drawText(ctx, annotation.points, annotation.style, scale, isForExport);
      break;
    case "stickyNote":
      drawStickyNote(ctx, annotation.points, annotation.style, scale, isForExport);
      break;
    case "highlight":
      drawHighlight(ctx, annotation.points, annotation.style, scale, isForExport);
      break;
    case "door":
      drawDoor(ctx, annotation.points, scale, isForExport);
      break;
    case "window":
      drawWindow(ctx, annotation.points, scale, isForExport);
      break;
    case "fireExit":
      drawFireExit(ctx, annotation.points, scale, isForExport);
      break;
    case "stairs":
      drawStairs(ctx, annotation.points, scale, isForExport);
      break;
    case "elevator":
      drawElevator(ctx, annotation.points, scale, isForExport);
      break;
    case "toilet":
      drawToilet(ctx, annotation.points, scale, isForExport);
      break;
    default:
      console.warn("Unsupported annotation type:", annotation.type);
  }

  ctx.restore();
};

// Add function to check if point is inside highlight polygon
export const isPointInHighlight = (
  point: Point,
  annotation: Annotation,
  scale: number = 1
): boolean => {
  if (annotation.type !== "highlight") return false;
  
  const { points } = annotation;
  if (!points || points.length < 2) return false;
  
  // For rectangle-like highlights with 2 points (most common case)
  if (points.length === 2) {
    const [start, end] = points;
    
    // Calculate rectangle bounds
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x);
    const bottom = Math.max(start.y, end.y);
    
    // Check if point is inside the rectangle with a slightly larger hit area for better UX
    const padding = 4 / scale; // 4px padding for easier selection
    
    return (
      point.x >= left - padding &&
      point.x <= right + padding &&
      point.y >= top - padding &&
      point.y <= bottom + padding
    );
  }
  
  // For polygon highlights with more points
  // Use point-in-polygon algorithm for complex shapes
  let isInside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      
    if (intersect) isInside = !isInside;
  }
  
  return isInside;
};

// Add new function to draw resize handles
export const drawResizeHandles = (
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  scale: number,
  isHighlight: boolean = false
): void => {
  if (!annotation.points || annotation.points.length < 2) return;

  // Skip resize handles for certain types
  if (["freehand", "stamp"].includes(annotation.type)) return;

  ctx.save();
  ctx.setLineDash([]);
  
  const handleSize = isHighlight ? 7 : 5; // Larger handles for highlights
  const handleColor = isHighlight ? "#2563eb" : "#3b82f6"; // More visible color for highlights
  
  // Special handling for circles
  if (annotation.type === "circle") {
    const [p1, p2] = annotation.points;
    const diameterMode = annotation.style.circleDiameterMode as boolean || false;
    
    let centerX, centerY, radius;
    
    if (diameterMode) {
      // In diameter mode, center is midpoint between two points
      centerX = (p1.x + p2.x) / 2;
      centerY = (p1.y + p2.y) / 2;
      radius = Math.sqrt(
        Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
      ) / 2;
    } else {
      // In center-radius mode, first point is center
      centerX = p1.x;
      centerY = p1.y;
      radius = Math.sqrt(
        Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
      );
    }

    // Draw more prominent resize handles at 8 positions around the circle
    const handles = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      handles.push({
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      });
    }
    
    // Draw the handles as filled squares with borders
    ctx.fillStyle = "white";
    ctx.strokeStyle = handleColor;
    ctx.lineWidth = 1.5 * scale;
    
    handles.forEach((point) => {
      ctx.beginPath();
      ctx.rect(
        point.x * scale - (handleSize / 2),
        point.y * scale - (handleSize / 2),
        handleSize,
        handleSize
      );
      ctx.fill();
      ctx.stroke();
    });
  }
  else {
    // Original code for handling other shapes
    const bounds = getShapeBounds(annotation.points);
    const cornerPoints = [
      { x: bounds.left, y: bounds.top }, // top-left
      { x: bounds.right, y: bounds.top }, // top-right
      { x: bounds.left, y: bounds.bottom }, // bottom-left
      { x: bounds.right, y: bounds.bottom }, // bottom-right
    ];
    
    // Add middle points for non-line shapes
    if (
      !["line", "arrow", "doubleArrow"].includes(annotation.type) ||
      annotation.type === "highlight"
    ) {
      cornerPoints.push(
        { x: (bounds.left + bounds.right) / 2, y: bounds.top }, // top
        { x: bounds.right, y: (bounds.top + bounds.bottom) / 2 }, // right
        { x: (bounds.left + bounds.right) / 2, y: bounds.bottom }, // bottom
        { x: bounds.left, y: (bounds.top + bounds.bottom) / 2 } // left
      );
    }
  
    // Draw the handles
    cornerPoints.forEach((point) => {
      ctx.fillStyle = "white";
      ctx.strokeStyle = handleColor;
      ctx.lineWidth = isHighlight ? 2 * scale : 1.5 * scale;
      
      // Draw handle square
      ctx.beginPath();
      ctx.rect(
        point.x * scale - (handleSize / 2),
        point.y * scale - (handleSize / 2),
        handleSize,
        handleSize
      );
      ctx.fill();
      ctx.stroke();
    });
  }

  ctx.restore();
};

// Helper function to check if a point is near a handle
export const isNearHandle = (
  point: Point,
  handle: Point,
  scale: number,
  threshold: number = 8
): boolean => {
  const scaledThreshold = threshold / scale;
  return (
    Math.abs(point.x - handle.x) <= scaledThreshold &&
    Math.abs(point.y - handle.y) <= scaledThreshold
  );
};

// Add helper function for shape bounds
export const getShapeBounds = (
  points: Point[]
): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} => {
  return points.reduce(
    (bounds, point) => ({
      left: Math.min(bounds.left, point.x),
      right: Math.max(bounds.right, point.x),
      top: Math.min(bounds.top, point.y),
      bottom: Math.max(bounds.bottom, point.y),
    }),
    {
      left: points[0].x,
      right: points[0].x,
      top: points[0].y,
      bottom: points[0].y,
    }
  );
};

export const drawStamp = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  style: AnnotationStyle,
  scale: number,
  isForExport: boolean = false
) => {
  if (!points.length || !style.stampType) return;
  const [start] = points;

  // Apply scaling to coordinates
  const x = start.x * scale;
  const y = start.y * scale;
  
  // Get stamp size from style or use default (100%)
  const stampSizePercent = style.stampSize || 100;
  const sizeMultiplier = stampSizePercent / 100;
  
  // Size proportions - adjusted by scale and size percentage
  let stampWidth = 180 * scale * sizeMultiplier;
  let stampHeight = 50 * scale * sizeMultiplier;
  
  // For exports, ensure stamp is properly sized and positioned
  if (isForExport) {
    // Ensure minimum size for visibility in exports
    stampWidth = Math.max(stampWidth, 150 * scale);
    stampHeight = Math.max(stampHeight, 40 * scale);
  }
  
  const borderRadius = 6 * scale * sizeMultiplier;

  // Save context state
  ctx.save();
  
  // Set stamp styles based on type
  let stampColor, icon;
  
  switch (style.stampType) {
    case "approved":
      stampColor = "#22c55e"; // Green
      icon = "✓";
      break;
    case "rejected":
      stampColor = "#ef4444"; // Red
      icon = "✗";
      break;
    case "revision":
      stampColor = "#f97316"; // Orange
      icon = "↻";
      break;
    default:
      stampColor = "#FF0000";
      icon = "";
  }

  // Set stamp opacity with minimum for exports
  ctx.globalAlpha = isForExport ? Math.max(style.opacity ?? 0.9, 0.9) : style.opacity ?? 1.0;
  
  // Draw stamp background with rounded corners
  ctx.beginPath();
  ctx.moveTo(x - stampWidth/2 + borderRadius, y - stampHeight/2);
  ctx.lineTo(x + stampWidth/2 - borderRadius, y - stampHeight/2);
  ctx.quadraticCurveTo(x + stampWidth/2, y - stampHeight/2, x + stampWidth/2, y - stampHeight/2 + borderRadius);
  ctx.lineTo(x + stampWidth/2, y + stampHeight/2 - borderRadius);
  ctx.quadraticCurveTo(x + stampWidth/2, y + stampHeight/2, x + stampWidth/2 - borderRadius, y + stampHeight/2);
  ctx.lineTo(x - stampWidth/2 + borderRadius, y + stampHeight/2);
  ctx.quadraticCurveTo(x - stampWidth/2, y + stampHeight/2, x - stampWidth/2, y + stampHeight/2 - borderRadius);
  ctx.lineTo(x - stampWidth/2, y - stampHeight/2 + borderRadius);
  ctx.quadraticCurveTo(x - stampWidth/2, y - stampHeight/2, x - stampWidth/2 + borderRadius, y - stampHeight/2);
  ctx.closePath();
  
  // For exports, fill with very light background for better visibility
  if (isForExport) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.fill();
  }
  
  // Draw border
  ctx.strokeStyle = stampColor;
  ctx.lineWidth = (isForExport ? 2.0 : 1.5) * scale;
  ctx.setLineDash([]);
  ctx.stroke();
  
  // Calculate text and icon dimensions
  const iconSize = 22 * scale * sizeMultiplier;
  const textSize = 20 * scale * sizeMultiplier;
  const text = style.stampType.toUpperCase();
  
  // Set text font for measurement
  ctx.font = `bold ${textSize}px Arial`;
  const textWidth = ctx.measureText(text).width;
  
  // Set icon font for approximate measurement
  ctx.font = `bold ${iconSize}px Arial`;
  const iconWidth = ctx.measureText(icon).width;
  
  // Calculate spacing between icon and text
  const spacing = 15 * scale * sizeMultiplier;
  const totalContentWidth = iconWidth + spacing + textWidth;
  
  // Calculate positions to center the content
  const contentStartX = x - totalContentWidth / 2;
  
  // Set up text properties
  ctx.fillStyle = stampColor;
  ctx.textAlign = "left"; // Changed to left alignment for precise positioning
  ctx.textBaseline = "middle";
  
  // Draw icon 
  ctx.font = `bold ${iconSize}px Arial`;
  ctx.fillText(icon, contentStartX, y);
  
  // Draw stamp text with proper spacing
  ctx.font = `bold ${textSize}px Arial`;
  ctx.fillText(text, contentStartX + iconWidth + spacing, y);

  // Restore context state
  ctx.restore();
};

// Update isPointInStamp to use scale and stampSize
export const isPointInStamp = (
  point: Point,
  annotation: Annotation,
  scale: number = 1
): boolean => {
  if (!annotation.points.length) return false;

  const [start] = annotation.points;
  
  // Get stamp size percentage from style or use default (100%)
  const stampSizePercent = annotation.style.stampSize || 100;
  const sizeMultiplier = stampSizePercent / 100;
  
  // Base stamp dimensions
  const stampWidth = 180 * sizeMultiplier; 
  const stampHeight = 50 * sizeMultiplier;

  // Calculate the bounds of the stamp
  const left = (start.x - stampWidth / 2);
  const right = (start.x + stampWidth / 2);
  const top = (start.y - stampHeight / 2);
  const bottom = (start.y + stampHeight / 2);
  
  // Add a small padding for easier selection
  const padding = 5;

  return (
    point.x >= left - padding &&
    point.x <= right + padding &&
    point.y <= bottom + padding &&
    point.y >= top - padding
  );
};

// Add new function to draw selection outline
export const drawSelectionOutline = (
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  scale: number,
  isMultiSelect: boolean = false
) => {
  if (!annotation.points || annotation.points.length < 1) return;

  ctx.save();
  
  // Use a blue color for selection outline
  ctx.strokeStyle = isMultiSelect ? "#4299e1" : "#2563eb";
  ctx.lineWidth = 1.5 * scale;
  ctx.setLineDash([4 * scale, 3 * scale]);
  
  const { type } = annotation;
  let bounds;
  
  if (type === "highlight") {
    // For highlights, use a more visible selection rectangle
    bounds = getShapeBounds(annotation.points);
    ctx.beginPath();
    ctx.rect(
      bounds.left * scale - 1,
      bounds.top * scale - 1,
      (bounds.right - bounds.left) * scale + 2,
      (bounds.bottom - bounds.top) * scale + 2
    );
    ctx.stroke();
    
    // Draw more visible resize handles for highlights
    drawResizeHandles(ctx, annotation, scale, true);
  } else if (type === "stamp" || type === "stampApproved" || 
             type === "stampRejected" || type === "stampRevision") {
    // Specific handling for stamp annotations
    const [start] = annotation.points;
    
    // Get stamp size percentage from style or use default (100%)
    const stampSizePercent = annotation.style.stampSize || 100;
    const sizeMultiplier = stampSizePercent / 100;
    
    // Size proportions adjusted by scale and size percentage
    const stampWidth = 180 * scale * sizeMultiplier;
    const stampHeight = 50 * scale * sizeMultiplier;
    
    // Draw selection rectangle around the stamp
    ctx.beginPath();
    ctx.rect(
      start.x * scale - stampWidth / 2, 
      start.y * scale - stampHeight / 2,
      stampWidth,
      stampHeight
    );
    ctx.stroke();
    
    // Add resize handles for stamps at the corners
    const handleSize = 5;
    ctx.fillStyle = "white";
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 1.5 * scale;
    ctx.setLineDash([]);
    
    // Draw handles at corners
    const cornerPoints = [
      { x: start.x - stampWidth/(2*scale), y: start.y - stampHeight/(2*scale) }, // top-left
      { x: start.x + stampWidth/(2*scale), y: start.y - stampHeight/(2*scale) }, // top-right
      { x: start.x - stampWidth/(2*scale), y: start.y + stampHeight/(2*scale) }, // bottom-left
      { x: start.x + stampWidth/(2*scale), y: start.y + stampHeight/(2*scale) }, // bottom-right
    ];
    
    cornerPoints.forEach((point) => {
      ctx.beginPath();
      ctx.rect(
        point.x * scale - (handleSize / 2),
        point.y * scale - (handleSize / 2),
        handleSize,
        handleSize
      );
      ctx.fill();
      ctx.stroke();
    });
  } else {
    // For other shapes, follow their natural contour
    ctx.beginPath();
    
    // For simple shapes with 2 points
    if (annotation.points.length === 2) {
      const [start, end] = annotation.points;
      // Type-specific outlines
      if (type === "rectangle") {
        ctx.rect(
          start.x * scale,
          start.y * scale,
          (end.x - start.x) * scale,
          (end.y - start.y) * scale
        );
      } else if (type === "line" || type === "arrow" || type === "doubleArrow") {
        ctx.moveTo(start.x * scale, start.y * scale);
        ctx.lineTo(end.x * scale, end.y * scale);
      } else if (type === "circle") {
        // Get the circle parameters based on the drawing mode
        const diameterMode = annotation.style.circleDiameterMode as boolean || false;
        let centerX, centerY, radius;
        
        if (diameterMode) {
          // In diameter mode, center is midpoint between two points
          centerX = (start.x + end.x) / 2 * scale;
          centerY = (start.y + end.y) / 2 * scale;
          radius = Math.sqrt(
            Math.pow((end.x - start.x) * scale, 2) +
            Math.pow((end.y - start.y) * scale, 2)
          ) / 2;
        } else {
          // In center-radius mode, first point is center
          centerX = start.x * scale;
          centerY = start.y * scale;
          radius = Math.sqrt(
            Math.pow((end.x - start.x) * scale, 2) +
            Math.pow((end.y - start.y) * scale, 2)
          );
        }
        
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      } else {
        // Generic outline for two-point shapes
        bounds = getShapeBounds(annotation.points);
        ctx.rect(
          bounds.left * scale,
          bounds.top * scale,
          (bounds.right - bounds.left) * scale,
          (bounds.bottom - bounds.top) * scale
        );
      }
    } 
    // For shapes with more points
    else {
      annotation.points.forEach((point, index) => {
        if (index === 0) {
          ctx.moveTo(point.x * scale, point.y * scale);
        } else {
          ctx.lineTo(point.x * scale, point.y * scale);
        }
      });
      
      // Close the path for area shapes
      if (
        ["polygon", "triangle", "star", "freehand", "highlight"].includes(type)
      ) {
        ctx.closePath();
      }
    }
    
    ctx.stroke();
    
    // Draw resize handles for the shape
    drawResizeHandles(ctx, annotation, scale);
  }

  ctx.restore();
};

// Add helper function to get rectangle dimensions
export const getRectangleDimensions = (start: Point, end: Point) => {
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);

  return { width, height, left, top };
};

// Add drawing functions for architectural symbols
export const drawDoor = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  const size = Math.min(width, height);

  ctx.save();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2 * scale;

  // Draw door frame
  ctx.strokeRect(
    start.x * scale, 
    start.y * scale, 
    size * scale, 
    size * scale
  );

  // Draw door arc
  ctx.beginPath();
  ctx.arc(
    start.x * scale + size * scale,
    start.y * scale + (size * scale) / 2,
    (size * scale) / 2,
    Math.PI * 1.5,
    Math.PI * 0.5
  );
  ctx.stroke();

  ctx.restore();
};

export const drawWindow = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  ctx.save();
  ctx.strokeStyle = "#0000FF";
  ctx.lineWidth = 2 * scale;

  // Draw window frame
  ctx.strokeRect(start.x * scale, start.y * scale, width * scale, height * scale);

  // Draw window panes
  ctx.beginPath();
  ctx.moveTo(start.x * scale + (width * scale) / 2, start.y * scale);
  ctx.lineTo(start.x * scale + (width * scale) / 2, start.y * scale + height * scale);
  ctx.moveTo(start.x * scale, start.y * scale + (height * scale) / 2);
  ctx.lineTo(start.x * scale + width * scale, start.y * scale + (height * scale) / 2);
  ctx.stroke();

  ctx.restore();
};

export const drawFireExit = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  // Calculate bounding box dimensions
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const maxY = Math.max(start.y, end.y);

  const width = maxX - minX;
  const height = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  ctx.save();
  ctx.strokeStyle = "#FF0000";
  ctx.lineWidth = 2 * scale;
  ctx.fillStyle = "rgba(255, 0, 0, 0.3)"; // Add subtle fill for better visibility

  // Main flame body
  ctx.beginPath();
  ctx.moveTo(centerX * scale, maxY * scale); // Bottom center

  // Left curve with two peaks
  ctx.bezierCurveTo(
    (centerX - width * 0.3) * scale,
    (maxY - height * 0.2) * scale,
    (centerX - width * 0.4) * scale,
    (minY + height * 0.3) * scale,
    (centerX - width * 0.1) * scale,
    minY * scale
  );

  // Right curve with two peaks
  ctx.bezierCurveTo(
    (centerX + width * 0.1) * scale,
    (minY + height * 0.5) * scale,
    (centerX + width * 0.4) * scale,
    (maxY - height * 0.3) * scale,
    centerX * scale,
    maxY * scale
  );

  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Inner flame details
  ctx.beginPath();
  ctx.moveTo((centerX - width * 0.15) * scale, (maxY - height * 0.2) * scale);
  ctx.quadraticCurveTo(
    centerX * scale,
    (minY + height * 0.4) * scale,
    (centerX + width * 0.15) * scale,
    (maxY - height * 0.2) * scale
  );
  ctx.stroke();

  ctx.restore();
};

export const drawStairs = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  ctx.save();
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2 * scale;

  // Draw stairs
  for (let i = 0; i < 5; i++) {
    const y = start.y * scale + (i * height) / 5;
    ctx.beginPath();
    ctx.moveTo(start.x * scale, y);
    ctx.lineTo(start.x * scale + width, y);
    ctx.stroke();
  }

  ctx.restore();
};

export const drawElevator = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  ctx.save();
  ctx.strokeStyle = "#0000FF"; // Blue for elevator
  ctx.lineWidth = 2 * scale;

  // Draw elevator symbol
  ctx.strokeRect(start.x * scale, start.y * scale, width * scale, height * scale);
  ctx.beginPath();
  ctx.moveTo(start.x * scale + (width * scale) / 2, start.y * scale);
  ctx.lineTo(start.x * scale + (width * scale) / 2, start.y * scale + height * scale);
  ctx.stroke();

  ctx.restore();
};

export const drawToilet = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  isForExport: boolean = false
) => {
  if (!points || points.length < 2) return;
  const [start, end] = points;

  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  ctx.save();
  ctx.strokeStyle = "#00FF00"; // Green for toilet
  ctx.lineWidth = 2 * scale;

  // Draw toilet symbol
  ctx.beginPath();
  ctx.arc(
    start.x * scale + width / 2,
    start.y * scale + height / 2,
    Math.min(width, height) / 2,
    0,
    2 * Math.PI
  );
  ctx.stroke();

  ctx.restore();
};

// Remove the broken function and add a fresh one
export const isPointInsideCircle = (
  point: Point,
  annotation: Annotation,
  scale: number = 1
): boolean => {
  if (annotation.type !== "circle" || annotation.points.length < 2) return false;
  
  const [p1, p2] = annotation.points;
  const diameterMode = annotation.style.circleDiameterMode as boolean || false;
  
  let centerX, centerY, radius;
  
  if (diameterMode) {
    // In diameter mode, center is midpoint between two points
    centerX = (p1.x + p2.x) / 2;
    centerY = (p1.y + p2.y) / 2;
    radius = Math.sqrt(
      Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
    ) / 2;
  } else {
    // In center-radius mode, first point is center
    centerX = p1.x;
    centerY = p1.y;
    radius = Math.sqrt(
      Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)
    );
  }
  
  // Calculate distance from point to center
  const distance = Math.sqrt(
    Math.pow(point.x - centerX, 2) + Math.pow(point.y - centerY, 2)
  );
  
  // Check if point is within the circle
  return distance <= radius;
};

