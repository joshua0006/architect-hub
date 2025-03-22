import { useState, useEffect } from 'react';
import { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export const usePDFPage = (
  pdf: PDFDocumentProxy | null,
  pageNumber: number,
  scale: number
) => {
  const [page, setPage] = useState<PDFPageProxy | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!pdf) return;

    const loadPage = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const page = await pdf.getPage(pageNumber);
        setPage(page);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load page'));
      } finally {
        setIsLoading(false);
      }
    };

    loadPage();

    return () => {
      page?.cleanup();
    };
  }, [pdf, pageNumber]);

  return { page, error, isLoading };
};