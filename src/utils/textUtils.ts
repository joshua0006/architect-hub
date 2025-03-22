import { Annotation, Point } from "../types/annotation";

/**
 * Renders text annotation on canvas
 */
export const renderTextAnnotation = (
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  scale: number,
  isSelected: boolean = false
): void => {
  if (!annotation.text || !annotation.points.length) return;

  const [position] = annotation.points;
  const { color, opacity } = annotation.style;
  const isSticky = annotation.type === "stickyNote";
  
  // Save canvas context state
  ctx.save();
  
  // Apply opacity
  ctx.globalAlpha = opacity;

  // Draw background for sticky notes
  if (isSticky) {
    // Draw sticky note background
    const width = 200 * scale;
    const height = Math.max(100, (annotation.text.split('\n').length * 20 + 40)) * scale;
    
    // Draw shadow for sticky note
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    // Draw background
    ctx.fillStyle = '#FFF8DC'; // Light yellow for sticky notes
    ctx.fillRect(position.x * scale, position.y * scale, width, height);
    
    // Reset shadow for border
    ctx.shadowColor = 'transparent';
    
    // Draw border
    ctx.strokeStyle = '#FFD700'; // Golden border
    ctx.lineWidth = 2;
    ctx.strokeRect(position.x * scale, position.y * scale, width, height);
  }
  
  // Set text styles
  ctx.font = `${16 * scale}px Arial, sans-serif`;
  ctx.fillStyle = isSticky ? '#000000' : color; // Black text on sticky notes, colored otherwise
  ctx.textBaseline = 'top';
  
  // Draw the text with line wrapping
  const lines = annotation.text.split('\n');
  const lineHeight = 20 * scale;
  const padding = 10 * scale;
  
  lines.forEach((line, index) => {
    ctx.fillText(
      line, 
      (position.x + padding) * scale, 
      (position.y + padding + index * lineHeight) * scale
    );
  });
  
  // Draw selection outline if selected
  if (isSelected) {
    const bounds = getTextBounds(annotation, scale);
    
    ctx.strokeStyle = '#2196F3'; // Selection color
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(
      bounds.left * scale,
      bounds.top * scale,
      (bounds.right - bounds.left) * scale,
      (bounds.bottom - bounds.top) * scale
    );
    ctx.setLineDash([]);
  }
  
  // Restore canvas context state
  ctx.restore();
};

/**
 * Gets the bounds of a text annotation for selection and hit testing
 */
export const getTextBounds = (
  annotation: Annotation,
  scale: number = 1
): { left: number; top: number; right: number; bottom: number } => {
  if (!annotation.points.length) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }
  
  const [position] = annotation.points;
  const isSticky = annotation.type === "stickyNote";
  
  const width = isSticky ? 200 : (annotation.text ? annotation.text.length * 8 : 100);
  const lineCount = annotation.text ? annotation.text.split('\n').length : 1;
  const height = isSticky ? Math.max(100, lineCount * 20 + 40) : lineCount * 20 + 10;
  
  return {
    left: position.x,
    top: position.y,
    right: position.x + width,
    bottom: position.y + height
  };
};

/**
 * Checks if a point is inside a text annotation
 */
export const isPointInTextAnnotation = (
  point: Point,
  annotation: Annotation
): boolean => {
  if (annotation.type !== "text" && annotation.type !== "stickyNote") {
    return false;
  }
  
  const bounds = getTextBounds(annotation);
  
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  );
}; 