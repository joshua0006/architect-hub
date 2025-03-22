declare module 'jspdf' {
  export class jsPDF {
    constructor(options?: {
      orientation?: 'portrait' | 'landscape';
      unit?: string;
      format?: [number, number] | string;
    });
    
    addPage(format?: [number, number] | string): jsPDF;
    
    addImage(
      imageData: string | HTMLImageElement,
      format: string,
      x: number,
      y: number,
      width: number,
      height: number,
      alias?: string,
      compression?: string,
      rotation?: number
    ): jsPDF;
    
    save(filename: string): jsPDF;
  }
} 