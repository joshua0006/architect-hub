import { Annotation, Point } from '../../types/annotation';

export const drawSelectionBox = (
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  scale: number
) => {
  const bounds = getAnnotationBounds(annotation, scale);
  ctx.strokeStyle = '#0088ff';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(
    bounds.x * scale - 5,
    bounds.y * scale - 5,
    bounds.width * scale + 10,
    bounds.height * scale + 10
  );
  ctx.setLineDash([]);
};

export const getAnnotationBounds = (annotation: Annotation, scale: number) => {
  const points = annotation.points;
  
  if (annotation.type === 'circle') {
    const [start, end] = points;
    // Safely access circleDiameterMode with a default value of false
    const diameterMode = annotation.style?.circleDiameterMode as boolean || false;
    
    // Calculate radius based on the mode
    let radius;
    let centerX, centerY;

    if (diameterMode) {
      // In diameter mode, the center is the midpoint between the two points
      centerX = (start.x + end.x) / 2;
      centerY = (start.y + end.y) / 2;
      radius = Math.sqrt(
        Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
      ) / 2;
    } else {
      // In radius mode, the first point is the center
      centerX = start.x;
      centerY = start.y;
      radius = Math.sqrt(
        Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2)
      );
    }
    
    return {
      x: centerX - radius,
      y: centerY - radius,
      width: radius * 2,
      height: radius * 2,
    };
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
};

export const isPointInAnnotation = (point: Point, annotation: Annotation, scale: number) => {
  const bounds = getAnnotationBounds(annotation, scale);
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
};