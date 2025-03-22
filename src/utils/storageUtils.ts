export const compressData = (data: any): string => {
  try {
    const jsonString = JSON.stringify(data);
    return btoa(jsonString);
  } catch (error) {
    console.error('Compression error:', error);
    return JSON.stringify(data);
  }
};

export const decompressData = (compressed: string): any => {
  try {
    const jsonString = atob(compressed);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Decompression error:', error);
    return JSON.parse(compressed);
  }
};

export const getStorageSize = (data: any): number => {
  return new Blob([JSON.stringify(data)]).size;
}; 