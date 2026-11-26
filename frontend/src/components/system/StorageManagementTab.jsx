import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  FiHardDrive, FiDatabase, FiServer, FiTrash2, FiRefreshCw,
  FiCheckCircle, FiAlertTriangle, FiFolder, FiFileText, FiLayers,
  FiActivity, FiZap, FiCheck, FiArrowRight, FiSearch, FiEye,
  FiGrid, FiList, FiExternalLink, FiX, FiImage, FiFile
} from 'react-icons/fi';
import { Card, Spinner, showToast, showSuccess, showError, confirmAction } from '../ui';
import { api } from '../../lib/api';
import { triggerDataSync, useRealtimeSync, fastDeepEqual } from '../../lib/realtimeSync';

export default function StorageManagementTab({ onNavigateToBackups }) {
  const [storage, setStorage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('overview'); // 'overview' | 'tables' | 'files'
  
  // Real Media Files Explorer states
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'largest' | 'smallest'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [previewFile, setPreviewFile] = useState(null);
  const [deletingPath, setDeletingPath] = useState(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 24;

  const inFlightRef = useRef(false);

  const loadStorage = useCallback(async (silent = false, signal, forceRefresh = false) => {
    const isSilent = silent === true;
    if (inFlightRef.current && isSilent) return;
    inFlightRef.current = true;
    if (!isSilent) setLoading(true);
    try {
      const data = await api.system.getStorage({ signal, refresh: forceRefresh });
      if (signal?.aborted) return;
      setStorage(prev => (fastDeepEqual(prev, data) ? prev : data));
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Failed to load system storage data:', err);
      if (!isSilent) showToast(err.message || 'Failed to load storage status', 'error');
    } finally {
      inFlightRef.current = false;
      if (!isSilent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStorage(false);
  }, [loadStorage]);

  useRealtimeSync((_source, signal) => {
    loadStorage(true, signal);
  }, [loadStorage], { module: 'storage' });

  const handleCleanAction = async (action, actionLabel) => {
    const confirmed = await confirmAction({
      title: `Confirm ${actionLabel}?`,
      text: `This will safely scan and clean redundant ${action} files from the server.`,
      confirmButtonText: 'Yes, Clean Now',
      cancelButtonText: 'Cancel',
      icon: 'warning',
    });

    if (confirmed) {
      setCleaning(true);
      try {
        const response = await api.system.cleanStorage(action);
        if (response.storage) {
          setStorage(response.storage);
        } else {
          triggerDataSync('storage');
          loadStorage(true, undefined, true);
        }

        showSuccess(
          'Maintenance Completed',
          `${response.result?.message || 'Cleaned successfully.'} Reclaimed: ${response.result?.reclaimed_formatted || '0 B'}`
        );
      } catch (err) {
        console.error('Failed storage cleanup:', err);
        showError('Cleanup Failed', err.message || 'Failed to complete storage maintenance.');
      } finally {
        setCleaning(false);
      }
    }
  };

  const handleDeleteFile = async (file, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!file?.relative_path || deletingPath) return;

    const confirmed = await confirmAction({
      title: 'Delete Media File?',
      text: `Are you sure you want to permanently delete "${file.name}" (${file.size_formatted}) from ${file.category_label || file.folder}? This action cannot be undone.`,
      confirmButtonText: 'Yes, Delete File',
      cancelButtonText: 'Cancel',
      icon: 'warning',
    });

    if (!confirmed) return;

    setDeletingPath(file.relative_path);
    try {
      const response = await api.system.deleteStorageFile(file.relative_path);
      if (previewFile?.relative_path === file.relative_path) {
        setPreviewFile(null);
      }
      if (response?.storage) {
        setStorage(response.storage);
      } else {
        loadStorage(true, undefined, true);
      }
      triggerDataSync('storage');
      showToast(
        `${response?.result?.message || 'File deleted.'} Reclaimed: ${response?.result?.reclaimed_formatted || file.size_formatted}`,
        'success'
      );
    } catch (err) {
      console.error('Failed to delete media file:', err);
      showError('Delete Failed', err.message || 'Unable to delete the selected media file.');
    } finally {
      setDeletingPath(null);
    }
  };

  const handleDeleteAllFiles = async () => {
    if (deletingAll || deletingPath || filteredFiles.length === 0) return;

    const targetPaths = filteredFiles.map(f => f.relative_path).filter(Boolean);
    if (targetPaths.length === 0) return;

    const activeCatLabel = selectedCategory === 'all'
      ? 'All Categories'
      : (uploads.categories?.[selectedCategory]?.label || selectedCategory);

    const confirmed = await confirmAction({
      title: `Delete All (${targetPaths.length}) Media Files?`,
      text: `Are you sure you want to permanently delete all ${targetPaths.length} currently shown media file(s) under "${activeCatLabel}"? This action cannot be undone.`,
      confirmButtonText: `Yes, Delete All (${targetPaths.length})`,
      cancelButtonText: 'Cancel',
      icon: 'warning',
    });

    if (!confirmed) return;

    setDeletingAll(true);
    try {
      const response = await api.system.deleteStorageFiles(targetPaths);
      setPreviewFile(null);
      if (response?.storage) {
        setStorage(response.storage);
      } else {
        loadStorage(true, undefined, true);
      }
      triggerDataSync('storage');
      showToast(
        `${response?.result?.message || `Deleted ${targetPaths.length} files.`} Reclaimed: ${response?.result?.reclaimed_formatted || '0 B'}`,
        'success'
      );
    } catch (err) {
      console.error('Failed to bulk delete media files:', err);
      showError('Bulk Delete Failed', err.message || 'Unable to delete the selected media files.');
    } finally {
      setDeletingAll(false);
    }
  };

  const disk = storage?.disk || {};
  const breakdown = storage?.breakdown || {};
  const db = breakdown.database || {};
  const uploads = breakdown.uploads || {};
  const backups = breakdown.backups || {};
  const logs = breakdown.logs || {};
  const cache = breakdown.cache || {};
  const health = storage?.health || { status: 'optimal' };
  const env = storage?.server_environment || {};

  const isHealthy = health.status === 'optimal';
  const isWarning = health.status === 'warning';

  // Filtered and sorted real media files
  const filteredFiles = useMemo(() => {
    let files = uploads.files || [];
    if (selectedCategory !== 'all') {
      files = files.filter(f => f.folder === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      files = files.filter(f =>
        f.name.toLowerCase().includes(q) ||
        (f.category_label && f.category_label.toLowerCase().includes(q)) ||
        (f.folder && f.folder.toLowerCase().includes(q)) ||
        (f.extension && f.extension.toLowerCase().includes(q))
      );
    }

    const sorted = [...files];
    if (sortBy === 'newest') {
      sorted.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } else if (sortBy === 'oldest') {
      sorted.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    } else if (sortBy === 'largest') {
      sorted.sort((a, b) => (b.size_bytes || 0) - (a.size_bytes || 0));
    } else if (sortBy === 'smallest') {
      sorted.sort((a, b) => (a.size_bytes || 0) - (b.size_bytes || 0));
    }

    return sorted;
  }, [uploads.files, selectedCategory, searchQuery, sortBy]);

  // Reset page when filter changes
  useEffect(() => {
    setPage(1);
  }, [selectedCategory, searchQuery, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / pageSize));
  const paginatedFiles = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredFiles.slice(start, start + pageSize);
  }, [filteredFiles, page, pageSize]);

  if (loading && !storage) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <Spinner className="w-10 h-10 mb-4 text-emerald-500" />
        <p className="text-sm font-semibold">Scanning live server storage, disk partition, and media files...</p>
      </div>
    );
  }

  const categoryEntries = Object.entries(uploads.categories || {});

  return (
    <div className="space-y-6">
      {/* ─── Health & Live Status Banner ─── */}
      <div className={`p-4 sm:p-5 rounded-2xl border transition-all shadow-xs ${
        isHealthy
          ? 'bg-gradient-to-r from-emerald-50/95 via-emerald-50/40 to-white dark:from-emerald-950/40 dark:via-emerald-950/20 dark:to-transparent border-emerald-200 dark:border-emerald-500/30'
          : isWarning
          ? 'bg-gradient-to-r from-amber-50/95 via-amber-50/40 to-white dark:from-amber-950/40 dark:via-amber-950/20 dark:to-transparent border-amber-200 dark:border-amber-500/30'
          : 'bg-gradient-to-r from-rose-50/95 via-rose-50/40 to-white dark:from-rose-950/40 dark:via-rose-950/20 dark:to-transparent border-rose-200 dark:border-rose-500/30'
      }`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className={`p-2.5 rounded-xl text-xl shrink-0 ${
              isHealthy
                ? 'bg-emerald-600 text-white dark:bg-emerald-500/20 dark:text-emerald-400 shadow-sm shadow-emerald-600/20'
                : isWarning
                ? 'bg-amber-500 text-white dark:bg-amber-500/20 dark:text-amber-400 shadow-sm shadow-amber-500/20'
                : 'bg-rose-600 text-white dark:bg-rose-500/20 dark:text-rose-400 shadow-sm shadow-rose-600/20'
            }`}>
              {isHealthy ? <FiCheckCircle /> : <FiAlertTriangle />}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white">
                  Storage Health: <span className={`uppercase tracking-wider font-extrabold ${
                    isHealthy
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : isWarning
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-rose-700 dark:text-rose-400'
                  }`}>{health.status}</span>
                </h3>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-500/30 shadow-2xs">
                  REAL-TIME DISK AUDIT
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground">
                  Host: {disk.partition_name || 'System Partition'}
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 font-medium leading-relaxed">
                {health.recommendation}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Top Level Storage Meters ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Uploaded Media */}
        <Card className="p-4 border border-border bg-card/60 backdrop-blur-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <FiFolder className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Uploaded Files & Media</span>
                  <span className="text-lg font-black font-mono text-foreground">{uploads.size_formatted || '0 B'}</span>
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground font-mono">{uploads.files_count || 0}</span> real system files scanned across {categoryEntries.length} media categories.
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-border/50 flex justify-between items-center text-[10px] text-muted-foreground">
            <span className="truncate">Products, Proofs, Payments, Avatars...</span>
            <button
              type="button"
              onClick={() => setActiveSubTab('files')}
              className="text-primary font-bold hover:underline shrink-0 ml-1 cursor-pointer flex items-center gap-0.5"
            >
              <span>Explore Files</span>
              <FiArrowRight className="w-3 h-3" />
            </button>
          </div>
        </Card>

        {/* Database Size */}
        <Card className="p-4 border border-border bg-card/60 backdrop-blur-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <FiDatabase className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">MySQL Database</span>
                <span className="text-lg font-black font-mono text-foreground">{db.size_formatted || '0 B'}</span>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{db.table_count || 0}</span> tables monitored in schema <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">{db.database_name}</span>.
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-border/50 flex justify-between items-center text-[10px] text-muted-foreground">
            <span>InnoDB Architecture</span>
            <button
              type="button"
              onClick={() => setActiveSubTab('tables')}
              className="text-primary font-bold hover:underline shrink-0 ml-1 cursor-pointer flex items-center gap-0.5"
            >
              <span>View Tables</span>
              <FiArrowRight className="w-3 h-3" />
            </button>
          </div>
        </Card>

        {/* Backups & Logs */}
        <Card className="p-4 border border-border bg-card/60 backdrop-blur-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <FiLayers className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Backups & Temp Cache</span>
                <span className="text-lg font-black font-mono text-foreground">{breakdown.app_total?.size_formatted || '0 B'}</span>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Backups: <span className="font-mono font-semibold text-foreground">{backups.size_formatted || '0 B'}</span> ({backups.files_count || 0} dumps) • Logs: <span className="font-mono font-semibold text-foreground">{logs.file_size_formatted || '0 B'}</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-border/50 flex justify-between items-center text-[10px] text-muted-foreground">
            <span>Cache: {cache.size_formatted || '0 B'}</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Active</span>
          </div>
        </Card>
      </div>

      {/* ─── Maintenance Actions Bar ─── */}
      <Card className="p-4 sm:p-5 border border-border">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-border">
          <div>
            <h3 className="font-bold text-foreground text-base flex items-center gap-2">
              <FiZap className="text-amber-500" /> Storage Cleanup & Server Maintenance
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Execute safe, real-time maintenance operations to reclaim server space without interrupting active transactions.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-4">
          <button
            type="button"
            onClick={() => handleCleanAction('cache', 'Application Cache Purge')}
            disabled={cleaning}
            className="flex flex-col items-start p-3.5 rounded-xl border border-slate-200 dark:border-border bg-slate-50/80 hover:bg-slate-100 dark:bg-muted/20 dark:hover:bg-muted/40 transition-all text-left cursor-pointer group disabled:opacity-50 shadow-2xs"
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <span className="font-bold text-xs text-slate-900 dark:text-foreground group-hover:text-primary transition-colors">Clear Cache & Views</span>
              <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-muted-foreground bg-slate-200/70 dark:bg-muted px-2 py-0.5 rounded-md">{cache.size_formatted || '0 B'}</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-muted-foreground leading-relaxed">
              Purges compiled Blade views and framework cache files to release allocated storage.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleCleanAction('logs', 'Application Log Purge')}
            disabled={cleaning}
            className="flex flex-col items-start p-3.5 rounded-xl border border-slate-200 dark:border-border bg-slate-50/80 hover:bg-slate-100 dark:bg-muted/20 dark:hover:bg-muted/40 transition-all text-left cursor-pointer group disabled:opacity-50 shadow-2xs"
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <span className="font-bold text-xs text-slate-900 dark:text-foreground group-hover:text-primary transition-colors">Purge Server Logs</span>
              <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-muted-foreground bg-slate-200/70 dark:bg-muted px-2 py-0.5 rounded-md">{logs.file_size_formatted || '0 B'}</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-muted-foreground leading-relaxed">
              Safely truncates <span className="font-mono text-[10px]">laravel.log</span> while keeping file descriptors intact.
            </p>
          </button>

          <button
            type="button"
            onClick={() => handleCleanAction('temp', 'Stale Temporary Files Cleanup')}
            disabled={cleaning}
            className="flex flex-col items-start p-3.5 rounded-xl border border-slate-200 dark:border-border bg-slate-50/80 hover:bg-slate-100 dark:bg-muted/20 dark:hover:bg-muted/40 transition-all text-left cursor-pointer group disabled:opacity-50 shadow-2xs"
          >
            <div className="flex items-center justify-between w-full mb-1.5">
              <span className="font-bold text-xs text-slate-900 dark:text-foreground group-hover:text-primary transition-colors">Clean Temp Sessions</span>
              <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-muted-foreground bg-slate-200/70 dark:bg-muted px-2 py-0.5 rounded-md">{cache.details?.sessions?.size_formatted || '0 B'}</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-muted-foreground leading-relaxed">
              Scans and deletes expired temporary session files older than 7 days.
            </p>
          </button>
        </div>
      </Card>

      {/* ─── Detailed Breakdown Sub-Tabs ─── */}
      <div className="space-y-4">
        <div className="flex border-b border-border gap-6">
          <button
            type="button"
            onClick={() => setActiveSubTab('overview')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeSubTab === 'overview'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Storage Breakdown by Category
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('files')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
              activeSubTab === 'files'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>Real Uploaded Media Files</span>
            <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold">
              {uploads.files_count || 0}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('tables')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeSubTab === 'tables'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Database Tables Breakdown ({db.table_count || 0})
          </button>
        </div>

        {/* SUBTAB 1: Overview Breakdown */}
        {activeSubTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Category Size Breakdown Card */}
            <Card noPad className="p-4 border border-border space-y-3">
              <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Category Footprint</h4>
              <div className="space-y-2.5">
                {[
                  { name: 'MySQL Database', size: db.size_formatted, bytes: db.size_bytes, color: 'bg-emerald-500' },
                  { name: 'Uploaded Media Files', size: uploads.size_formatted, bytes: uploads.size_bytes, color: 'bg-purple-500' },
                  { name: 'Database Backups (.sql)', size: backups.size_formatted, bytes: backups.size_bytes, color: 'bg-blue-500' },
                  { name: 'Application Logs', size: logs.file_size_formatted, bytes: logs.file_size_bytes, color: 'bg-amber-500' },
                  { name: 'Framework Cache & Views', size: cache.size_formatted, bytes: cache.size_bytes, color: 'bg-teal-500' },
                ].map((item, idx) => {
                  const totalApp = breakdown.app_total?.size_bytes || 1;
                  const pct = Math.max(2, Math.min(100, Math.round((item.bytes / totalApp) * 100)));
                  return (
                    <div key={idx} className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-muted/20 border border-slate-200/80 dark:border-border/50">
                      <div className="flex justify-between items-center text-xs mb-1.5">
                        <span className="font-semibold text-foreground flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${item.color}`} />
                          {item.name}
                        </span>
                        <span className="font-mono font-bold">{item.size || '0 B'}</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-200 dark:bg-muted rounded-full overflow-hidden">
                        <div className={`h-full ${item.color} rounded-full`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Backups Summary Card */}
            <Card noPad className="p-4 border border-border space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Database Backups on Disk ({backups.files_count || 0})</h4>
                {onNavigateToBackups && (
                  <button
                    type="button"
                    onClick={onNavigateToBackups}
                    className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Manage Backups</span>
                    <FiArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
              
              {(!backups.files || backups.files.length === 0) ? (
                <div className="text-center py-8 text-muted-foreground text-xs italic">
                  No database backup dumps found on server disk.
                </div>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {backups.files?.map((bf, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2.5 rounded-xl bg-slate-50/90 dark:bg-muted/20 border border-slate-200/80 dark:border-border/50 text-xs">
                      <div className="min-w-0 pr-2">
                        <div className="font-mono font-bold text-foreground truncate" title={bf.filename}>{bf.filename}</div>
                        <div className="text-[10px] text-muted-foreground">{bf.created_at}</div>
                      </div>
                      <span className="font-mono font-bold px-2 py-0.5 rounded bg-slate-200/70 dark:bg-muted text-slate-800 dark:text-foreground text-[11px] shrink-0">
                        {bf.size_formatted}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 text-[11px] space-y-1.5 shadow-xs">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-slate-500 dark:text-slate-400">Server Partition:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{disk.partition_name || 'System Disk'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-slate-500 dark:text-slate-400">Host OS:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{env.os || 'Windows Host'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-slate-500 dark:text-slate-400">PHP Engine:</span>
                  <span className="font-semibold font-mono text-emerald-600 dark:text-emerald-400">{env.php_version}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-slate-500 dark:text-slate-400">Root Path:</span>
                  <span className="font-mono text-[10px] font-medium text-slate-700 dark:text-slate-300 truncate max-w-[240px]" title={env.base_path}>{env.base_path}</span>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* SUBTAB 2: Real Uploaded Files & Media Explorer */}
        {activeSubTab === 'files' && (
          <div className="space-y-4">
            {/* Category Filter Pills / Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-primary/10 border-primary text-primary shadow-xs'
                    : 'bg-card border-border hover:bg-muted/40 text-foreground'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold truncate">All Categories</span>
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-muted font-bold text-foreground">
                    {uploads.files_count || 0}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-muted-foreground">{uploads.size_formatted}</div>
              </button>

              {categoryEntries.map(([catName, catData], idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedCategory(catName)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    selectedCategory === catName
                      ? 'bg-primary/10 border-primary text-primary shadow-xs'
                      : 'bg-card border-border hover:bg-muted/40 text-foreground'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold truncate" title={catData.label || catName}>
                      {catData.label || catName}
                    </span>
                    <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-muted font-bold text-foreground">
                      {catData.files_count}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-muted-foreground">{catData.size_formatted}</div>
                </button>
              ))}
            </div>

            {/* Explorer Toolbar: Search, Sort, View Controls */}
            <Card noPad className="p-3 border border-border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-md">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search real files by name, folder, or extension (.png, .webp)..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <FiX className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <span className="text-xs text-muted-foreground hidden sm:inline whitespace-nowrap font-medium">
                  Showing <strong className="font-mono text-foreground">{filteredFiles.length}</strong> of <strong className="font-mono text-foreground">{uploads.files_count || 0}</strong> files
                </span>
              </div>

              <div className="flex items-center gap-2 self-end md:self-auto">
                <button
                  type="button"
                  onClick={handleDeleteAllFiles}
                  disabled={deletingAll || Boolean(deletingPath) || filteredFiles.length === 0}
                  title={filteredFiles.length === 0 ? 'No files to delete' : `Delete all ${filteredFiles.length} shown files`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <FiTrash2 className="w-3.5 h-3.5" />
                  <span>{deletingAll ? 'Deleting...' : `Delete All (${filteredFiles.length})`}</span>
                </button>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-xl border border-border bg-background text-foreground cursor-pointer focus:outline-none"
                >
                  <option value="newest">Sort: Newest First</option>
                  <option value="oldest">Sort: Oldest First</option>
                  <option value="largest">Sort: Largest File</option>
                  <option value="smallest">Sort: Smallest File</option>
                </select>

                <div className="flex items-center border border-border rounded-xl overflow-hidden bg-background">
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`p-1.5 transition-colors cursor-pointer ${
                      viewMode === 'grid' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title="Grid Thumbnail View"
                  >
                    <FiGrid className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('table')}
                    className={`p-1.5 transition-colors cursor-pointer ${
                      viewMode === 'table' ? 'bg-primary text-white' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    title="Table Detail View"
                  >
                    <FiList className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>

            {/* Files Grid / Table */}
            {filteredFiles.length === 0 ? (
              <div className="p-12 text-center border border-dashed border-border rounded-2xl bg-card/40 text-muted-foreground">
                <FiFolder className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-semibold">No media files found matching your search.</p>
                <p className="text-xs mt-1">Try clearing filters or changing category.</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {paginatedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    onClick={() => setPreviewFile(file)}
                    className="group border border-border rounded-2xl bg-card overflow-hidden hover:shadow-md hover:border-primary/50 transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <div className="aspect-square bg-slate-100 dark:bg-muted/30 relative overflow-hidden flex items-center justify-center">
                      {file.is_image ? (
                        <img
                          src={file.url}
                          alt={file.name}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div
                        className="w-full h-full items-center justify-center text-muted-foreground"
                        style={{ display: file.is_image ? 'none' : 'flex' }}
                      >
                        <FiFileText className="w-8 h-8 opacity-40" />
                      </div>

                      <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewFile(file);
                          }}
                          title="Preview File"
                          className="bg-black/60 hover:bg-black/80 backdrop-blur-xs text-white p-1.5 rounded-lg text-[10px] cursor-pointer"
                        >
                          <FiEye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteFile(file, e)}
                          disabled={deletingPath === file.relative_path}
                          title="Delete File"
                          className="bg-rose-600/90 hover:bg-rose-600 backdrop-blur-xs text-white p-1.5 rounded-lg text-[10px] cursor-pointer disabled:opacity-50"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="p-2.5 space-y-1">
                      <div className="font-mono text-[11px] font-bold text-foreground truncate" title={file.name}>
                        {file.name}
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span className="capitalize font-semibold text-primary truncate max-w-[80px]">
                          {file.folder}
                        </span>
                        <span className="font-mono font-medium">{file.size_formatted}</span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-border/60">
                        <span className="text-[9px] text-muted-foreground/80 font-mono truncate">
                          {file.modified_at}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteFile(file, e)}
                          disabled={deletingPath === file.relative_path}
                          title="Delete File"
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <FiTrash2 className="w-3 h-3" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Card noPad className="border border-border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/30 text-muted-foreground text-left uppercase text-[10px] font-semibold">
                        <th className="px-4 py-2.5">Preview</th>
                        <th className="px-4 py-2.5">File Name & Path</th>
                        <th className="px-4 py-2.5">Category</th>
                        <th className="px-4 py-2.5">Size</th>
                        <th className="px-4 py-2.5">Last Modified</th>
                        <th className="px-4 py-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono">
                      {paginatedFiles.map((file, idx) => (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="px-4 py-2">
                            <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-100 dark:bg-muted/30 border border-border flex items-center justify-center">
                              {file.is_image ? (
                                <img
                                  src={file.url}
                                  alt={file.name}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextSibling.style.display = 'flex';
                                  }}
                                />
                              ) : null}
                              <div
                                className="w-full h-full items-center justify-center text-muted-foreground"
                                style={{ display: file.is_image ? 'none' : 'flex' }}
                              >
                                <FiFileText className="w-4 h-4 opacity-50" />
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-2 max-w-[280px]">
                            <div className="font-semibold text-foreground truncate" title={file.name}>
                              {file.name}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate" title={file.relative_path}>
                              {file.relative_path}
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <span className="px-2 py-0.5 rounded-md bg-muted text-foreground text-[10px] font-bold uppercase">
                              {file.category_label || file.folder}
                            </span>
                          </td>
                          <td className="px-4 py-2 font-bold text-foreground">
                            {file.size_formatted}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground text-[11px]">
                            {file.modified_at}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setPreviewFile(file)}
                                className="p-1.5 rounded-lg border border-border hover:bg-muted text-foreground cursor-pointer"
                                title="Preview File"
                              >
                                <FiEye className="w-3.5 h-3.5" />
                              </button>
                              <a
                                href={file.url}
                                target="_blank"
                                rel="noreferrer"
                                className="p-1.5 rounded-lg border border-border hover:bg-muted text-foreground cursor-pointer"
                                title="Open in New Tab"
                              >
                                <FiExternalLink className="w-3.5 h-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteFile(file, e)}
                                disabled={deletingPath === file.relative_path}
                                className="p-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 cursor-pointer disabled:opacity-50"
                                title="Delete File"
                              >
                                <FiTrash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  Page <strong className="text-foreground">{page}</strong> of <strong className="text-foreground">{totalPages}</strong>
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 text-xs rounded-xl border border-border bg-card text-foreground disabled:opacity-40 cursor-pointer"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 text-xs rounded-xl border border-border bg-card text-foreground disabled:opacity-40 cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SUBTAB 3: Database Tables */}
        {activeSubTab === 'tables' && (
          <Card noPad className="border border-border">
            <div className="p-3.5 border-b border-border bg-muted/20 flex justify-between items-center text-xs">
              <span className="font-bold text-muted-foreground uppercase">Top Database Tables by Storage Size</span>
              <span className="font-mono text-muted-foreground">{db.tables?.length || 0} Total Tables</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground text-left uppercase text-[10px] font-semibold">
                    <th className="px-4 py-2.5">Table Name</th>
                    <th className="px-4 py-2.5">Total Size</th>
                    <th className="px-4 py-2.5">Data Size</th>
                    <th className="px-4 py-2.5">Index Size</th>
                    <th className="px-4 py-2.5 text-right">Row Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  {db.tables?.slice(0, 25).map((t, idx) => (
                    <tr key={idx} className="hover:bg-muted/20">
                      <td className="px-4 py-2 font-semibold text-foreground">{t.name}</td>
                      <td className="px-4 py-2 font-bold text-emerald-600 dark:text-emerald-400">{t.size_formatted}</td>
                      <td className="px-4 py-2 text-muted-foreground">{t.data_formatted}</td>
                      <td className="px-4 py-2 text-muted-foreground">{t.index_formatted}</td>
                      <td className="px-4 py-2 text-right text-foreground">{(t.rows ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      {/* ─── Real File Preview Modal ─── */}
      {previewFile && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="min-w-0 pr-4">
                <h4 className="font-bold text-sm text-foreground truncate" title={previewFile.name}>
                  {previewFile.name}
                </h4>
                <p className="text-[11px] text-muted-foreground font-mono truncate">
                  {previewFile.relative_path}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewFile(null)}
                className="p-1.5 rounded-lg border border-border hover:bg-muted text-foreground cursor-pointer"
              >
                <FiX className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col items-center justify-center bg-slate-900/10 dark:bg-black/30 min-h-[260px]">
              {previewFile.is_image ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.name}
                  className="max-h-[380px] max-w-full rounded-xl object-contain shadow-md"
                />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <FiFileText className="w-16 h-16 mx-auto mb-3 opacity-40" />
                  <p className="font-mono text-sm">{previewFile.name}</p>
                  <p className="text-xs mt-1">Non-image file ({previewFile.extension})</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-3 font-mono text-muted-foreground text-[11px]">
                <span>Category: <strong className="text-foreground">{previewFile.category_label || previewFile.folder}</strong></span>
                <span>Size: <strong className="text-foreground">{previewFile.size_formatted}</strong></span>
                <span>Modified: <strong className="text-foreground">{previewFile.modified_at}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => handleDeleteFile(previewFile, e)}
                  disabled={deletingPath === previewFile.relative_path}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <FiTrash2 className="w-3.5 h-3.5" />
                  <span>{deletingPath === previewFile.relative_path ? 'Deleting...' : 'Delete File'}</span>
                </button>
                <a
                  href={previewFile.url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-primary text-white font-semibold text-xs flex items-center gap-1.5 hover:opacity-90 cursor-pointer"
                >
                  <FiExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full File</span>
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewFile(null)}
                  className="px-3 py-1.5 rounded-xl border border-border hover:bg-muted text-foreground font-semibold text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
