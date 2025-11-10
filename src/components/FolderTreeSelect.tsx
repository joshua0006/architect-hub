import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  UncontrolledTreeEnvironment,
  Tree,
  StaticTreeDataProvider,
  TreeItemIndex
} from 'react-complex-tree';
import 'react-complex-tree/lib/style-modern.css';
import { Folder as FolderIcon, FolderOpen, Search, X } from 'lucide-react';
import type { Folder, Document } from '../types';
import {
  buildFolderTreeData,
  treeItemToFolderId,
  folderIdToTreeItem,
  searchTreeItems,
  getAllExpandableItems,
  type FolderTreeItemData
} from '../utils/folderTreeAdapter';

interface FolderTreeSelectProps {
  folders: Folder[];
  documents: Document[];
  selectedFolderId: string;
  onFolderSelect: (folderId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function FolderTreeSelect({
  folders,
  documents,
  selectedFolderId,
  onFolderSelect,
  isOpen,
  onClose
}: FolderTreeSelectProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedItems, setExpandedItems] = useState<TreeItemIndex[]>([]);

  // Build tree data
  const treeData = useMemo(() => {
    return buildFolderTreeData(folders, documents);
  }, [folders, documents]);

  // Create data provider
  const dataProvider = useMemo(() => {
    return new StaticTreeDataProvider(treeData, (item, data) => ({ ...item, data }));
  }, [treeData]);

  // Search matching items
  const matchingItems = useMemo(() => {
    return searchTreeItems(treeData, searchTerm);
  }, [treeData, searchTerm]);

  // ESC key handler to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Auto-expand matching items when searching
  useEffect(() => {
    if (searchTerm && matchingItems.size > 0) {
      setExpandedItems(prev => {
        const newExpanded = new Set([...prev, ...Array.from(matchingItems)]);
        return Array.from(newExpanded);
      });
    }
  }, [searchTerm, matchingItems]);

  // Handle expand all
  const handleExpandAll = useCallback(() => {
    const allExpandable = getAllExpandableItems(treeData);
    setExpandedItems(allExpandable);
  }, [treeData]);

  // Handle collapse all
  const handleCollapseAll = useCallback(() => {
    setExpandedItems(['root']); // Keep root expanded
  }, []);

  // Handle selection
  const handleSelect = useCallback((selectedItems: TreeItemIndex[]) => {
    if (selectedItems.length > 0) {
      const selectedId = selectedItems[0];
      const folderId = treeItemToFolderId(selectedId);
      onFolderSelect(folderId);
    }
  }, [onFolderSelect]);

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
  }, []);

  // Render tree item
  const renderTreeItem = useCallback(({ item, depth, children, title, arrow, context }: any) => {
    const data = item.data as FolderTreeItemData;
    const isExpanded = context.isExpanded;
    const isSelected = context.isSelected;
    const isSearchMatch = matchingItems.has(item.index);

    // Determine if item should be visible based on search
    const isVisible = !searchTerm || isSearchMatch;

    if (!isVisible) {
      return null;
    }

    return (
      <div
        {...context.itemContainerWithChildrenProps}
        className={`
          flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded
          hover:bg-gray-100 transition-colors
          ${isSelected ? 'bg-blue-50' : ''}
          ${isSearchMatch && searchTerm ? 'font-semibold' : ''}
        `}
        style={{ paddingLeft: `${depth * 1.5}rem` }}
      >
        {/* Folder icon */}
        <span className="flex-shrink-0">
          {item.isFolder ? (
            isExpanded ? (
              <FolderOpen className="w-4 h-4 text-blue-500" />
            ) : (
              <FolderIcon className="w-4 h-4 text-gray-500" />
            )
          ) : (
            <FolderIcon className="w-4 h-4 text-gray-400" />
          )}
        </span>

        {/* Folder name */}
        <span className="flex-1 text-sm truncate" title={data.name}>
          {data.name}
        </span>

        {/* File count badge */}
        <span className={`
          flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-medium
          ${isSelected ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}
        `}>
          {data.fileCount}
        </span>

        {/* Children */}
        {children}
      </div>
    );
  }, [searchTerm, matchingItems]);

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
    >
      {/* Modal dialog */}
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl h-[600px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with close button, search and controls */}
        <div className="flex-shrink-0 p-4 border-b border-gray-200 bg-gray-50 space-y-3">
          {/* Close button and title */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Filter by Folder</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search folders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-9 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tree container */}
      <div className="flex-1 overflow-auto">
        <UncontrolledTreeEnvironment
          dataProvider={dataProvider}
          getItemTitle={(item) => item.data.name}
          viewState={{
            ['folder-tree']: {
              expandedItems,
              selectedItems: [folderIdToTreeItem(selectedFolderId)]
            }
          }}
          onExpandItem={(item) => {
            setExpandedItems(prev => {
              if (!prev.includes(item.index)) {
                return [...prev, item.index];
              }
              return prev;
            });
          }}
          onCollapseItem={(item) => {
            setExpandedItems(prev => prev.filter(id => id !== item.index));
          }}
          onSelectItems={handleSelect}
          canDragAndDrop={false}
          canDropOnFolder={false}
          canReorderItems={false}
          canSearch={false}
          renderItemTitle={renderTreeItem}
        >
          <Tree treeId="folder-tree" rootItem="root" treeLabel="Folder tree" />
        </UncontrolledTreeEnvironment>
      </div>

        {/* Footer with actions and info */}
        <div className="flex-shrink-0 px-4 py-3 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            {/* Left side - Search results or current selection */}
            <div className="text-sm text-gray-600">
              {searchTerm ? (
                matchingItems.size > 0 ? (
                  <span>{matchingItems.size} folder{matchingItems.size !== 1 ? 's' : ''} found</span>
                ) : (
                  <span>No folders found</span>
                )
              ) : selectedFolderId !== 'all' ? (
                <span className="font-medium">
                  {selectedFolderId === '' ? 'Root' : folders.find(f => f.id === selectedFolderId)?.name || 'Unknown'}
                </span>
              ) : (
                <span className="text-gray-500">All folders</span>
              )}
            </div>

            {/* Right side - Action buttons */}
            <div className="flex items-center gap-2">
              {selectedFolderId !== 'all' && (
                <button
                  onClick={() => {
                    onFolderSelect('all');
                    onClose();
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
                >
                  Remove Filter
                </button>
              )}
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
