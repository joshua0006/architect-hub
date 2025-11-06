import React, { useState } from 'react';
import { ChevronUp, ChevronDown, ExternalLink, Download, Loader2 } from 'lucide-react';
import { Document } from '../types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface FileRowData {
  id: string;
  drawingNo: string;
  name: string;
  folderPath: string;
  type: string;
  dateModified: string;
  url: string;
  document: Document;
}

interface FileSpreadsheetTableProps {
  files: FileRowData[];
  sortColumn: string;
  sortDirection: 'asc' | 'desc';
  onSort: (column: string) => void;
  onFileClick: (fileId: string) => void;
  onDownload: (file: FileRowData) => void;
  onUpdateDrawingNo: (fileId: string, drawingNo: string) => Promise<void>;
}

export default function FileSpreadsheetTable({
  files,
  sortColumn,
  sortDirection,
  onSort,
  onFileClick,
  onDownload,
  onUpdateDrawingNo
}: FileSpreadsheetTableProps) {
  const [editingDrawingNo, setEditingDrawingNo] = useState<{[key: string]: string}>({});
  const [savingDrawingNo, setSavingDrawingNo] = useState<{[key: string]: boolean}>({});
  const [drawingNoError, setDrawingNoError] = useState<{[key: string]: string}>({});

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

      await onUpdateDrawingNo(fileId, newValue);

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

  return (
    <div className="bg-white rounded-lg shadow">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 hover:bg-gray-50 sticky top-0 z-10">
            <TableHead
              className="w-[120px] px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => onSort('drawingNo')}
            >
              <div className="flex items-center space-x-1">
                <span>Drawing No.</span>
                {renderSortIcon('drawingNo')}
              </div>
            </TableHead>
            <TableHead
              className="w-auto min-w-[200px] px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => onSort('name')}
            >
              <div className="flex items-center space-x-1">
                <span>File Name</span>
                {renderSortIcon('name')}
              </div>
            </TableHead>
            <TableHead
              className="w-auto min-w-[180px] px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => onSort('folderPath')}
            >
              <div className="flex items-center space-x-1">
                <span>Folder Name</span>
                {renderSortIcon('folderPath')}
              </div>
            </TableHead>
            <TableHead className="w-[100px] px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {files.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} className="px-4 py-12 text-center text-gray-500">
                No files found
              </TableCell>
            </TableRow>
          ) : (
            files.map((file) => {
              const currentDrawingNo = editingDrawingNo[file.id] ?? file.drawingNo ?? '';
              const isSaving = savingDrawingNo[file.id] || false;
              const hasError = !!drawingNoError[file.id];

              return (
                <TableRow key={file.id}>
                  <TableCell className="w-[120px] px-4 py-4 whitespace-nowrap">
                    <div className="relative">
                      <input
                        type="text"
                        value={currentDrawingNo}
                        onChange={(e) => handleDrawingNoChange(file.id, e.target.value)}
                        onBlur={() => handleDrawingNoBlur(file.id, file.drawingNo ?? '')}
                        disabled={isSaving}
                        maxLength={6}
                        placeholder="------"
                        className={`w-full px-2 py-1 text-sm border rounded-md focus:outline-none focus:ring-2 transition-colors ${
                          hasError
                            ? 'border-red-300 focus:ring-red-500'
                            : isSaving
                            ? 'border-gray-200 bg-gray-50 cursor-wait'
                            : 'border-gray-300 focus:ring-blue-500 hover:border-gray-400'
                        }`}
                        title={hasError ? drawingNoError[file.id] : 'Max 6 alphanumeric characters'}
                      />
                      {isSaving && (
                        <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                          <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                        </div>
                      )}
                    </div>
                    {hasError && (
                      <p className="text-xs text-red-600 mt-1">{drawingNoError[file.id]}</p>
                    )}
                  </TableCell>
                  <TableCell className="w-auto min-w-[200px] px-4 py-4 whitespace-nowrap">
                    <button
                      onClick={() => onFileClick(file.id)}
                      className="text-blue-600 hover:text-blue-800 hover:underline text-left font-medium truncate max-w-full block"
                      title={file.name}
                    >
                      {file.name}
                    </button>
                  </TableCell>
                  <TableCell className="w-auto min-w-[180px] px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                    <div className="truncate max-w-full" title={file.folderPath}>
                      {file.folderPath}
                    </div>
                  </TableCell>
                  <TableCell className="w-[100px] px-4 py-4 whitespace-nowrap text-sm">
                    <TooltipProvider>
                      <div className="flex items-center space-x-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => onFileClick(file.id)}
                              className="inline-flex items-center justify-center p-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                              aria-label="Open file"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Open file</p>
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => onDownload(file)}
                              className="inline-flex items-center justify-center p-2 border border-blue-300 rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                              aria-label="Download file"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Download file</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
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
