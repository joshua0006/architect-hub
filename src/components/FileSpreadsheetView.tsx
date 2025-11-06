import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Download, FileSpreadsheet, ArrowLeft, AlertCircle, RefreshCw, Filter, ChevronDown, X } from 'lucide-react';
import { Document, Folder } from '../types';
import { documentService } from '../services/documentService';
import { folderService } from '../services/folderService';
import { projectService } from '../services';
import FileSpreadsheetTable, { FileRowData } from './FileSpreadsheetTable';
import FolderTreeSelect from './FolderTreeSelect';
import * as XLSX from 'xlsx';
import { buildFullPath } from '../utils/folderTree';

export default function FileSpreadsheetView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [projectName, setProjectName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFolder, setFilterFolder] = useState<string>('all');
  const [sortColumn, setSortColumn] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const mountedRef = useRef(true);

  // Timeout wrapper function
  const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
      )
    ]);
  };

  // Fetch project, documents, and folders
  useEffect(() => {
    // Set mounted ref
    mountedRef.current = true;

    const fetchData = async () => {
      if (!projectId) {
        if (mountedRef.current) {
          setLoading(false);
          setError('No project ID provided');
        }
        return;
      }

      try {
        if (mountedRef.current) {
          setLoading(true);
          setError(null);
        }

        // Fetch project, folders, and all documents in parallel with timeout
        // Using optimized single query for documents (previously N+1 queries)
        const [project, allFolders, allDocuments] = await withTimeout(
          Promise.all([
            projectService.getById(projectId),
            folderService.getByProjectId(projectId),
            documentService.getByProjectId(projectId)  // ✅ Single query instead of N+1
          ]),
          15000
        );

        if (mountedRef.current) {
          if (project) {
            setProjectName(project.name);
          }
          setFolders(allFolders);
          setDocuments(allDocuments);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        if (mountedRef.current) {
          const errorMessage = error instanceof Error
            ? error.message
            : 'Failed to load files. Please try again.';
          setError(errorMessage);
          setLoading(false);
        }
      }
    };

    fetchData();

    // Cleanup function
    return () => {
      mountedRef.current = false;
    };
  }, [projectId]);

  // Create folder map for lookups and build full paths
  const folderPathMap = useMemo(() => {
    const map = new Map<string, string>();
    const folderMap = new Map<string, Folder>();

    // Create folder lookup map
    folders.forEach(folder => folderMap.set(folder.id, folder));

    // Build full path for each folder
    folders.forEach(folder => {
      const fullPath = buildFullPath(folder.id, folderMap);
      map.set(folder.id, fullPath);
    });

    map.set('', '/'); // Root folder
    return map;
  }, [folders]);

  // Calculate filter button display text and count
  const filterDisplayInfo = useMemo(() => {
    if (filterFolder === 'all') {
      return {
        name: 'All Folders',
        count: documents.length
      };
    }

    if (filterFolder === '') {
      return {
        name: 'Root',
        count: documents.filter(doc => !doc.folderId).length
      };
    }

    const folder = folders.find(f => f.id === filterFolder);
    const count = documents.filter(doc => doc.folderId === filterFolder).length;

    return {
      name: folder?.name || 'Unknown Folder',
      count
    };
  }, [filterFolder, folders, documents]);

  // Transform documents to file rows with folder paths
  const fileRows: FileRowData[] = useMemo(() => {
    return documents.map(doc => ({
      id: doc.id,
      drawingNo: doc.drawingNo || '',
      name: doc.name,
      folderPath: folderPathMap.get(doc.folderId) || '/',  // ✅ O(1) Map lookup
      type: doc.type,
      dateModified: doc.dateModified,
      url: doc.url,
      document: doc
    }));
  }, [documents, folderPathMap]);

  // Filter and search
  const filteredFiles = useMemo(() => {
    let result = fileRows;

    // Apply folder filter
    if (filterFolder !== 'all') {
      result = result.filter(file => file.document.folderId === filterFolder);
    }

    // Apply search
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(file =>
        file.name.toLowerCase().includes(term) ||
        file.folderPath.toLowerCase().includes(term)
      );
    }

    return result;
  }, [fileRows, searchTerm, filterFolder]);

  // Sort files
  const sortedFiles = useMemo(() => {
    const sorted = [...filteredFiles];

    sorted.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortColumn) {
        case 'drawingNo':
          aValue = (a.drawingNo || '').toLowerCase();
          bValue = (b.drawingNo || '').toLowerCase();
          break;
        case 'name':
          aValue = a.name.toLowerCase();
          bValue = b.name.toLowerCase();
          break;
        case 'folderPath':
          aValue = a.folderPath.toLowerCase();
          bValue = b.folderPath.toLowerCase();
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredFiles, sortColumn, sortDirection]);

  // Handle sorting
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Handle file click - open in document viewer
  const handleFileClick = (fileId: string) => {
    const file = documents.find(doc => doc.id === fileId);
    if (file) {
      // Open document viewer in same or new tab based on user preference
      navigate(`/${projectId}/documents/${fileId}`);
    }
  };

  // Handle download
  const handleDownload = (file: FileRowData) => {
    // Create a temporary link and trigger download
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle drawing number update
  const handleUpdateDrawingNo = async (fileId: string, drawingNo: string) => {
    const file = documents.find(doc => doc.id === fileId);
    if (!file) {
      throw new Error('File not found');
    }

    try {
      await documentService.update(file.folderId, fileId, { drawingNo });

      // Update local state to reflect the change
      setDocuments(prevDocs =>
        prevDocs.map(doc =>
          doc.id === fileId ? { ...doc, drawingNo } : doc
        )
      );
    } catch (error) {
      console.error('Error updating drawing number:', error);
      throw error;
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = sortedFiles.map(file => ({
      'Drawing No.': file.drawingNo || '',
      'File Name': file.name,
      'Folder Name': file.folderPath
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Files');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 15 }, // Drawing No.
      { wch: 40 }, // File Name
      { wch: 30 }  // Folder Path
    ];

    XLSX.writeFile(workbook, `${projectName || 'project'}-files.xlsx`);
  };

  // Export to CSV
  const handleExportCSV = () => {
    const exportData = sortedFiles.map(file => ({
      'Drawing No.': file.drawingNo || '',
      'File Name': file.name,
      'Folder Name': file.folderPath
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const csv = XLSX.utils.sheet_to_csv(worksheet);

    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${projectName || 'project'}-files.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  // Handle retry
  const handleRetry = () => {
    setError(null);
    setLoading(true);
    // Trigger re-fetch by updating a dependency (we'll re-mount the effect)
    window.location.reload();
  };

  // Folder tree options are already generated above with file counts
  // No need for separate uniqueFolders calculation

  // Loading state
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading files...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md mx-auto">
          <div className="bg-red-50 rounded-full p-3 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Failed to Load Files</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="flex items-center justify-center space-x-3">
            <button
              onClick={handleRetry}
              className="inline-flex items-center px-4 py-2 border border-blue-500 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </button>
            <button
              onClick={() => navigate(`/${projectId}/overview`)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Project
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col">
      <div className="flex flex-col h-full max-w-7xl mx-auto w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-shrink-0 p-6 pb-4"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate(`/${projectId}/overview`)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Back to project"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <div className="flex items-center space-x-2">
                  <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                  <h1 className="text-2xl font-semibold text-gray-900">
                    Files Spreadsheet
                  </h1>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {projectName} - {sortedFiles.length} file{sortedFiles.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Export buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handleExportCSV}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </button>
              <button
                onClick={handleExportExcel}
                className="inline-flex items-center px-4 py-2 border border-blue-500 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                <Download className="w-4 h-4 mr-2" />
                Export Excel
              </button>
            </div>
          </div>

          {/* Search and Filter Bar */}
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search files by name or folder name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex items-center gap-2">
              {/* Compact Filter Button */}
              <button
                onClick={() => setIsFilterOpen(true)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 whitespace-nowrap"
              >
                <Filter className="w-4 h-4" />
                <span>Filter: {filterDisplayInfo.name} ({filterDisplayInfo.count})</span>
                <ChevronDown className="w-4 h-4" />
              </button>

              {/* Clear Filter Button - Only show when filter is active */}
              {filterFolder !== 'all' && (
                <button
                  onClick={() => setFilterFolder('all')}
                  className="px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700 hover:text-gray-900 whitespace-nowrap"
                >
                  Remove Filter
                </button>
              )}
            </div>
          </div>
        </motion.div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex-1 min-h-0 px-6"
        >
          <div className="h-full overflow-auto">
            <FileSpreadsheetTable
              files={sortedFiles}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              onFileClick={handleFileClick}
              onDownload={handleDownload}
              onUpdateDrawingNo={handleUpdateDrawingNo}
            />
          </div>
        </motion.div>

        {/* Results summary */}
        {searchTerm || filterFolder !== 'all' ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-shrink-0 p-6 pt-4 text-center text-sm text-gray-500"
          >
            Showing {sortedFiles.length} of {fileRows.length} total files
          </motion.div>
        ) : null}

        {/* Folder Filter Modal */}
        <FolderTreeSelect
          folders={folders}
          documents={documents}
          selectedFolderId={filterFolder}
          onFolderSelect={setFilterFolder}
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
        />
      </div>
    </div>
  );
}
