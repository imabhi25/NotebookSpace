import { BackendStatus } from './BackendStatus';
import { useModalFocus } from '../useModalFocus';
import { ReferenceIcon } from './ReferenceIcon';
import { EmptyStateIcon } from './EmptyStateIcon';
import React, { useState, useEffect } from 'react';
import { SortMenu } from './SortMenu';
import { SettingsPanel, readDefaultResponseSettings } from './SettingsPanel';
import { Subject, User } from '../types';

export interface DashboardViewProps {
  subjects: Subject[];
  loading: boolean;
  activeSubjectId?: string;
  currentUser?: User | null;
  onOpenSubject: (subjectId: string) => void;
  onCreateSubject: (data: { name: string; course_code?: string; description?: string; settings?: Record<string, any> }) => Promise<void>;
  onUpdateSubject: (subjectId: string, data: { name?: string; course_code?: string; description?: string }) => Promise<void>;
  onArchiveSubject: (subjectId: string) => Promise<void>;
  onRestoreSubject: (subjectId: string) => Promise<void>;
  onDeleteSubject: (subjectId: string) => Promise<void>;
  onCreateSampleSubject?: () => Promise<void>;
  onResetWorkspace?: () => Promise<void>;
  isMobileSidebarOpen?: boolean;
  onSetMobileSidebarOpen?: (open: boolean) => void;
  children?: React.ReactNode;
  workspaceMode?: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  subjects,
  loading,
  activeSubjectId,
  currentUser,
  onOpenSubject,
  onCreateSubject,
  onUpdateSubject,
  onArchiveSubject,
  onRestoreSubject,
  onDeleteSubject,
  onCreateSampleSubject,
  onResetWorkspace,
  isMobileSidebarOpen: controlledMobileOpen,
  onSetMobileSidebarOpen,
  children,
  workspaceMode = false,
}) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'updated_at' | 'name' | 'created_at'>('updated_at');
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [homeTab, setHomeTab] = useState<'all' | 'active' | 'archived'>('all');

  // Sidebar collapse & drawer states
  const [localMobileOpen, setLocalMobileOpen] = useState(false);
  const isMobileOpen = controlledMobileOpen !== undefined ? controlledMobileOpen : localMobileOpen;
  const setMobileOpen = (open: boolean) => {
    if (onSetMobileSidebarOpen) {
      onSetMobileSidebarOpen(open);
    } else {
      setLocalMobileOpen(open);
    }
  };

  const [isCollapsedDesktop, setIsCollapsedDesktop] = useState(false);

  // Privacy banner dismissal persistence
  const [isPrivacyBannerDismissed, setIsPrivacyBannerDismissed] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem('notebookspace_privacy_banner_dismissed') === 'true';
      }
    } catch {
      // ignore
    }
    return false;
  });

  const handleDismissBanner = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('notebookspace_privacy_banner_dismissed', 'true');
      }
    } catch {
      // ignore
    }
    setIsPrivacyBannerDismissed(true);
  };

  const handleShowPrivacyNotice = () => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('notebookspace_privacy_banner_dismissed');
      }
    } catch {
      // ignore
    }
    setIsPrivacyBannerDismissed(false);
  };

  // Direction of the last desktop sidebar toggle, so the main area can glide instead of jumping.
  const [sidebarMotion, setSidebarMotion] = useState<'idle' | 'collapsing' | 'expanding'>('idle');
  const collapseSidebar = () => {
    setSidebarMotion('collapsing');
    setIsCollapsedDesktop(true);
  };
  const expandSidebar = () => {
    setSidebarMotion('expanding');
    setIsCollapsedDesktop(false);
  };

  // Item overflow menus
  const [menuOpenSubjectId, setMenuOpenSubjectId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const createModalRef = useModalFocus(isCreateOpen, () => setIsCreateOpen(false));
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [deletingSubject, setDeletingSubject] = useState<Subject | null>(null);

  // Form states
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleDocumentClick = () => {
      setMenuOpenSubjectId(null);
    };
    window.addEventListener('click', handleDocumentClick);
    return () => window.removeEventListener('click', handleDocumentClick);
  }, []);

  // Close modals & popovers on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCreateOpen) setIsCreateOpen(false);
        if (editingSubject) setEditingSubject(null);
        if (deletingSubject) setDeletingSubject(null);
        if (isResetConfirmOpen) setIsResetConfirmOpen(false);
        if (isSettingsOpen) setIsSettingsOpen(false);
        if (menuOpenSubjectId) setMenuOpenSubjectId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCreateOpen, editingSubject, deletingSubject, isResetConfirmOpen, isSettingsOpen, menuOpenSubjectId]);

  const openCreateModal = () => {
    setFormName('');
    setFormCode('');
    setFormDesc('');
    setFormError(null);
    setIsCreateOpen(true);
  };

  const openEditModal = (s: Subject, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingSubject(s);
    setFormName(s.name);
    setFormCode(s.course_code || '');
    setFormDesc(s.description || '');
    setFormError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Notebook name is required.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const defaultSettings = readDefaultResponseSettings();
      await onCreateSubject({
        name: formName.trim(),
        course_code: formCode.trim() || undefined,
        description: formDesc.trim() || undefined,
        ...(defaultSettings ? { settings: defaultSettings } : {}),
      });
      setIsCreateOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create notebook.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject || !formName.trim()) {
      setFormError('Notebook name is required.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await onUpdateSubject(editingSubject.id, {
        name: formName.trim(),
        course_code: formCode.trim() || undefined,
        description: formDesc.trim() || undefined,
      });
      setEditingSubject(null);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update notebook.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingSubject) return;
    setSubmitting(true);
    try {
      await onDeleteSubject(deletingSubject.id);
      setDeletingSubject(null);
    } catch (err: any) {
      alert(err.message || 'Failed to delete notebook.');
    } finally {
      setSubmitting(false);
    }
  };

  // The sample notebook is recreated from scratch (stale 1-source copies become the 2-source conflict demo).
  const isSampleNotebook = (s: Subject) => /\(Sample\)\s*$/.test(s.name);
  const [resettingSampleId, setResettingSampleId] = useState<string | null>(null);
  const handleResetSample = async (s: Subject) => {
    if (!onCreateSampleSubject || resettingSampleId) return;
    setResettingSampleId(s.id);
    try {
      await onDeleteSubject(s.id);
      await onCreateSampleSubject();
    } catch (err: any) {
      alert(err?.message || 'Failed to reset the sample notebook.');
    } finally {
      setResettingSampleId(null);
    }
  };

  const handleResetConfirm = async () => {
    setIsResetConfirmOpen(false);
    if (onResetWorkspace) {
      await onResetWorkspace();
    }
  };

  // Filter and sort notebooks (shared by the launcher grid and the in-workspace sidebar)
  const filterAndSort = (mode: 'all' | 'active' | 'archived') =>
    subjects
      .filter((s) => (mode === 'all' ? true : mode === 'active' ? !s.is_archived : s.is_archived))
      .filter((s) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.course_code && s.course_code.toLowerCase().includes(q)) ||
          (s.description && s.description.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'created_at') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
  const filtered = filterAndSort(tab);
  const homeFiltered = filterAndSort(homeTab);

  // A stable paper tone per notebook, derived from its title.
  const toneFor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
    return (hash % 6) + 1;
  };


  // Single "⋯" overflow menu: rename, archive or restore, delete
  const renderNotebookMenu = (s: Subject) => (
                    <div
                      className="notebook-item-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="notebook-menu-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenSubjectId(menuOpenSubjectId === s.id ? null : s.id);
                        }}
                        aria-label={`Options for ${s.name}`}
                        title="More options"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="19" cy="12" r="1.5" />
                          <circle cx="5" cy="12" r="1.5" />
                        </svg>
                      </button>

                      {menuOpenSubjectId === s.id && (
                        <div className="notebook-overflow-menu" role="menu">
                          <button
                            type="button"
                            className="notebook-menu-item"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenSubjectId(null);
                              openEditModal(s, e);
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                            </svg>
                            <span>Rename</span>
                          </button>

                          {s.is_archived ? (
                            <button
                              type="button"
                              className="notebook-menu-item"
                              role="menuitem"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenSubjectId(null);
                                onRestoreSubject(s.id);
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="1 4 1 10 7 10" />
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                              </svg>
                              <span>Restore</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="notebook-menu-item"
                              role="menuitem"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenSubjectId(null);
                                onArchiveSubject(s.id);
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="21 8 21 21 3 21 3 8" />
                                <rect x="1" y="3" width="22" height="5" />
                                <line x1="10" y1="12" x2="14" y2="12" />
                              </svg>
                              <span>Archive</span>
                            </button>
                          )}

                          {isSampleNotebook(s) && onCreateSampleSubject && (
                            <button
                              type="button"
                              className="notebook-menu-item"
                              role="menuitem"
                              data-testid={`reset-sample-${s.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenSubjectId(null);
                                if (window.confirm('Reset the sample notebook? Its sources, chats and notes are replaced with a fresh copy.')) void handleResetSample(s);
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="1 4 1 10 7 10" />
                                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                              </svg>
                              <span>Reset sample notebook</span>
                            </button>
                          )}

                          <button
                            type="button"
                            className="notebook-menu-item menu-item-danger"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuOpenSubjectId(null);
                              setDeletingSubject(s);
                            }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                            <span>Delete… <small>Permanently remove notebook</small></span>
                          </button>
                        </div>
                      )}
                    </div>
  );

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  const privacyBanner = !isPrivacyBannerDismissed && (
          <div
            className="guest-workspace-notice guest-workspace-notice-slim"
            data-testid="guest-workspace-banner"
          >
            <div className="guest-workspace-notice-content">
              <svg className="privacy-lock-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span className="guest-workspace-notice-title">Private Browser Workspace:</span>
              <span className="guest-workspace-notice-text">
                Your course notebooks, uploaded materials, and saved notes are private to this browser session and persist across reloads. No sign-in required.
              </span>
            </div>
            <button
              type="button"
              className="privacy-banner-dismiss-btn"
              onClick={handleDismissBanner}
              aria-label="Dismiss privacy notice"
              title="Dismiss notice"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        );

  return (
    <div className={`dashboard-shell-layout sidebar-motion-${sidebarMotion} ${workspaceMode ? 'workspace-shell' : ''}`}>
      {children || workspaceMode ? (
        <>
      {!workspaceMode && <>
      {/* Mobile Backdrop Overlay (always mounted so it can fade out as well as in) */}
      <div
        className={`sidebar-mobile-overlay ${isMobileOpen ? 'is-open' : ''}`}
        onClick={() => setMobileOpen(false)}
        aria-hidden="true"
      />

      {/* ======================================================================
          1. NOTEBOOKLM-STYLE LEFT SIDEBAR (~260px)
          ====================================================================== */}
      <aside
        className={`notebooks-sidebar ${isMobileOpen ? 'mobile-open' : ''} ${
          isCollapsedDesktop ? 'collapsed-desktop' : ''
        }`}
        aria-label="Notebooks sidebar"
      >
        {/* Sidebar Brand Header */}
        <div className="sidebar-brand-row">
          <div className="sidebar-brand">
            <span className="brand-mark-wrapper" aria-hidden="true">
              <span className="brand-logo-letter">N</span>
            </span>
            <span className="sidebar-brand-title">NotebookSpace</span>
          </div>

          <div className="sidebar-header-actions">
            <button
              type="button"
              className="btn-icon sidebar-settings-btn"
              onClick={() => setIsSettingsOpen(true)}
              title="Workspace settings"
              aria-label="Workspace settings"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            {/* Desktop collapse toggle */}
            <button
              type="button"
              className="btn-icon sidebar-desktop-toggle-btn"
              onClick={collapseSidebar}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>

            {/* Mobile drawer close button */}
            <button
              type="button"
              className="btn-icon sidebar-mobile-close-btn"
              onClick={() => setMobileOpen(false)}
              title="Close menu"
              aria-label="Close menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Action: + New notebook */}
        <div className="sidebar-new-btn-container">
          <button
            type="button"
            className="btn-sidebar-new-notebook"
            onClick={openCreateModal}
            data-testid="create-subject-btn"
            aria-label="Create new notebook"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>New notebook</span>
          </button>
        </div>

        {/* Toolbar: Search & Compact Filter */}
        <div className="sidebar-search-filter-box">
          <div className="sidebar-search-row">
            <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="sidebar-search-input"
              placeholder="Search subjects or notebooks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search notebooks"
            />
            {search && (
              <button
                type="button"
                className="sidebar-search-clear-btn"
                onClick={() => setSearch('')}
                aria-label="Clear search query"
              >
                &times;
              </button>
            )}
          </div>

          <div className="sidebar-filter-row">
            <div className="sidebar-filter-pills" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'active'}
                className={`sidebar-filter-pill ${tab === 'active' ? 'active' : ''}`}
                onClick={() => setTab('active')}
              >
                Active
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'archived'}
                className={`sidebar-filter-pill ${tab === 'archived' ? 'active' : ''}`}
                onClick={() => setTab('archived')}
              >
                Archived
              </button>
            </div>

            <SortMenu
              label="Sort notebooks"
              value={sortBy}
              onChange={setSortBy}
              options={[
                { value: 'updated_at', label: 'Recent' },
                { value: 'name', label: 'Name' },
                { value: 'created_at', label: 'Created' },
              ]}
            />
          </div>
        </div>

        {/* Notebooks List */}
        <div className="sidebar-notebooks-scroll">
          {loading ? (
            <div className="sidebar-loading-box">
              <div className="step-spinner spinner-inline" />
              <span>Loading notebooks...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="sidebar-empty-box" key={tab}><EmptyStateIcon />
              <p>{tab === 'archived' ? 'No archived notebooks.' : search ? 'No matching notebooks.' : 'No notebooks yet.'}</p>
            </div>
          ) : (
            <div className="sidebar-notebooks-list" role="list" key={`${tab}-${sortBy}`}>
              {filtered.map((s) => {
                const isSelected = activeSubjectId === s.id;

                return (
                  <div
                    key={s.id}
                    role="listitem"
                    className={`sidebar-notebook-item ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      onOpenSubject(s.id);
                      if (isMobileOpen) setMobileOpen(false);
                    }}
                    data-testid={`subject-card-${s.id}`}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        onOpenSubject(s.id);
                        if (isMobileOpen) setMobileOpen(false);
                      }
                    }}
                  >
                    <div className="notebook-item-icon" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                    </div>

                    <div className="notebook-item-content">
                      <div className="notebook-item-title-row">
                        <span className="notebook-item-title" title={s.name}>
                          {s.name}
                        </span>
                        {s.course_code && (
                          <span className="course-code-badge notebook-code-badge">
                            {s.course_code}
                          </span>
                        )}
                      </div>

                      <div className="notebook-item-meta-row">
                        <span className="notebook-item-sources">
                          {(s.source_count ?? 0)} {(s.source_count ?? 0) === 1 ? 'source' : 'sources'}
                        </span>
                        <span className="notebook-item-date">
                          {formatDate(s.updated_at)}
                        </span>
                      </div>
                    </div>

                    {renderNotebookMenu(s)}
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </aside>
      </>}

      {/* ======================================================================
          2. MAIN AREA: Selected Notebook Detail View or Calm Empty State
          ====================================================================== */}
      <main className="dashboard-main-content">
        {/* Reopen Floating Tab on Desktop when sidebar is collapsed */}
        {!workspaceMode && isCollapsedDesktop && (
          <button
            type="button"
            className="floating-sidebar-reopen-btn"
            onClick={expandSidebar}
            title="Open notebooks sidebar"
            aria-label="Open notebooks sidebar"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
            <span>Notebooks</span>
          </button>
        )}

        {privacyBanner}

        <div className="dashboard-children-wrapper">
          {children}
        </div>
      </main>
        </>
      ) : (
        /* ====================================================================
           LAUNCHER: "My notebooks" card grid (shown whenever no notebook is open)
           ==================================================================== */
        <div className="notebooks-home">
          <header className="home-header">
            <div className="home-brand">
              <span className="brand-mark-wrapper" aria-hidden="true">
                <ReferenceIcon name="book" size={22} />
              </span>
              <span className="sidebar-brand-title">NotebookSpace</span>
            </div>

            <div className="sidebar-search-row home-search">
              <svg className="search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="sidebar-search-input"
                placeholder="Search your notebooks"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search notebooks"
              />
              {search && (
                <button
                  type="button"
                  className="sidebar-search-clear-btn"
                  onClick={() => setSearch('')}
                  aria-label="Clear search query"
                >
                  &times;
                </button>
              )}
            </div>

            <div className="home-header-actions">
              <BackendStatus />
              <details className="home-help">
                <summary aria-label="Help and shortcuts" title="Help &amp; shortcuts">?</summary>
                <p>Create a notebook, add your materials, then ask a question. Click a citation to check its evidence. Press Escape to close panels and dialogs.</p>
              </details>
              <button
                type="button"
                className="btn-icon sidebar-settings-btn"
                onClick={() => setIsSettingsOpen(true)}
                title="Workspace settings"
                aria-label="Workspace settings"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              </button>
<span className="library-account" title="Private browser workspace"><ReferenceIcon name="user" size={17} /></span>
            </div>
          </header>

          {privacyBanner}

          <div className="home-content"><main className="home-main">
            <div className="home-main-inner">
              <div className="library-introduction"><div><h1 className="home-heading">My notebooks</h1>
              <p className="home-heading-subtitle">{subjects.length ? 'Your subjects, sources, and ideas. All in one place.' : 'A little structure for everything you want to understand.'}</p></div>              <button
                type="button"
                className="btn btn-primary home-new-btn"
                onClick={openCreateModal}
                data-testid="create-subject-btn"
                aria-label="Create new notebook"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>New notebook</span>
              </button></div>

              <div className="home-toolbar">
                <div className="sidebar-filter-pills home-filter-tabs" role="tablist">
                  {(['all', 'active', 'archived'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="tab"
                      aria-selected={homeTab === mode}
                      className={`sidebar-filter-pill ${homeTab === mode ? 'active' : ''}`}
                      onClick={() => setHomeTab(mode)}
                    >
                      {mode === 'all' ? 'All notebooks' : mode === 'active' ? 'Active' : 'Archived'}
                    </button>
                  ))}
                </div>
                <SortMenu
                  label="Sort notebooks"
                  value={sortBy}
                  onChange={setSortBy}
                  options={[
                    { value: 'updated_at', label: 'Recent' },
                    { value: 'name', label: 'Name' },
                    { value: 'created_at', label: 'Created' },
                  ]}
                />
              </div>

              {loading ? (
                <div className="notebook-grid" role="status" aria-busy="true">
                  <span className="sr-only">Loading notebooks...</span>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="notebook-card notebook-card-skeleton" aria-hidden="true">
                      <span className="skeleton-line line-short" />
                      <span className="skeleton-line line-long" />
                      <span className="skeleton-line line-med" />
                    </div>
                  ))}
                </div>
              ) : homeFiltered.length === 0 ? (
            <div className="dashboard-empty-state" data-testid="dashboard-empty-state">
              <div className="empty-state-brand-mark" aria-hidden="true">
                <EmptyStateIcon />
              </div>
              {!search && homeTab !== 'archived' && <p className="library-eyebrow">A FRESH PAGE</p>}<h2 className="empty-heading">
                {homeTab === 'archived'
                  ? 'No archived notebooks'
                  : search
                  ? 'No matching notebooks found'
                  : 'Start with a subject. Make it yours.'}
              </h2>
              <p className="empty-subtext">
                {homeTab === 'archived'
                  ? 'Archived notebooks will appear here.'
                  : search
                  ? `No notebooks match "${search}". Try adjusting your search query.`
                  : 'Give your course, project, or curiosity a home. Bring the materials; your notebook keeps the ideas connected.'}
              </p>
              {homeTab !== 'archived' && !search && (
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={openCreateModal}
                  >
                    + Create a notebook
                  </button>
                  {onCreateSampleSubject && (!currentUser || currentUser.is_guest || currentUser.email?.startsWith('guest_') || currentUser.email === 'Guest Workspace') && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={onCreateSampleSubject}
                      data-testid="create-sample-notebook-btn"
                    >
                      Try a sample ↗
                    </button>
                  )}
                </div>
              )}
              {!search && homeTab !== 'archived' && <div className="library-welcome-art" aria-hidden="true"><ReferenceIcon name="book" size={26} /><strong>Your next big idea<br />starts here.</strong><small>NOTEBOOK 001</small></div>}
            </div>
              ) : (
                <div className="notebook-grid" role="list" key={`${homeTab}-${sortBy}`}>
                  {homeFiltered.map((s) => (
                    <div
                      key={s.id}
                      role="listitem"
                      className={`notebook-card ${menuOpenSubjectId === s.id ? 'menu-open' : ''}`}
                      onClick={() => onOpenSubject(s.id)}
                      data-testid={`subject-card-${s.id}`}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          onOpenSubject(s.id);
                        }
                      }}
                    >
                      <div className="notebook-card-top">
                        <span className={`notebook-card-mark tone-${toneFor(s.name)}`} aria-hidden="true">
                          <ReferenceIcon name={/music/i.test(s.name) ? 'music' : 'book'} size={18} />
                        </span>
                        <div className="notebook-card-tags">
                          {s.course_code && (
                            <span className="course-code-badge notebook-code-badge">{s.course_code}</span>
                          )}
                          {s.is_archived && <span className="notebook-code-badge notebook-archived-tag">Archived</span>}
                        </div>
                        {renderNotebookMenu(s)}
                      </div>
                      <div className="notebook-card-body">
                        <h2 className="notebook-card-title" title={s.name}>
                          {s.name}
                        </h2>
                        <p className="notebook-card-description">{s.description || `A fresh space for your ${s.name.toLowerCase()} notes and materials.`}</p>
                      </div>
                      {isSampleNotebook(s) && s.source_count === 1 && onCreateSampleSubject && (
                        <button
                          type="button"
                          className="sample-upgrade-banner"
                          data-testid={`update-sample-${s.id}`}
                          disabled={resettingSampleId === s.id}
                          onClick={(e) => { e.stopPropagation(); void handleResetSample(s); }}
                        >
                          {resettingSampleId === s.id ? 'Updating sample…' : 'Update sample to 2-source conflict demo'}
                        </button>
                      )}
                      <div className="notebook-card-footer">
                        <span className="notebook-card-meta">{`${(s.source_count ?? 0) === 0 ? 'No sources yet' : `${s.source_count} ${s.source_count === 1 ? 'source' : 'sources'}`} · Updated ${formatDate(s.updated_at)}`}</span>
                        <span className="notebook-open-action">Open <span aria-hidden="true">→</span></span>
                      </div>
                    </div>
                  ))}
                  {homeTab !== 'archived' && !search && <button type="button" className="library-add-card" onClick={openCreateModal}>
                    <span className="add-plus" aria-hidden="true">+</span>
                    <strong>New notebook</strong>
                    <small>Upload PDFs, slides, or notes</small>
                  </button>}
                </div>
              )}
              {!loading && subjects.length === 0 && !search && homeTab !== 'archived' && <div className="library-guide">{[
                ['01', 'Make a space', 'One notebook for each subject.'],
                ['02', 'Bring your materials', 'PDFs, links, and your own notes.'],
                ['03', 'Follow your curiosity', 'Ask questions. Keep what clicks.'],
              ].map(([n,title,body]) => <div key={n}><span>{n}</span><strong>{title}</strong><p>{body}</p></div>)}</div>}
              {!loading && homeFiltered.length === 1 && !isSampleNotebook(homeFiltered[0]) && homeTab !== 'archived' && !search && <div className="library-first-step"><span className="library-step-icon"><ReferenceIcon name="upload" size={20} /></span><div><strong>Make {homeFiltered[0].name} your own</strong><p>Add lecture slides, a reading, or a few notes to start your first conversation.</p></div><button type="button" className="btn btn-secondary" onClick={() => { try { sessionStorage.setItem('notebookspace_add_materials', homeFiltered[0].id); } catch {} onOpenSubject(homeFiltered[0].id); }}>+ Add materials</button></div>}
            </div>
          </main></div>
        </div>
      )}

      {/* ======================================================================
          3. MODALS
          ====================================================================== */}
      {/* Create Notebook Modal */}
      {isCreateOpen && (
        <div className="modal-backdrop" onClick={() => setIsCreateOpen(false)}>
          <div ref={createModalRef} className="modal-content create-notebook-dialog" role="dialog" aria-modal="true" aria-labelledby="create-notebook-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div><h2 id="create-notebook-title">
                Create a notebook
                <span className="sr-only">Create New Subject Notebook</span>
              </h2><p>A new space for your notes, sources, and ideas.</p></div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsCreateOpen(false)}
                aria-label="Close"
              >
                <ReferenceIcon name="close" size={16} />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="modal-form">
              {formError && <div className="form-error-banner">{formError}</div>}
              <div className="form-group">
                <label htmlFor="create-subj-name">
                  Notebook name *
                  <span className="sr-only">Subject Name</span>
                </label>
                <input
                  id="create-subj-name"
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  disabled={submitting}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="create-subj-code">Course code <span>Optional</span></label>
                <input
                  id="create-subj-code"
                  type="text"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="create-subj-desc">Description <span>Optional</span></label>
                <textarea
                  id="create-subj-desc"
                  rows={3}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="modal-actions create-notebook-actions">
                <span className="required-note">* Required</span><button type="button" className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create Notebook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Notebook Modal */}
      {editingSubject && (
        <div className="modal-backdrop" onClick={() => setEditingSubject(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit notebook</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setEditingSubject(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleEditSubmit} className="modal-form">
              {formError && <div className="form-error-banner">{formError}</div>}
              <div className="form-group">
                <label htmlFor="edit-subj-name">
                  Notebook name *
                  <span className="sr-only">Subject Name</span>
                </label>
                <input
                  id="edit-subj-name"
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  disabled={submitting}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit-subj-code">Course code (optional)</label>
                <input
                  id="edit-subj-code"
                  type="text"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit-subj-desc">Description (optional)</label>
                <textarea
                  id="edit-subj-desc"
                  rows={3}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingSubject && (
        <div className="modal-backdrop" onClick={() => setDeletingSubject(null)}>
          <div className="modal-content modal-content-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete notebook?</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setDeletingSubject(null)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="modal-body-p">
              Are you sure you want to permanently delete <strong>{deletingSubject.name}</strong>?
              All associated documents, conversations, and notes will be permanently removed.
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeleteConfirm}
                disabled={submitting}
                data-testid="confirm-delete-subject-btn"
              >
                {submitting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workspace Settings */}
      {isSettingsOpen && (
        <SettingsPanel
          currentUser={currentUser}
          isPrivacyBannerDismissed={isPrivacyBannerDismissed}
          onShowPrivacyNotice={handleShowPrivacyNotice}
          onRequestReset={() => {
            setIsSettingsOpen(false);
            setIsResetConfirmOpen(true);
          }}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}

      {/* Reset Workspace Confirmation Modal */}
      {isResetConfirmOpen && (
        <div className="modal-backdrop" onClick={() => setIsResetConfirmOpen(false)}>
          <div className="modal-content modal-content-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Reset Workspace?</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsResetConfirmOpen(false)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="modal-body-p">
              Start a new guest workspace? This will create a fresh workspace for this browser, clearing all local notebooks, documents, and notes.
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleResetConfirm}
              >
                Reset Workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
