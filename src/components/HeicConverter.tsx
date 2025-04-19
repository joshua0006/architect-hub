import React, { useState, useEffect } from 'react';
import heic2any from 'heic2any';

interface HeicConverterProps {
  url: string;
  className?: string;
  alt?: string;
  onError?: (error: Error) => void;
  onLoad?: () => void;
}

const HeicConverter: React.FC<HeicConverterProps> = ({ 
  url, 
  className = "max-w-full max-h-full object-contain", 
  alt = "Image", 
  onError,
  onLoad 
}) => {
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchAndConvert = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Fetch the HEIC file as a blob
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch HEIC image: ${response.status} ${response.statusText}`);
        }
        
        const heicBlob = await response.blob();
        
        // Convert HEIC to JPEG
        const jpegBlob = await heic2any({
          blob: heicBlob,
          toType: 'image/jpeg',
          quality: 0.8
        }) as Blob;
        
        // Create a URL for the converted image
        const jpegUrl = URL.createObjectURL(jpegBlob);
        setConvertedUrl(jpegUrl);
        
        if (onLoad) onLoad();
      } catch (err) {
        console.error('Error converting HEIC image:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
        if (onError) onError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
    };

    if (url) {
      fetchAndConvert();
    }

    // Cleanup function to revoke object URL when component unmounts
    return () => {
      if (convertedUrl) {
        URL.revokeObjectURL(convertedUrl);
      }
    };
  }, [url, onError, onLoad]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full w-full">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
    </div>;
  }

  if (error) {
    return <div className="text-red-500">Failed to load image: {error.message}</div>;
  }

  return convertedUrl ? (
    <img 
      src={convertedUrl} 
      alt={alt}
      className={className}
      onError={(e) => {
        if (onError) onError(new Error('Failed to display converted image'));
      }}
    />
  ) : null;
};

export default HeicConverter; 