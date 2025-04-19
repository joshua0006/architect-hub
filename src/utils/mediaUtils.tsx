import React from 'react';

/**
 * Interface for supported media file types and their display properties
 */
export interface MediaTypeInfo {
  type: 'image' | 'video' | 'audio' | 'pdf' | 'other';
  mimeTypes: string[];
  extensions: string[];
  component: React.FC<MediaDisplayProps>;
  canPreview: boolean;
  description: string;
}

/**
 * Props for media display components
 */
export interface MediaDisplayProps {
  url: string;
  name: string;
  contentType?: string;
  className?: string;
  style?: React.CSSProperties;
  onError?: (error: Error) => void;
  onLoad?: () => void;
}

/**
 * Image display component
 */
export const ImageDisplay: React.FC<MediaDisplayProps> = (props) => {
  const { url, name, className = "max-w-full max-h-full object-contain", style, onError, onLoad } = props;
  return (
    <img 
      src={url} 
      alt={name} 
      className={className} 
      style={style}
      onError={(e) => onError?.(new Error(`Failed to load image: ${e}`))}
      onLoad={onLoad}
    />
  );
};

/**
 * SVG display component with special handling
 */
export const SVGDisplay: React.FC<MediaDisplayProps> = (props) => {
  const { url, name, className = "max-w-full max-h-full", style, onError, onLoad } = props;
  return (
    <object 
      data={url} 
      type="image/svg+xml"
      className={className}
      style={style}
      onError={(e) => onError?.(new Error(`Failed to load SVG: ${e}`))}
      onLoad={onLoad}
    >
      <img 
        src={url} 
        alt={name} 
        className={className}
        onError={(e) => onError?.(new Error(`Failed to load SVG as image: ${e}`))}
      />
    </object>
  );
};

/**
 * Video display component
 */
export const VideoDisplay: React.FC<MediaDisplayProps> = (props) => {
  const { url, name, className = "max-w-full max-h-full", style, onError, onLoad } = props;
  return (
    <video 
      src={url} 
      controls 
      className={className}
      style={style}
      onError={(e) => onError?.(new Error(`Failed to load video: ${e}`))}
      onLoadedData={onLoad}
    >
      Your browser does not support the video tag.
    </video>
  );
};

/**
 * Audio display component
 */
export const AudioDisplay: React.FC<MediaDisplayProps> = (props) => {
  const { url, name, className = "w-full", style, onError, onLoad } = props;
  return (
    <div className="flex flex-col items-center">
      <p className="mb-2 text-gray-700">{name}</p>
      <audio 
        src={url} 
        controls 
        className={className}
        style={style}
        onError={(e) => onError?.(new Error(`Failed to load audio: ${e}`))}
        onLoadedData={onLoad}
      >
        Your browser does not support the audio tag.
      </audio>
    </div>
  );
};

/**
 * Default download component for unsupported file types
 */
export const DownloadDisplay: React.FC<MediaDisplayProps> = (props) => {
  const { url, name } = props;
  return (
    <div className="text-center">
      <p className="text-gray-500 mb-4">
        This file type cannot be previewed directly
      </p>
      <a
        href={url}
        download={name}
        className="px-4 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors"
      >
        Download File
      </a>
    </div>
  );
};

/**
 * List of supported media types with their display components and properties
 */
export const MEDIA_TYPES: MediaTypeInfo[] = [
  {
    type: 'image',
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/tiff', 'image/heic'],
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif', '.heic'],
    component: ImageDisplay,
    canPreview: true,
    description: 'Image'
  },
  {
    type: 'image',
    mimeTypes: ['image/svg+xml'],
    extensions: ['.svg'],
    component: SVGDisplay,
    canPreview: true,
    description: 'SVG Image'
  },
  {
    type: 'video',
    mimeTypes: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
    extensions: ['.mp4', '.webm', '.ogg', '.ogv', '.mov'],
    component: VideoDisplay,
    canPreview: true,
    description: 'Video'
  },
  {
    type: 'audio',
    mimeTypes: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/aac'],
    extensions: ['.mp3', '.ogg', '.wav', '.webm', '.aac'],
    component: AudioDisplay,
    canPreview: true,
    description: 'Audio'
  },
  {
    type: 'pdf',
    mimeTypes: ['application/pdf'],
    extensions: ['.pdf'],
    component: DownloadDisplay, // We'll use the PDFViewer component from our app instead
    canPreview: true,
    description: 'PDF Document'
  },
  {
    type: 'other',
    mimeTypes: [],
    extensions: [],
    component: DownloadDisplay,
    canPreview: false,
    description: 'Other File Type'
  }
];

/**
 * Gets the appropriate media type info based on file extension or MIME type
 * @param filename File name with extension or full path
 * @param mimeType Optional MIME type of the file
 * @returns The media type info for the file
 */
export const getMediaTypeInfo = (filename: string, mimeType?: string): MediaTypeInfo => {
  // Try to match by MIME type first
  if (mimeType) {
    const mediaType = MEDIA_TYPES.find(type => 
      type.mimeTypes.some(mime => mime === mimeType)
    );
    if (mediaType) return mediaType;
  }

  // Get the extension from the filename
  const extension = filename.toLowerCase().split('.').pop();
  if (extension) {
    const dotExtension = `.${extension}`;
    const mediaType = MEDIA_TYPES.find(type => 
      type.extensions.some(ext => ext === dotExtension)
    );
    if (mediaType) return mediaType;
  }

  // Return the default/other type if no match found
  return MEDIA_TYPES.find(type => type.type === 'other')!;
};

/**
 * Checks if a file is an image based on filename or MIME type
 * @param filename File name with extension or full path
 * @param mimeType Optional MIME type of the file
 * @returns Boolean indicating whether the file is an image
 */
export const isImage = (filename: string, mimeType?: string): boolean => {
  const mediaType = getMediaTypeInfo(filename, mimeType);
  return mediaType.type === 'image';
};

/**
 * Checks if a file is a video based on filename or MIME type
 * @param filename File name with extension or full path
 * @param mimeType Optional MIME type of the file
 * @returns Boolean indicating whether the file is a video
 */
export const isVideo = (filename: string, mimeType?: string): boolean => {
  const mediaType = getMediaTypeInfo(filename, mimeType);
  return mediaType.type === 'video';
};

/**
 * Checks if a file is audio based on filename or MIME type
 * @param filename File name with extension or full path
 * @param mimeType Optional MIME type of the file
 * @returns Boolean indicating whether the file is audio
 */
export const isAudio = (filename: string, mimeType?: string): boolean => {
  const mediaType = getMediaTypeInfo(filename, mimeType);
  return mediaType.type === 'audio';
};

/**
 * Checks if a file is PDF based on filename or MIME type
 * @param filename File name with extension or full path
 * @param mimeType Optional MIME type of the file
 * @returns Boolean indicating whether the file is a PDF
 */
export const isPDF = (filename: string, mimeType?: string): boolean => {
  const mediaType = getMediaTypeInfo(filename, mimeType);
  return mediaType.type === 'pdf';
};

/**
 * MediaViewer component that handles all media types
 */
export const MediaViewer: React.FC<MediaDisplayProps> = (props) => {
  const { url, name, contentType } = props;
  const mediaTypeInfo = getMediaTypeInfo(name, contentType);
  const MediaComponent = mediaTypeInfo.component;
  
  return <MediaComponent {...props} />;
}; 