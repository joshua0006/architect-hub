import type { Folder, Document } from '../types';
import type { TreeItem, TreeItemIndex } from 'react-complex-tree';

/**
 * Tree item data for folder tree
 */
export interface FolderTreeItemData {
  id: string;
  name: string;
  fileCount: number;
  isRoot: boolean;
  folderId: string; // Original folder ID for selection
}

/**
 * Transform folders and documents into react-complex-tree format
 */
export function buildFolderTreeData(
  folders: Folder[],
  documents: Document[]
): Record<TreeItemIndex, TreeItem<FolderTreeItemData>> {
  const treeItems: Record<TreeItemIndex, TreeItem<FolderTreeItemData>> = {};

  // Filter out _root system folders
  const validFolders = folders.filter(
    folder => folder.name !== '_root' && !folder.metadata?.isRootFolder
  );

  // Calculate file counts for each folder
  const fileCounts = new Map<string, number>();
  validFolders.forEach(folder => fileCounts.set(folder.id, 0));
  fileCounts.set('', 0); // Root

  documents.forEach(doc => {
    const folderId = doc.folderId || '';
    fileCounts.set(folderId, (fileCounts.get(folderId) || 0) + 1);
  });

  // Create root item (virtual "All Folders")
  const rootCount = fileCounts.get('') || 0;
  const rootChildren: TreeItemIndex[] = [];

  // Add actual root option if there are files
  if (rootCount > 0) {
    treeItems['root-folder'] = {
      index: 'root-folder',
      canMove: false,
      canRename: false,
      isFolder: false,
      data: {
        id: 'root-folder',
        name: 'Root',
        fileCount: rootCount,
        isRoot: true,
        folderId: ''
      },
      children: []
    };
    rootChildren.push('root-folder');
  }

  // Build folder tree items
  validFolders.forEach(folder => {
    const fileCount = fileCounts.get(folder.id) || 0;

    treeItems[folder.id] = {
      index: folder.id,
      canMove: false,
      canRename: false,
      isFolder: true,
      data: {
        id: folder.id,
        name: folder.name || folder.id,
        fileCount,
        isRoot: false,
        folderId: folder.id
      },
      children: []
    };
  });

  // Build parent-child relationships
  validFolders.forEach(folder => {
    if (!folder.parentId || !treeItems[folder.parentId]) {
      // This is a root-level folder
      rootChildren.push(folder.id);
    } else {
      // This is a child folder
      const parentItem = treeItems[folder.parentId];
      if (parentItem && parentItem.children) {
        parentItem.children.push(folder.id);
      }
    }
  });

  // Sort children alphabetically
  Object.values(treeItems).forEach(item => {
    if (item.children && item.children.length > 0) {
      item.children.sort((a, b) => {
        const aData = treeItems[a]?.data;
        const bData = treeItems[b]?.data;
        if (!aData || !bData) return 0;
        return aData.name.localeCompare(bData.name);
      });
    }
  });

  // Sort root children
  rootChildren.sort((a, b) => {
    const aData = treeItems[a]?.data;
    const bData = treeItems[b]?.data;
    if (!aData || !bData) return 0;
    return aData.name.localeCompare(bData.name);
  });

  // Create virtual root item
  treeItems['root'] = {
    index: 'root',
    canMove: false,
    canRename: false,
    isFolder: true,
    data: {
      id: 'root',
      name: 'All Folders',
      fileCount: documents.length,
      isRoot: true,
      folderId: 'all'
    },
    children: rootChildren
  };

  return treeItems;
}

/**
 * Convert tree item selection to folder ID for filtering
 */
export function treeItemToFolderId(itemId: TreeItemIndex): string {
  if (itemId === 'root') return 'all';
  if (itemId === 'root-folder') return '';
  return itemId as string;
}

/**
 * Convert folder ID to tree item index
 */
export function folderIdToTreeItem(folderId: string): TreeItemIndex {
  if (folderId === 'all') return 'root';
  if (folderId === '') return 'root-folder';
  return folderId;
}

/**
 * Search tree items by name
 */
export function searchTreeItems(
  treeItems: Record<TreeItemIndex, TreeItem<FolderTreeItemData>>,
  searchTerm: string
): Set<TreeItemIndex> {
  const matchingItems = new Set<TreeItemIndex>();
  const term = searchTerm.toLowerCase();

  if (!term) return matchingItems;

  Object.entries(treeItems).forEach(([id, item]) => {
    if (id === 'root') return; // Skip virtual root

    if (item.data.name.toLowerCase().includes(term)) {
      matchingItems.add(id);

      // Add all parents to expand path
      let currentId = id;
      let current = treeItems[currentId];

      while (current) {
        // Find parent
        const parent = Object.values(treeItems).find(
          item => item.children?.includes(currentId)
        );

        if (parent && parent.index !== 'root') {
          matchingItems.add(parent.index);
          currentId = parent.index as string;
          current = parent;
        } else {
          break;
        }
      }
    }
  });

  return matchingItems;
}

/**
 * Get all expandable item IDs
 */
export function getAllExpandableItems(
  treeItems: Record<TreeItemIndex, TreeItem<FolderTreeItemData>>
): TreeItemIndex[] {
  return Object.entries(treeItems)
    .filter(([id, item]) => item.isFolder && (item.children?.length ?? 0) > 0)
    .map(([id]) => id);
}
