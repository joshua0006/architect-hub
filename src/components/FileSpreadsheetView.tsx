import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Download, FileSpreadsheet, ArrowLeft, AlertCircle, RefreshCw, Filter, ChevronDown, X, History, FilePlus } from 'lucide-react';
import { Document, Folder, TransmittalData, TransmittalHistoryEntry, StandaloneTransmittalEntry } from '../types';
import { documentService } from '../services/documentService';
import { folderService } from '../services/folderService';
import { projectService } from '../services';
import { transmittalService } from '../services/transmittalService';
import FileSpreadsheetTable, { FileRowData } from './FileSpreadsheetTable';
import FolderTreeSelect from './FolderTreeSelect';
import * as XLSX from 'xlsx';
import { buildFullPath } from '../utils/folderTree';
import { useAuth } from '../contexts/AuthContext';

// Helper function to format time ago
const formatTimeAgo = (date: Date): string => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval === 1 ? '' : 's'} ago`;
    }
  }

  return 'just now';
};

export default function FileSpreadsheetView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [transmittalData, setTransmittalData] = useState<Map<string, TransmittalData>>(new Map());
  const [standaloneEntries, setStandaloneEntries] = useState<StandaloneTransmittalEntry[]>([]);
  const [projectName, setProjectName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFolder, setFilterFolder] = useState<string>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportType, setExportType] = useState<'csv' | 'excel'>('excel');
  const [exportColumns, setExportColumns] = useState({
    drawingNo: true,
    title: true,
    description: true,
    revisions: true
  });
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<TransmittalHistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showAddRowDialog, setShowAddRowDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{id: string, isStandalone: boolean} | null>(null);
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

        // Fetch project, folders, documents, transmittal data, and standalone entries in parallel with timeout
        // Using optimized single query for documents (previously N+1 queries)
        const [project, allFolders, allDocuments, transmittalMap, standalone] = await withTimeout(
          Promise.all([
            projectService.getById(projectId),
            folderService.getByProjectId(projectId),
            documentService.getByProjectId(projectId),  // ✅ Single query instead of N+1
            transmittalService.getAllTransmittalData(projectId),  // ✅ Batch load transmittal data
            transmittalService.getAllStandaloneEntries(projectId)  // ✅ Load standalone entries
          ]),
          15000
        );

        if (mountedRef.current) {
          if (project) {
            setProjectName(project.name);
          }
          setFolders(allFolders);
          setDocuments(allDocuments);
          setTransmittalData(transmittalMap);
          setStandaloneEntries(standalone.filter(entry => !entry._deleted));  // Filter out deleted entries
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

  // Build folder hierarchy order for hierarchical sorting
  const folderHierarchyOrder = useMemo(() => {
    const map = new Map<string, number>();
    const folderMap = new Map<string, Folder>();

    // Create folder lookup
    folders.forEach(folder => folderMap.set(folder.id, folder));

    // Build hierarchical order (parent folders before children, alphabetical)
    let order = 0;

    const addFolderAndChildren = (folderId: string | undefined, depth: number) => {
      // Find all folders at this level (matching parentId)
      const childFolders = folders
        .filter(f => f.parentId === folderId)
        .sort((a, b) => a.name.localeCompare(b.name)); // Alphabetical

      childFolders.forEach(folder => {
        map.set(folder.id, order++);
        addFolderAndChildren(folder.id, depth + 1); // Recurse for children
      });
    };

    // Start with root folders (no parentId or parentId === undefined)
    addFolderAndChildren(undefined, 0);

    // Map the empty string to -1 for root-level files
    map.set('', -1);

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

  // Transform documents to file rows with folder paths and transmittal data
  const fileRows: FileRowData[] = useMemo(() => {
    // Document-based rows
    const documentRows = documents.map(doc => {
      const transmittal = transmittalData.get(doc.id);

      return {
        id: doc.id,
        drawingNo: doc.drawingNo || '',
        name: doc.name,
        folderPath: folderPathMap.get(doc.folderId) || '/',  // ✅ O(1) Map lookup
        type: doc.type,
        dateModified: doc.dateModified,
        url: doc.url,
        document: doc,
        revisionCount: doc.version,
        // Transmittal overrides
        transmittalDrawingNo: transmittal?.drawingNo,
        transmittalTitle: transmittal?.title,
        transmittalDescription: transmittal?.description,
        transmittalRevision: transmittal?.revision,
        isDrawingNoOverridden: !!(transmittal?.drawingNo),
        isTitleOverridden: !!(transmittal?.title),
        isDescriptionOverridden: !!(transmittal?.description),
        isRevisionOverridden: !!(transmittal?.revision),
        isStandalone: false
      };
    });

    // Standalone entry rows
    const standaloneRows = standaloneEntries.map(entry => {
      return {
        id: entry.id,
        drawingNo: entry.drawingNo || '',
        name: entry.title || 'Untitled Entry',
        folderPath: '/',
        type: 'standalone',
        dateModified: entry.createdAt,
        url: '',
        document: undefined,
        revisionCount: 0,
        transmittalDrawingNo: entry.drawingNo,
        transmittalTitle: entry.title,
        transmittalDescription: entry.description,
        transmittalRevision: entry.revision,
        isDrawingNoOverridden: false,
        isTitleOverridden: false,
        isDescriptionOverridden: false,
        isRevisionOverridden: false,
        isStandalone: true,
        standaloneId: entry.id
      };
    });

    // Merge and return both
    return [...documentRows, ...standaloneRows];
  }, [documents, folderPathMap, transmittalData, standaloneEntries]);

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

  // Sort files hierarchically: Folder hierarchy (A-Z with parent-child), then file name (A-Z)
  const sortedFiles = useMemo(() => {
    const sorted = [...filteredFiles];

    sorted.sort((a, b) => {
      const aFolderId = a.document?.folderId || '';
      const bFolderId = b.document?.folderId || '';

      // Get folder hierarchy order
      const aFolderOrder = folderHierarchyOrder.get(aFolderId) ?? 999999;
      const bFolderOrder = folderHierarchyOrder.get(bFolderId) ?? 999999;

      // Primary: Sort by folder hierarchy
      if (aFolderOrder !== bFolderOrder) {
        return aFolderOrder - bFolderOrder;
      }

      // Secondary: Sort by file name (A-Z) within same folder
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });

    return sorted;
  }, [filteredFiles, folderHierarchyOrder]);

  // Handle file click - open in document viewer in new tab
  const handleFileClick = (fileId: string) => {
    const file = documents.find(doc => doc.id === fileId);
    if (file) {
      // Construct URL based on whether file has a folder
      const url = file.folderId
        ? `/documents/projects/${projectId}/folders/${file.folderId}/files/${fileId}`
        : `/documents/projects/${projectId}/files/${fileId}`;
      // Open in new tab
      window.open(url, '_blank');
    }
  };

  // Handle transmittal data update
  const handleUpdateTransmittal = async (
    fileId: string,
    field: 'drawingNo' | 'title' | 'description' | 'revision',
    value: string
  ) => {
    if (!projectId || !user) {
      throw new Error('Missing project ID or user');
    }

    // Get document name for history tracking
    const document = documents.find(doc => doc.id === fileId);
    const documentName = document?.name || 'Unknown Document';

    try {
      const updates: any = {};
      updates[field] = value;

      await transmittalService.updateTransmittalData(
        projectId,
        fileId,
        documentName,
        user.id,
        user.displayName || 'Unknown User',
        updates
      );

      // Update local state to reflect the change
      setTransmittalData(prevData => {
        const newData = new Map(prevData);
        const existing = newData.get(fileId) || {
          documentId: fileId,
          projectId: projectId
        };

        newData.set(fileId, {
          ...existing,
          [field]: value,
          editedAt: new Date().toISOString(),
          editedBy: user.id,
          editedByName: user.displayName || 'Unknown User'
        });

        return newData;
      });
    } catch (error) {
      console.error('Error updating transmittal data:', error);
      throw error;
    }
  };

  // Handle delete row (show confirmation dialog)
  const handleDeleteRow = (rowId: string, isStandalone: boolean) => {
    setDeleteTarget({ id: rowId, isStandalone });
    setShowDeleteConfirm(true);
  };

  // Confirm delete and execute
  const confirmDelete = async () => {
    if (!deleteTarget || !projectId) return;

    try {
      if (deleteTarget.isStandalone) {
        await transmittalService.deleteStandaloneEntry(projectId, deleteTarget.id);
        setStandaloneEntries(prev => prev.filter(e => e.id !== deleteTarget.id));
      }
      // For document-linked rows, we don't actually delete them from the transmittal view
      // as they represent real documents
    } catch (error) {
      console.error('Error deleting row:', error);
    } finally {
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    }
  };

  // Handle add row (create standalone entry)
  const handleAddRow = async (data: {drawingNo?: string, title?: string, description?: string, revision?: string}) => {
    if (!projectId || !user) return;

    try {
      const newEntry = await transmittalService.createStandaloneEntry(
        projectId,
        user.id,
        user.displayName || 'Unknown User',
        data
      );
      setStandaloneEntries(prev => [...prev, newEntry]);
      setShowAddRowDialog(false);
    } catch (error) {
      console.error('Error adding row:', error);
    }
  };

  // Open history dialog and load history
  const handleViewHistory = async () => {
    if (!projectId) return;

    setShowHistoryDialog(true);
    setLoadingHistory(true);

    try {
      const history = await transmittalService.getProjectHistory(projectId);
      setHistoryEntries(history);
    } catch (error) {
      console.error('Error loading history:', error);
      setHistoryEntries([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Open export dialog
  const handleOpenExportDialog = (type: 'csv' | 'excel') => {
    setExportType(type);
    setShowExportDialog(true);
  };

  // Handle export with selected columns
  const handleExport = () => {
    const exportData = sortedFiles.map(file => {
      const row: any = {};

      if (exportColumns.drawingNo) {
        row['Drawing No.'] = file.transmittalDrawingNo || file.drawingNo || '';
      }
      if (exportColumns.title) {
        row['Title'] = file.transmittalTitle || file.name;
      }
      if (exportColumns.description) {
        row['Description'] = file.transmittalDescription || '';
      }
      if (exportColumns.revisions) {
        row['No. of Revisions'] = file.transmittalRevision || file.revisionCount.toString();
      }

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);

    // Set column widths dynamically based on selected columns
    const colWidths = [];
    if (exportColumns.drawingNo) colWidths.push({ wch: 15 });
    if (exportColumns.title) colWidths.push({ wch: 40 });
    if (exportColumns.description) colWidths.push({ wch: 40 });
    if (exportColumns.revisions) colWidths.push({ wch: 15 });
    worksheet['!cols'] = colWidths;

    if (exportType === 'excel') {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Transmittal');
      XLSX.writeFile(workbook, `${projectName || 'project'}-transmittal.xlsx`);
    } else {
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      const blob = new Blob([csv], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${projectName || 'project'}-transmittal.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    }

    setShowExportDialog(false);
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
      <div className="flex flex-col h-full w-full">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-shrink-0 px-4 py-6 pb-4"
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
                    Transmittal
                  </h1>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {projectName} - {sortedFiles.length} file{sortedFiles.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {/* Add Row, History and Export buttons */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowAddRowDialog(true)}
                className="inline-flex items-center px-4 py-2 border border-green-500 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 transition-colors"
                title="Add new row"
              >
                <FilePlus className="w-4 h-4 mr-2" />
                Add Row
              </button>
              <button
                onClick={handleViewHistory}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                title="View transmittal change history"
              >
                <History className="w-4 h-4 mr-2" />
                History
              </button>
              <button
                onClick={() => handleOpenExportDialog('csv')}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </button>
              <button
                onClick={() => handleOpenExportDialog('excel')}
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
          className="flex-1 min-h-0 px-4"
        >
          <div className="h-full overflow-auto">
            <FileSpreadsheetTable
              files={sortedFiles}
              onFileClick={handleFileClick}
              onUpdateDrawingNo={handleUpdateTransmittal}
              onUpdateTransmittal={handleUpdateTransmittal}
              onDeleteRow={handleDeleteRow}
            />
          </div>
        </motion.div>

        {/* Results summary */}
        {searchTerm || filterFolder !== 'all' ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-shrink-0 px-4 py-6 pt-4 text-center text-sm text-gray-500"
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

        {/* Export Column Selection Dialog */}
        {showExportDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
            >
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">
                  Export {exportType === 'excel' ? 'Excel' : 'CSV'}
                </h2>
                <p className="text-sm text-gray-600 mb-4">
                  Select columns to include in the export
                </p>

                {/* Column Selection */}
                <div className="space-y-3 mb-6">
                  <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={exportColumns.drawingNo}
                      onChange={(e) => setExportColumns(prev => ({ ...prev, drawingNo: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Drawing No.</span>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={exportColumns.title}
                      onChange={(e) => setExportColumns(prev => ({ ...prev, title: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Title</span>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={exportColumns.description}
                      onChange={(e) => setExportColumns(prev => ({ ...prev, description: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Description</span>
                  </label>

                  <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={exportColumns.revisions}
                      onChange={(e) => setExportColumns(prev => ({ ...prev, revisions: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">No. of Revisions</span>
                  </label>
                </div>

                {/* Selected Count */}
                <div className="mb-4 text-xs text-gray-500">
                  {Object.values(exportColumns).filter(Boolean).length} of 4 columns selected
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end space-x-3">
                  <button
                    onClick={() => setShowExportDialog(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExport}
                    disabled={Object.values(exportColumns).filter(Boolean).length === 0}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export {exportType === 'excel' ? 'Excel' : 'CSV'}</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* History Dialog */}
        {showHistoryDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <History className="w-6 h-6 text-blue-600" />
                  <h2 className="text-xl font-semibold text-gray-900">
                    Transmittal Change History
                  </h2>
                </div>
                <button
                  onClick={() => setShowHistoryDialog(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {loadingHistory ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : historyEntries.length === 0 ? (
                  <div className="text-center py-12">
                    <History className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500 text-sm">No changes recorded yet</p>
                    <p className="text-gray-400 text-xs mt-2">
                      Changes will appear here when transmittal fields are edited
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {historyEntries.map((entry, index) => {
                      const timestamp = new Date(entry.timestamp);
                      const timeAgo = formatTimeAgo(timestamp);

                      return (
                        <motion.div
                          key={entry.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                        >
                          {/* Document Name */}
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                              <h3 className="font-medium text-gray-900">{entry.documentName}</h3>
                            </div>
                          </div>

                          {/* Changes */}
                          <div className="space-y-2 mb-3">
                            {entry.changes.map((change, changeIndex) => {
                              const fieldLabels = {
                                drawingNo: 'Drawing No.',
                                title: 'Title',
                                description: 'Description',
                                revision: 'Revision'
                              };

                              return (
                                <div key={changeIndex} className="flex items-start space-x-2 text-sm">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                    {fieldLabels[change.field]}
                                  </span>
                                  <div className="flex-1">
                                    {change.oldValue && (
                                      <span className="text-gray-400 line-through">{change.oldValue}</span>
                                    )}
                                    {change.oldValue && <span className="text-gray-400 mx-1">→</span>}
                                    <span className="text-gray-900 font-medium">{change.newValue || '(cleared)'}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Editor and Timestamp */}
                          <div className="flex items-center space-x-2 text-xs text-gray-500">
                            <span>Edited by {entry.editedByName}</span>
                            <span>•</span>
                            <span title={timestamp.toLocaleString()}>{timeAgo}</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
                <p className="text-xs text-gray-500">
                  {historyEntries.length} {historyEntries.length === 1 ? 'change' : 'changes'} recorded
                </p>
                <button
                  onClick={() => setShowHistoryDialog(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Add Row Dialog */}
        {showAddRowDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-lg shadow-xl max-w-md w-full"
            >
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Add New Row</h2>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  handleAddRow({
                    drawingNo: formData.get('drawingNo') as string || undefined,
                    title: formData.get('title') as string || undefined,
                    description: formData.get('description') as string || undefined,
                    revision: formData.get('revision') as string || undefined
                  });
                }}>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Drawing No.</label>
                      <input type="text" name="drawingNo" maxLength={6} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                      <input type="text" name="title" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <input type="text" name="description" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Revision</label>
                      <input type="text" name="revision" maxLength={4} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
                    </div>
                  </div>
                  <div className="flex items-center justify-end space-x-3 mt-6">
                    <button type="button" onClick={() => setShowAddRowDialog(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                    <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700">Add Row</button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Delete Row?</h2>
              <p className="text-gray-600 mb-6">Are you sure you want to delete this row? This action cannot be undone.</p>
              <div className="flex items-center justify-end space-x-3">
                <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                <button onClick={confirmDelete} className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700">Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
