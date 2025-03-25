import { Annotation, Point } from "../types/annotation";

// Interface for a user mention
export interface UserMention {
  username: string;  // The username without the @ symbol
  userId?: string;   // The user ID if resolved
  startIndex: number; // Starting position in the text
  endIndex: number;   // Ending position in the text
}

/**
 * Extracts mentions from text (format: @username)
 * @param text The text to parse for mentions
 * @returns Array of UserMention objects
 */
export const extractMentions = (text: string): UserMention[] => {
  if (!text) return [];
  
  const mentions: UserMention[] = [];
  
  // Find all potential mentions - just the @symbol followed by text until whitespace or punctuation
  const basicMentionRegex = /@\S+/g;
  let match;
  
  while ((match = basicMentionRegex.exec(text)) !== null) {
    // Starting position of the mention
    const startIndex = match.index;
    
    // Basic mention without spaces (e.g., "@John")
    const basicMention = match[0];
    let endIndex = startIndex + basicMention.length;
    
    // Check if this might be a multi-word name (e.g., "@John Doe")
    const remainingText = text.substring(endIndex);
    
    // This will match ONE additional word after "@John"
    // We limit to just one additional word to avoid including trailing text
    const followingWordMatch = /^\s+([^\s.,!?;:()\[\]{}@"]+)/.exec(remainingText);
    
    if (followingWordMatch) {
      // Only include the next word if it looks like part of a name
      const followingWord = followingWordMatch[0];
      const word = followingWordMatch[1];
      
      // Only add the word if it looks like a proper name part (first letter uppercase)
      // or if it's short (like a middle initial)
      if (word.length < 3 || /^[A-Z]/.test(word)) {
        endIndex += followingWord.length;
      }
    }
    
    // Get the mention text without the @ symbol
    const username = text.substring(startIndex + 1, endIndex).trim();
    
    // Skip empty mentions
    if (!username) continue;
    
    mentions.push({
      username,
      startIndex,
      endIndex
    });
  }
  
  return mentions;
};

/**
 * Resolves usernames to user IDs using a provided mapping function
 * @param mentions Array of UserMention objects
 * @param resolveUserId Function that takes a username and returns a Promise with the user ID
 * @returns Array of UserMention objects with resolved user IDs
 */
export const resolveUserMentions = async (
  mentions: UserMention[],
  resolveUserId: (username: string) => Promise<string | null>
): Promise<UserMention[]> => {
  if (!mentions.length) {
    console.log('No mentions to resolve');
    return [];
  }
  
  console.log(`Attempting to resolve ${mentions.length} mentions`);
  
  const resolvedMentions = await Promise.all(
    mentions.map(async (mention) => {
      try {
        // Sanitize username
        const username = mention.username.trim();
        
        if (!username) {
          console.log('Skipping empty username');
          return { ...mention, userId: undefined };
        }
        
        console.log(`Resolving user mention: @${username}`);
        const userId = await resolveUserId(username);
        
        if (userId) {
          console.log(`Successfully resolved @${username} to user ID: ${userId}`);
          return {
            ...mention,
            userId
          };
        } else {
          console.log(`Could not resolve @${username} to a valid user ID`);
          return {
            ...mention,
            userId: undefined
          };
        }
      } catch (error) {
        console.error(`Error resolving user ID for ${mention.username}:`, error);
        return {
          ...mention, 
          userId: undefined
        };
      }
    })
  );
  
  // Filter out mentions that couldn't be resolved to actual users
  const validMentions = resolvedMentions.filter(mention => mention.userId);
  console.log(`Successfully resolved ${validMentions.length} out of ${mentions.length} mentions`);
  
  return validMentions;
};

/**
 * Extract user IDs from resolved mentions
 * @param mentions Array of UserMention objects with resolved user IDs
 * @returns Array of user IDs
 */
export const extractUserIds = (mentions: UserMention[]): string[] => {
  // Filter out mentions that couldn't be resolved to actual users
  // and ensure we remove any duplicates to prevent multiple notifications
  const uniqueUserIds = new Set<string>();
  
  mentions
    .filter(mention => mention.userId && mention.userId.trim() !== '')
    .forEach(mention => {
      if (mention.userId) {
        uniqueUserIds.add(mention.userId);
      }
    });
  
  return Array.from(uniqueUserIds);
};

/**
 * Format text with highlighted mentions
 * @param text The original text
 * @param mentions Array of UserMention objects
 * @returns HTML string with styled mentions
 */
export const formatTextWithMentions = (text: string, mentions: UserMention[]): string => {
  if (!text || !mentions.length) return text;
  
  let result = '';
  let lastIndex = 0;
  
  // Sort mentions by startIndex to process them in order
  const sortedMentions = [...mentions].sort((a, b) => a.startIndex - b.startIndex);
  
  for (const mention of sortedMentions) {
    // Add text before this mention
    result += text.substring(lastIndex, mention.startIndex);
    
    // Extract just the actual username part (not including trailing text)
    const mentionText = text.substring(mention.startIndex, mention.endIndex);
    
    // Get username words (likely "John Doe" but could be just "John")
    const usernameText = mentionText;
    
    // Wrap only the username part in the styled span
    result += `<span class="text-blue-500 font-medium">${usernameText}</span>`;
    
    // Update the last position
    lastIndex = mention.endIndex;
  }
  
  // Add any remaining text
  if (lastIndex < text.length) {
    result += text.substring(lastIndex);
  }
  
  return result;
};

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