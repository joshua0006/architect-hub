import type { Folder, Document } from '../types';

/**
 * Tree node structure for rendering folder hierarchy
 */
export interface FolderTreeNode {
  folder: Folder;
  children: FolderTreeNode[];
  level: number;
  fileCount: number;
  displayText: string;
  isLast: boolean;
  parentPath: boolean[];
}

/**
 * Option for folder dropdown with tree visualization
 */
export interface FolderTreeOption {
  id: string;
  displayText: string;
  folder: Folder;
  fileCount: number;
}

/**
 * Build folder hierarchy from flat folder array
 */
export function buildFolderHierarchy(folders: Folder[]): FolderTreeNode[] {
  // Filter out _root system folders
  const validFolders = folders.filter(
    folder => folder.name !== '_root' && !folder.metadata?.isRootFolder
  );

  // Create folder map for quick lookup
  const folderMap = new Map<string, Folder>();
  validFolders.forEach(folder => folderMap.set(folder.id, folder));

  // Find root folders (no parentId or parentId doesn't exist)
  const rootFolders = validFolders.filter(folder =>
    !folder.parentId || !folderMap.has(folder.parentId)
  );

  // Recursive function to build tree
  const buildNode = (
    folder: Folder,
    level: number = 0,
    parentPath: boolean[] = []
  ): FolderTreeNode => {
    // Find children
    const children = validFolders
      .filter(f => f.parentId === folder.id)
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    // Build child nodes
    const childNodes = children.map((child, index) =>
      buildNode(
        child,
        level + 1,
        [...parentPath, index < children.length - 1]
      )
    );

    return {
      folder,
      children: childNodes,
      level,
      fileCount: 0, // Will be populated later
      displayText: '', // Will be populated later
      isLast: false, // Will be set by parent
      parentPath
    };
  };

  // Build tree starting from root folders
  const rootNodes = rootFolders
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map(folder => buildNode(folder));

  return rootNodes;
}

/**
 * Count files in each folder (exact folder only, not recursive)
 */
export function countFilesInFolders(
  folders: Folder[],
  documents: Document[]
): Map<string, number> {
  const counts = new Map<string, number>();

  // Initialize all folders with 0
  folders.forEach(folder => counts.set(folder.id, 0));

  // Count files in root (no folderId or empty string)
  const rootCount = documents.filter(doc => !doc.folderId).length;
  counts.set('', rootCount);

  // Count files in each folder
  documents.forEach(doc => {
    if (doc.folderId) {
      const currentCount = counts.get(doc.folderId) || 0;
      counts.set(doc.folderId, currentCount + 1);
    }
  });

  return counts;
}

/**
 * Generate tree visualization symbols for a node
 */
function generateTreeSymbols(node: FolderTreeNode, isLast: boolean): string {
  if (node.level === 0) {
    return ''; // Root level has no prefix
  }

  let prefix = '';

  // Add vertical lines for parent levels
  for (let i = 0; i < node.level - 1; i++) {
    if (node.parentPath[i]) {
      prefix += '│  '; // Parent has more siblings
    } else {
      prefix += '   '; // Parent is last child
    }
  }

  // Add current level symbol
  if (isLast) {
    prefix += '└─ '; // Last child
  } else {
    prefix += '├─ '; // Has siblings below
  }

  return prefix;
}

/**
 * Flatten tree into display options with proper indentation and symbols
 */
export function flattenTreeToOptions(
  nodes: FolderTreeNode[],
  fileCounts: Map<string, number>
): FolderTreeOption[] {
  const options: FolderTreeOption[] = [];

  const traverse = (node: FolderTreeNode, isLast: boolean) => {
    const fileCount = fileCounts.get(node.folder.id) || 0;
    const prefix = generateTreeSymbols(node, isLast);
    const folderName = node.folder.name || node.folder.id;
    const displayText = `${prefix}${folderName} (${fileCount})`;

    options.push({
      id: node.folder.id,
      displayText,
      folder: node.folder,
      fileCount
    });

    // Recursively process children
    node.children.forEach((child, index) => {
      traverse(child, index === node.children.length - 1);
    });
  };

  // Process root nodes
  nodes.forEach((node, index) => {
    traverse(node, index === nodes.length - 1);
  });

  return options;
}

/**
 * Build full folder path from root to current folder
 */
export function buildFullPath(
  folderId: string,
  folderMap: Map<string, Folder>
): string {
  if (!folderId) {
    return '/';
  }

  const path: string[] = [];
  let current = folderMap.get(folderId);

  while (current) {
    // Skip root folders
    if (!current.metadata?.isRootFolder && current.name !== '_root') {
      path.unshift(current.name || current.id);
    }

    // Move to parent
    current = current.parentId ? folderMap.get(current.parentId) : undefined;
  }

  return path.length > 0 ? path.join(' > ') : '/';
}

/**
 * Main function to generate folder tree options for dropdown
 */
export function generateFolderTreeOptions(
  folders: Folder[],
  documents: Document[]
): FolderTreeOption[] {
  // Build hierarchy
  const tree = buildFolderHierarchy(folders);

  // Count files in each folder
  const fileCounts = countFilesInFolders(folders, documents);

  // Flatten tree to options with visualization
  return flattenTreeToOptions(tree, fileCounts);
}
