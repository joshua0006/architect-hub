import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Loader2, Edit3, Trash2 } from 'lucide-react';
import { Document } from '../types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface FileRowData {
  id: string;
  drawingNo: string;
  name: string;
  folderPath: string;
  type: string;
  dateModified: string;
  url: string;
  document?: Document;
  revisionCount: number;
  // Transmittal-specific fields
  transmittalDrawingNo?: string;
  transmittalTitle?: string;
  transmittalDescription?: string;
  transmittalRevision?: string;
  isDrawingNoOverridden?: boolean;
  isTitleOverridden?: boolean;
  isDescriptionOverridden?: boolean;
  isRevisionOverridden?: boolean;
  // Standalone entry fields
  isStandalone?: boolean;
  standaloneId?: string;
}

interface FileSpreadsheetTableProps {
  files: FileRowData[];
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  sortMode: 'hierarchical' | 'column';
  onSort: (column: string) => void;
  onFileClick: (fileId: string) => void;
  onUpdateDrawingNo: (fileId: string, drawingNo: string) => Promise<void>;
  onUpdateTransmittal: (fileId: string, field: 'drawingNo' | 'title' | 'description' | 'revision', value: string) => Promise<void>;
  onDeleteRow: (rowId: string, isStandalone: boolean) => void;
}

export default function FileSpreadsheetTable({
  files,
  sortColumn,
  sortDirection,
  sortMode,
  onSort,
  onFileClick,
  onUpdateDrawingNo,
  onUpdateTransmittal,
  onDeleteRow
}: FileSpreadsheetTableProps) {
  const [editingDrawingNo, setEditingDrawingNo] = useState<{[key: string]: string}>({});
  const [savingDrawingNo, setSavingDrawingNo] = useState<{[key: string]: boolean}>({});
  const [drawingNoError, setDrawingNoError] = useState<{[key: string]: string}>({});

  const [editingDescription, setEditingDescription] = useState<{[key: string]: string}>({});
  const [savingDescription, setSavingDescription] = useState<{[key: string]: boolean}>({});
  const [descriptionError, setDescriptionError] = useState<{[key: string]: string}>({});

  const [editingRevision, setEditingRevision] = useState<{[key: string]: string}>({});
  const [savingRevision, setSavingRevision] = useState<{[key: string]: boolean}>({});
  const [revisionError, setRevisionError] = useState<{[key: string]: string}>({});

  const renderSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ChevronDown className="w-4 h-4 text-gray-400" />;
    }
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-4 h-4 text-blue-600" />
    ) : (
      <ChevronDown className="w-4 h-4 text-blue-600" />
    );
  };

  const handleDrawingNoChange = (fileId: string, value: string) => {
    // Only allow alphanumeric characters (A-Z, 0-9)
    const alphanumericValue = value.replace(/[^A-Za-z0-9]/g, '');

    // Limit to 6 characters
    const limitedValue = alphanumericValue.slice(0, 6);

    setEditingDrawingNo(prev => ({
      ...prev,
      [fileId]: limitedValue
    }));

    // Clear any previous errors
    setDrawingNoError(prev => ({
      ...prev,
      [fileId]: ''
    }));
  };

  const handleDrawingNoBlur = async (fileId: string, originalValue: string) => {
    const newValue = editingDrawingNo[fileId] ?? originalValue;

    // Only save if value changed
    if (newValue === originalValue) {
      return;
    }

    try {
      setSavingDrawingNo(prev => ({ ...prev, [fileId]: true }));
      setDrawingNoError(prev => ({ ...prev, [fileId]: '' }));

      await onUpdateTransmittal(fileId, 'drawingNo', newValue);

      // Clear editing state on success
      setEditingDrawingNo(prev => {
        const newState = { ...prev };
        delete newState[fileId];
        return newState;
      });
    } catch (error) {
      console.error('Error saving drawing number:', error);
      setDrawingNoError(prev => ({
        ...prev,
        [fileId]: 'Failed to save'
      }));
    } finally {
      setSavingDrawingNo(prev => ({ ...prev, [fileId]: false }));
    }
  };

  const handleDescriptionChange = (fileId: string, value: string) => {
    setEditingDescription(prev => ({
      ...prev,
      [fileId]: value
    }));

    // Clear any previous errors
    setDescriptionError(prev => ({
      ...prev,
      [fileId]: ''
    }));
  };

  const handleDescriptionBlur = async (fileId: string, originalValue: string) => {
    const newValue = editingDescription[fileId] ?? originalValue;

    // Only save if value changed
    if (newValue === originalValue) {
      return;
    }

    try {
      setSavingDescription(prev => ({ ...prev, [fileId]: true }));
      setDescriptionError(prev => ({ ...prev, [fileId]: '' }));

      await onUpdateTransmittal(fileId, 'description', newValue);

      // Clear editing state on success
      setEditingDescription(prev => {
        const newState = { ...prev };
        delete newState[fileId];
        return newState;
      });
    } catch (error) {
      console.error('Error saving description:', error);
      setDescriptionError(prev => ({
        ...prev,
        [fileId]: 'Failed to save'
      }));
    } finally {
      setSavingDescription(prev => ({ ...prev, [fileId]: false }));
    }
  };

  const handleRevisionChange = (fileId: string, value: string) => {
    setEditingRevision(prev => ({
      ...prev,
      [fileId]: value
    }));

    // Clear any previous errors
    setRevisionError(prev => ({
      ...prev,
      [fileId]: ''
    }));
  };

  const handleRevisionBlur = async (fileId: string, originalValue: string) => {
    const newValue = editingRevision[fileId] ?? originalValue;

    // Only save if value changed
    if (newValue === originalValue) {
      return;
    }

    try {
      setSavingRevision(prev => ({ ...prev, [fileId]: true }));
      setRevisionError(prev => ({ ...prev, [fileId]: '' }));

      await onUpdateTransmittal(fileId, 'revision', newValue);

      // Clear editing state on success
      setEditingRevision(prev => {
        const newState = { ...prev };
        delete newState[fileId];
        return newState;
      });
    } catch (error) {
      console.error('Error saving revision:', error);
      setRevisionError(prev => ({
        ...prev,
        [fileId]: 'Failed to save'
      }));
    } finally {
      setSavingRevision(prev => ({ ...prev, [fileId]: false }));
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 hover:bg-gray-50 sticky top-0 z-10">
            <TableHead
              className={`w-[120px] px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${
                sortMode === 'column' ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default'
              } transition-colors`}
              onClick={() => sortMode === 'column' && onSort('drawingNo')}
            >
              <div className="flex items-center space-x-1">
                <span>Drawing No.</span>
                {sortMode === 'column' && renderSortIcon('drawingNo')}
              </div>
            </TableHead>
            <TableHead
              className={`w-auto min-w-[250px] px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${
                sortMode === 'column' ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default'
              } transition-colors`}
              onClick={() => sortMode === 'column' && onSort('name')}
            >
              <div className="flex items-center space-x-1">
                <span>Title</span>
                {sortMode === 'column' && renderSortIcon('name')}
              </div>
            </TableHead>
            <TableHead
              className="w-auto min-w-[200px] px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              <div className="flex items-center space-x-1">
                <span>Description</span>
              </div>
            </TableHead>
            <TableHead
              className={`w-[120px] px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${
                sortMode === 'column' ? 'cursor-pointer hover:bg-gray-100' : 'cursor-default'
              } transition-colors`}
              onClick={() => sortMode === 'column' && onSort('revisionCount')}
            >
              <div className="flex items-center space-x-1">
                <span>No. of Revisions</span>
                {sortMode === 'column' && renderSortIcon('revisionCount')}
              </div>
            </TableHead>
            <TableHead
              className="w-[80px] px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center"
            >
              <span>Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="px-4 py-12 text-center text-gray-500">
                No files found
              </TableCell>
            </TableRow>
          ) : (
            files.map((file) => {
              // Drawing No. field - use transmittal override if available
              const currentDrawingNo = editingDrawingNo[file.id] ?? file.transmittalDrawingNo ?? file.drawingNo ?? '';
              const originalDrawingNo = file.transmittalDrawingNo ?? file.drawingNo ?? '';
              const isSavingDrawingNo = savingDrawingNo[file.id] || false;
              const hasDrawingNoError = !!drawingNoError[file.id];

              // Title field - non-editable, shows document name
              const titleValue = file.transmittalTitle ?? file.name;

              // Description field - editable, blank by default, use transmittal override if available
              const currentDescription = editingDescription[file.id] ?? file.transmittalDescription ?? '';
              const originalDescription = file.transmittalDescription ?? '';
              const isSavingDescription = savingDescription[file.id] || false;
              const hasDescriptionError = !!descriptionError[file.id];

              // Revision field - use transmittal override if available (don't show document version count)
              const currentRevision = editingRevision[file.id] ?? file.transmittalRevision ?? '';
              const originalRevision = file.transmittalRevision ?? '';
              const isSavingRevision = savingRevision[file.id] || false;
              const hasRevisionError = !!revisionError[file.id];

              return (
                <TableRow key={file.id}>
                  {/* Drawing No. Column */}
                  <TableCell className="w-[120px] px-4 py-4 whitespace-nowrap">
                    <div className="relative">
                      <input
                        type="text"
                        value={currentDrawingNo}
                        onChange={(e) => handleDrawingNoChange(file.id, e.target.value)}
                        onBlur={() => handleDrawingNoBlur(file.id, originalDrawingNo)}
                        disabled={isSavingDrawingNo}
                        maxLength={6}
                        placeholder="------"
                        className={`w-full px-2 py-1 text-sm border rounded-md focus:outline-none focus:ring-2 transition-colors ${
                          file.isDrawingNoOverridden ? 'bg-blue-50 border-blue-300' : ''
                        } ${
                          hasDrawingNoError
                            ? 'border-red-300 focus:ring-red-500'
                            : isSavingDrawingNo
                            ? 'border-gray-200 bg-gray-50 cursor-wait'
                            : 'border-gray-300 focus:ring-blue-500 hover:border-gray-400'
                        }`}
                        title={hasDrawingNoError ? drawingNoError[file.id] : file.isDrawingNoOverridden ? `Override: ${file.transmittalDrawingNo}` : 'Max 6 alphanumeric characters'}
                      />
                      {isSavingDrawingNo && (
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                        </div>
                      )}
                      {file.isDrawingNoOverridden && !isSavingDrawingNo && (
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                          <Edit3 className="w-3 h-3 text-blue-600" />
                        </div>
                      )}
                    </div>
                    {hasDrawingNoError && (
                      <p className="text-xs text-red-600 mt-1">{drawingNoError[file.id]}</p>
                    )}
                  </TableCell>

                  {/* Title Column (Non-editable) */}
                  <TableCell className="w-auto min-w-[250px] px-4 py-4">
                    <div className="flex flex-col">
                      <div className="truncate text-sm text-gray-900 font-medium" title={titleValue}>
                        {titleValue}
                      </div>
                      <div className="truncate text-xs text-gray-500 mt-0.5" title={file.folderPath}>
                        {file.folderPath}
                      </div>
                    </div>
                  </TableCell>

                  {/* Description Column (Editable) */}
                  <TableCell className="w-auto min-w-[200px] px-4 py-4 whitespace-nowrap">
                    <div className="relative">
                      <input
                        type="text"
                        value={currentDescription}
                        onChange={(e) => handleDescriptionChange(file.id, e.target.value)}
                        onBlur={() => handleDescriptionBlur(file.id, originalDescription)}
                        disabled={isSavingDescription}
                        placeholder="Enter description..."
                        className={`w-full px-2 py-1 text-sm border rounded-md focus:outline-none focus:ring-2 transition-colors ${
                          file.isDescriptionOverridden ? 'bg-blue-50 border-blue-300' : ''
                        } ${
                          hasDescriptionError
                            ? 'border-red-300 focus:ring-red-500'
                            : isSavingDescription
                            ? 'border-gray-200 bg-gray-50 cursor-wait'
                            : 'border-gray-300 focus:ring-blue-500 hover:border-gray-400'
                        }`}
                        title={hasDescriptionError ? descriptionError[file.id] : file.isDescriptionOverridden ? `Override: ${file.transmittalDescription}` : 'Enter description'}
                      />
                      {isSavingDescription && (
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                        </div>
                      )}
                      {file.isDescriptionOverridden && !isSavingDescription && (
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                          <Edit3 className="w-3 h-3 text-blue-600" />
                        </div>
                      )}
                    </div>
                    {hasDescriptionError && (
                      <p className="text-xs text-red-600 mt-1">{descriptionError[file.id]}</p>
                    )}
                  </TableCell>

                  {/* Revision Column */}
                  <TableCell className="w-[120px] px-4 py-4 whitespace-nowrap text-sm">
                    <div className="relative">
                      <input
                        type="text"
                        value={currentRevision}
                        onChange={(e) => handleRevisionChange(file.id, e.target.value)}
                        onBlur={() => handleRevisionBlur(file.id, originalRevision)}
                        disabled={isSavingRevision}
                        maxLength={4}
                        placeholder="----"
                        className={`w-full px-2 py-1 text-sm border rounded-md text-center focus:outline-none focus:ring-2 transition-colors ${
                          file.isRevisionOverridden ? 'bg-blue-50 border-blue-300' : ''
                        } ${
                          hasRevisionError
                            ? 'border-red-300 focus:ring-red-500'
                            : isSavingRevision
                            ? 'border-gray-200 bg-gray-50 cursor-wait'
                            : 'border-gray-300 focus:ring-blue-500 hover:border-gray-400'
                        }`}
                        title={hasRevisionError ? revisionError[file.id] : file.isRevisionOverridden ? `Override: ${file.transmittalRevision}\nOriginal: ${file.revisionCount}` : 'Max 4 characters (e.g., "RevA", "R01", "3.2")'}
                      />
                      {isSavingRevision && (
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                        </div>
                      )}
                      {file.isRevisionOverridden && !isSavingRevision && (
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                          <Edit3 className="w-3 h-3 text-blue-600" />
                        </div>
                      )}
                    </div>
                    {hasRevisionError && (
                      <p className="text-xs text-red-600 mt-1">{revisionError[file.id]}</p>
                    )}
                  </TableCell>

                  {/* Actions Column */}
                  <TableCell className="w-[80px] px-4 py-4 whitespace-nowrap text-center">
                    <button
                      onClick={() => onDeleteRow(file.isStandalone ? file.standaloneId! : file.id, !!file.isStandalone)}
                      className="inline-flex items-center justify-center p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Delete row"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
