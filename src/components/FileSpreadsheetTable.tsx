import React from 'react';
import { ChevronUp, ChevronDown, ExternalLink, Download } from 'lucide-react';
import { Document } from '../types';

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

  const getFileTypeColor = (type: string) => {
    switch (type) {
      case 'pdf':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'image':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'dwg':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th
              className="w-[30%] min-w-[250px] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => onSort('name')}
            >
              <div className="flex items-center space-x-1">
                <span>File Name</span>
                {renderSortIcon('name')}
              </div>
            </th>
            <th
              className="w-[25%] min-w-[180px] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => onSort('folderPath')}
            >
              <div className="flex items-center space-x-1">
                <span>Folder Name</span>
                {renderSortIcon('folderPath')}
              </div>
            </th>
            <th
              className="w-[100px] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => onSort('type')}
            >
              <div className="flex items-center space-x-1">
                <span>Type</span>
                {renderSortIcon('type')}
              </div>
            </th>
            <th
              className="w-[180px] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => onSort('dateModified')}
            >
              <div className="flex items-center space-x-1">
                <span>Date Modified</span>
                {renderSortIcon('dateModified')}
              </div>
            </th>
            <th className="w-[220px] px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {files.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                No files found
              </td>
            </tr>
          ) : (
            files.map((file) => (
              <tr key={file.id} className="hover:bg-gray-50 transition-colors">
                <td className="w-[30%] min-w-[250px] px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => onFileClick(file.id)}
                    className="text-blue-600 hover:text-blue-800 hover:underline text-left font-medium truncate max-w-full block"
                    title={file.name}
                  >
                    {file.name}
                  </button>
                </td>
                <td className="w-[25%] min-w-[180px] px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  <div className="truncate max-w-full" title={file.folderPath}>
                    {file.folderPath}
                  </div>
                </td>
                <td className="w-[100px] px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-medium rounded border ${getFileTypeColor(file.type)}`}>
                    {file.type.toUpperCase()}
                  </span>
                </td>
                <td className="w-[180px] px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                  {new Date(file.dateModified).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </td>
                <td className="w-[220px] px-6 py-4 whitespace-nowrap text-sm">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => onFileClick(file.id)}
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                      title="Open file"
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      <span>Open</span>
                    </button>
                    <button
                      onClick={() => onDownload(file)}
                      className="inline-flex items-center px-3 py-1.5 border border-blue-300 rounded-md text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                      title="Download file"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      <span>Download</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
