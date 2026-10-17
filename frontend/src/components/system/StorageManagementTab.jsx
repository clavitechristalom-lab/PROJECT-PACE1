import React, { useState, useEffect } from 'react';
import {
  FiHardDrive, FiDatabase, FiServer, FiTrash2, FiRefreshCw,
  FiCheckCircle, FiAlertTriangle, FiFolder, FiFileText, FiLayers,
  FiActivity, FiZap, FiCheck, FiArrowRight
} from 'react-icons/fi';
import { Card, Btn, Spinner, showToast, showSuccess, showError, confirmAction } from '../ui';
import { api } from '../../lib/api';
import { triggerDataSync, useRealtimeSync } from '../../lib/realtimeSync';

export default function StorageManagementTab({ onNavigateToBackups }) {
  const [storage, setStorage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('overview'); // 'overview' | 'tables' | 'files'

  const loadStorage = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api.system.getStorage();
      setStorage(data);
    } catch (err) {
      console.error('Failed to load system storage data:', err);
      if (!silent) showToast(err.message || 'Failed to load storage status', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadStorage();
  }, []);

  useRealtimeSync(() => {
    loadStorage(true);
  }, []);

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
          loadStorage(true);
        }
        triggerDataSync('storage');

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

  if (loading && !storage) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <Spinner className="w-10 h-10 mb-4 text-emerald-500" />
        <p className="text-sm font-semibold">Scanning live server storage and database tables...</p>
      </div>
    );
  }

  const disk = storage?.disk || {};
  const breakdown = storage?.breakdown || {};
  const db = breakdown.database || {};
  const uploads = breakdown.uploads || {};
  const backups = breakdown.backups || {};
  const logs = breakdown.logs || {};
  const cache = breakdown.cache || {};
  const health = storage?.health || { status: 'optimal' };
  const env = storage?.server_environment || {};

  const diskPercentage = disk.percentage || 0;
  const isHealthy = health.status === 'optimal';
  const isWarning = health.status === 'warning';

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
                  LIVE SCAN
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-emerald-200/90 mt-1 font-medium leading-relaxed">
                {health.recommendation}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              onClick={() => loadStorage(false)}
              disabled={loading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-border bg-white dark:bg-card hover:bg-slate-50 dark:hover:bg-muted text-slate-800 dark:text-foreground transition-all cursor-pointer shadow-2xs disabled:opacity-50"
            >
              <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Rescan Storage</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── Top Level Storage Meters ─── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Host Disk */}
        <Card className="p-4 border border-border bg-card/60 backdrop-blur-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <FiHardDrive className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Server Disk Partition</span>
                <span className="text-lg font-black font-mono text-foreground">{disk.percentage}%</span>
              </div>
            </div>
          </div>
          <div className="h-2 w-full bg-muted rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                diskPercentage > 85 ? 'bg-rose-500' : diskPercentage > 70 ? 'bg-amber-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(100, diskPercentage)}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-mono text-muted-foreground">
            <span>{disk.used_formatted} used</span>
            <span>{disk.free_formatted} free</span>
          </div>
        </Card>

        {/* Database Size */}
        <Card className="p-4 border border-border bg-card/60 backdrop-blur-xs">
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
            <span className="font-semibold text-foreground">{db.table_count || 0}</span> database tables monitored in schema <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">{db.database_name}</span>.
          </div>
        </Card>

        {/* Uploaded Media */}
        <Card className="p-4 border border-border bg-card/60 backdrop-blur-xs">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <FiFolder className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">Uploaded Files & Media</span>
              <span className="text-lg font-black font-mono text-foreground">{uploads.size_formatted || '0 B'}</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{uploads.files_count || 0}</span> media files stored across proofs, products, & QR badges.
          </div>
        </Card>

        {/* Backups & Logs */}
        <Card className="p-4 border border-border bg-card/60 backdrop-blur-xs">
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
            Backups: <span className="font-mono font-semibold text-foreground">{backups.size_formatted || '0 B'}</span> • Cache: <span className="font-mono font-semibold text-foreground">{cache.size_formatted || '0 B'}</span>
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
            onClick={() => setActiveSubTab('tables')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeSubTab === 'tables'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Database Tables Breakdown ({db.table_count || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('files')}
            className={`pb-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeSubTab === 'files'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Uploaded Media Directories
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
                <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Database Backups on Disk</h4>
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
              
              {backups.files?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-xs italic">
                  No database backup dumps found on server disk.
                </div>
              ) : (
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                  {backups.files?.map((bf, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2.5 rounded-xl bg-slate-50/90 dark:bg-muted/20 border border-slate-200/80 dark:border-border/50 text-xs">
                      <div className="min-w-0 pr-2">
                        <div className="font-mono font-bold text-foreground truncate">{bf.filename}</div>
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
                  <span className="font-medium text-slate-500 dark:text-slate-400">Server Environment:</span>
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

        {/* SUBTAB 2: Database Tables */}
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
                  {db.tables?.slice(0, 15).map((t, idx) => (
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

        {/* SUBTAB 3: Uploads Directories */}
        {activeSubTab === 'files' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(uploads.categories || {}).map(([catName, catData], idx) => (
              <Card key={idx} className="p-4 border border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                    <FiFolder className="w-5 h-5" />
                  </div>
                  <div>
                    <h5 className="font-bold text-sm text-foreground capitalize">{catName}</h5>
                    <p className="text-[11px] text-muted-foreground font-mono">{catData.files_count} files</p>
                  </div>
                </div>
                <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-lg bg-muted text-foreground">
                  {catData.size_formatted}
                </span>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
