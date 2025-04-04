import { Annotation, Point } from '../../types/annotation';

export const drawAnnotation = (
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
  scale: number
) => {
  const { type, points, style } = annotation;
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.lineWidth * scale;
  ctx.globalAlpha = style.opacity;

  ctx.beginPath();
  switch (type) {
    case 'freehand':
      drawFreehand(ctx, points, scale);
      break;
    case 'line':
      drawLine(ctx, points, scale);
      break;
    case 'rectangle':
      drawRectangle(ctx, points, scale);
      break;
    case 'circle':
      drawCircle(ctx, points, scale, style.circleDiameterMode);
      break;
    case 'arrow':
    case 'doubleArrow':
      drawArrow(ctx, points, scale, type === 'doubleArrow');
      break;
    case 'tick':
      drawTick(ctx, points, scale);
      break;
    case 'cross':
      drawCross(ctx, points, scale);
      break;
    case 'highlight':
      drawHighlight(ctx, points, scale, style.color);
      break;
    case 'text':
    case 'stickyNote':
      drawText(ctx, points, scale, annotation.text, type, style.color);
      break;
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
};

const drawFreehand = (ctx: CanvasRenderingContext2D, points: Point[], scale: number) => {
  ctx.moveTo(points[0].x * scale, points[0].y * scale);
  points.slice(1).forEach((point) => {
    ctx.lineTo(point.x * scale, point.y * scale);
  });
};

const drawLine = (ctx: CanvasRenderingContext2D, points: Point[], scale: number) => {
  const [start, end] = points;
  ctx.moveTo(start.x * scale, start.y * scale);
  ctx.lineTo(end.x * scale, end.y * scale);
};

const drawRectangle = (ctx: CanvasRenderingContext2D, points: Point[], scale: number) => {
  const [start, end] = points;
  ctx.rect(
    start.x * scale,
    start.y * scale,
    (end.x - start.x) * scale,
    (end.y - start.y) * scale
  );
};

const drawCircle = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  diameterMode: boolean = false
) => {
  const [center, edge] = points;
  let radius;
  if (diameterMode) {
    radius = Math.sqrt(
      Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
    ) * scale / 2;
    const midX = (center.x + edge.x) / 2;
    const midY = (center.y + edge.y) / 2;
    ctx.arc(midX * scale, midY * scale, radius, 0, 2 * Math.PI);
  } else {
    radius = Math.sqrt(
      Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2)
    ) * scale;
    ctx.arc(center.x * scale, center.y * scale, radius, 0, 2 * Math.PI);
  }
};

const drawArrow = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  isDouble: boolean
) => {
  const [start, end] = points;
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const headLength = 20 * scale;

  ctx.moveTo(start.x * scale, start.y * scale);
  ctx.lineTo(end.x * scale, end.y * scale);

  // Draw end arrowhead
  ctx.lineTo(
    end.x * scale - headLength * Math.cos(angle - Math.PI / 6),
    end.y * scale - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(end.x * scale, end.y * scale);
  ctx.lineTo(
    end.x * scale - headLength * Math.cos(angle + Math.PI / 6),
    end.y * scale - headLength * Math.sin(angle + Math.PI / 6)
  );

  if (isDouble) {
    ctx.moveTo(start.x * scale, start.y * scale);
    ctx.lineTo(
      start.x * scale + headLength * Math.cos(angle - Math.PI / 6),
      start.y * scale + headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.moveTo(start.x * scale, start.y * scale);
    ctx.lineTo(
      start.x * scale + headLength * Math.cos(angle + Math.PI / 6),
      start.y * scale + headLength * Math.sin(angle + Math.PI / 6)
    );
  }
};

const drawTick = (ctx: CanvasRenderingContext2D, points: Point[], scale: number) => {
  const [start, end] = points;
  const size = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
  
  ctx.moveTo(start.x * scale, start.y * scale + size * 0.5 * scale);
  ctx.lineTo(start.x * scale + size * 0.4 * scale, start.y * scale + size * scale);
  ctx.lineTo(start.x * scale + size * scale, start.y * scale);
};

const drawCross = (ctx: CanvasRenderingContext2D, points: Point[], scale: number) => {
  const [start, end] = points;
  const size = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
  
  ctx.moveTo(start.x * scale, start.y * scale);
  ctx.lineTo(start.x * scale + size * scale, start.y * scale + size * scale);
  ctx.moveTo(start.x * scale + size * scale, start.y * scale);
  ctx.lineTo(start.x * scale, start.y * scale + size * scale);
};

const drawHighlight = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  color: string
) => {
  // Cap highlight opacity at 0.7
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = color;
  const [start, end] = points;
  ctx.fillRect(
    start.x * scale,
    start.y * scale,
    (end.x - start.x) * scale,
    (end.y - start.y) * scale
  );
};

const drawText = (
  ctx: CanvasRenderingContext2D,
  points: Point[],
  scale: number,
  text: string | undefined,
  type: 'text' | 'stickyNote',
  color: string
) => {
  if (!text) return;

  const textColor = type === 'stickyNote' ? '#000000' : color;
  if (type === 'stickyNote') {
    ctx.fillStyle = '#FFEB3B';
    ctx.globalAlpha = 0.8;
    const padding = 8 * scale;
    const lineHeight = 20 * scale;
    const lines = text.split('\n');
    const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
    const width = maxWidth + padding * 2;
    const height = (lines.length * lineHeight) + padding * 2;
    ctx.fillRect(
      points[0].x * scale - padding,
      points[0].y * scale - 16 * scale,
      width,
      height
    );
    ctx.globalAlpha = 1;
  }

  ctx.font = `${14 * scale}px Arial`;
  ctx.fillStyle = textColor;
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    ctx.fillText(
      line,
      points[0].x * scale,
      points[0].y * scale + (i * 20 * scale)
    );
  });
};