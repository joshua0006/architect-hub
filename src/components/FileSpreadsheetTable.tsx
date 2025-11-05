import React from 'react';
import { ChevronUp, ChevronDown, ExternalLink, Download } from 'lucide-react';
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
}

export default function FileSpreadsheetTable({
  files,
  sortColumn,
  sortDirection,
  onSort,
  onFileClick,
  onDownload
}: FileSpreadsheetTableProps) {
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

  return (
    <div className="bg-white rounded-lg shadow">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 hover:bg-gray-50 sticky top-0 z-10">
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
              <TableCell colSpan={3} className="px-4 py-12 text-center text-gray-500">
                No files found
              </TableCell>
            </TableRow>
          ) : (
            files.map((file) => (
              <TableRow key={file.id}>
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
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
