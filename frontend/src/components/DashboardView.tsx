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
  onResetWorkspace?: () => Promise<void>;
  isMobileSidebarOpen?: boolean;
  onSetMobileSidebarOpen?: (open: boolean) => void;
  children?: React.ReactNode;
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
  onResetWorkspace,
  isMobileSidebarOpen: controlledMobileOpen,
  onSetMobileSidebarOpen,
  children,
}) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'updated_at' | 'name' | 'created_at'>('updated_at');
  const [tab, setTab] = useState<'active' | 'archived'>('active');

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

  const handleResetConfirm = async () => {
    setIsResetConfirmOpen(false);
    if (onResetWorkspace) {
      await onResetWorkspace();
    }
  };

  // Filter and sort notebooks
  const filtered = subjects
    .filter((s) => (tab === 'active' ? !s.is_archived : s.is_archived))
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

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return iso;
    }
  };

  return (
    <div className={`dashboard-shell-layout sidebar-motion-${sidebarMotion}`}>
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
                const isMenuOpen = menuOpenSubjectId === s.id;

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

                    {/* Single "⋯" Overflow Action Menu */}
                    <div
                      className="notebook-item-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="notebook-menu-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenSubjectId(isMenuOpen ? null : s.id);
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

                      {isMenuOpen && (
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
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </aside>

      {/* ======================================================================
          2. MAIN AREA: Selected Notebook Detail View or Calm Empty State
          ====================================================================== */}
      <main className="dashboard-main-content">
        {/* Reopen Floating Tab on Desktop when sidebar is collapsed */}
        {isCollapsedDesktop && (
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

        {/* Small screens: with no notebook open there is no top bar, so the drawer needs its own opener */}
        {!children && (
          <button
            type="button"
            className="floating-sidebar-reopen-btn mobile-sidebar-open-btn"
            onClick={() => setMobileOpen(true)}
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

        {/* Slim Dismissible Privacy Banner */}
        {!isPrivacyBannerDismissed && (
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
        )}

        {/* Content View: Children (Workspace) or Shell Empty State */}
        {children ? (
          <div className="dashboard-children-wrapper">
            {children}
          </div>
        ) : loading ? (
          <div className="dashboard-loading-state">
            <div className="step-spinner spinner-large" />
            <p>Loading notebooks...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="dashboard-empty-state" data-testid="dashboard-empty-state">
            <div className="empty-state-brand-mark" aria-hidden="true">
              <EmptyStateIcon />
            </div>
            <h2 className="empty-heading">
              {tab === 'archived'
                ? 'No archived notebooks'
                : search
                ? 'No matching notebooks found'
                : 'Create your first notebook'}
            </h2>
            <p className="empty-subtext">
              {tab === 'archived'
                ? 'Archived notebooks will appear here.'
                : search
                ? `No notebooks match "${search}". Try adjusting your search query.`
                : 'Organize course syllabi, lecture notes, and assignments into notebooks.'}
            </p>
            {tab === 'active' && !search && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={openCreateModal}
              >
                + New notebook
              </button>
            )}
          </div>
        ) : (
          <div className="dashboard-select-prompt-state">
            <div className="empty-state-brand-mark" aria-hidden="true">
              <EmptyStateIcon />
            </div>
            <h2 className="empty-heading">Select a notebook to start studying</h2>
            <p className="empty-subtext">
              Choose a notebook from the sidebar or create a new one to ask questions with verified source citations.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={openCreateModal}
            >
              + New notebook
            </button>
          </div>
        )}
      </main>

      {/* ======================================================================
          3. MODALS
          ====================================================================== */}
      {/* Create Notebook Modal */}
      {isCreateOpen && (
        <div className="modal-backdrop" onClick={() => setIsCreateOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                Create new notebook
                <span className="sr-only">Create New Subject Notebook</span>
              </h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsCreateOpen(false)}
                aria-label="Close"
              >
                &times;
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
                  placeholder="e.g. EECS 3101 — Algorithms"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  disabled={submitting}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="create-subj-code">Course code (optional)</label>
                <input
                  id="create-subj-code"
                  type="text"
                  placeholder="e.g. EECS 3101"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="create-subj-desc">Description (optional)</label>
                <textarea
                  id="create-subj-desc"
                  rows={3}
                  placeholder="e.g. Design and analysis of efficient algorithms, graphs, and dynamic programming."
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsCreateOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
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
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setEditingSubject(null)}
                  disabled={submitting}
                >
                  Cancel
                </button>
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
                className="btn btn-secondary"
                onClick={() => setDeletingSubject(null)}
                disabled={submitting}
              >
                Cancel
              </button>
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
                className="btn btn-secondary"
                onClick={() => setIsResetConfirmOpen(false)}
              >
                Cancel
              </button>
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
