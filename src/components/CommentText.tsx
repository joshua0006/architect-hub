import React, { useEffect, useState } from 'react';
import { extractMentions, formatTextWithMentions } from '../utils/textUtils';

interface CommentTextProps {
  text: string;
  className?: string;
}

/**
 * Component that renders comment text with highlighted mentions
 */
const CommentText: React.FC<CommentTextProps> = ({ text, className = '' }) => {
  const [formattedText, setFormattedText] = useState<string>('');
  
  useEffect(() => {
    // Add custom styling for mentions to make them stand out better
    const mentionStyles = `
      .mention-highlight {
        color: #3b82f6; /* text-blue-500 */
        font-weight: 500;
        background-color: rgba(59, 130, 246, 0.1); /* Light blue background */
        border-radius: 4px;
        padding: 1px 3px;
        margin: 0 1px;
      }
    `;
    
    // Extract mentions from the text
    const mentions = extractMentions(text);
    
    // Format the text with highlighted mentions
    if (mentions.length > 0) {
      // Replace the default styling with our custom class
      const formatted = formatTextWithMentions(text, mentions)
        .replace(/class="text-blue-500 font-medium"/g, 'class="mention-highlight"');
      
      setFormattedText(`<style>${mentionStyles}</style>${formatted}`);
    } else {
      setFormattedText(text);
    }
  }, [text]);
  
  return (
    <p 
      className={className}
      dangerouslySetInnerHTML={{ __html: formattedText }}
    />
  );
};

export default CommentText; 