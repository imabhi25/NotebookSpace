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
  children,
}) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'updated_at' | 'name' | 'created_at'>('updated_at');
  const [tab, setTab] = useState<'active' | 'archived'>('active');

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

  // A short mark for each notebook card: the course number when there is one, else initials.
  const notebookMark = (s: Subject) => {
    const code = (s.course_code || '').trim();
    const digits = code.match(/\d{3,4}/);
    if (digits) return digits[0];
    if (code) return code.slice(0, 4).toUpperCase();
    return s.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join('');
  };

  const renderCardMenu = (s: Subject) => {
    const isMenuOpen = menuOpenSubjectId === s.id;
    return (
      <div className="notebook-item-actions" onClick={(e) => e.stopPropagation()}>
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
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
              <span>Delete</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="dashboard-shell-layout">
      {children ? (
        /* An open notebook takes the whole window; the logo in its top bar leads back here. */
        <main className="dashboard-main-content">
          <div className="dashboard-children-wrapper">{children}</div>
        </main>
      ) : (
        <div className="home-page">
          <header className="home-top-bar">
            <span className="home-brand">
              <span className="brand-logo-letter" aria-hidden="true">N</span>
              <span className="home-brand-name">NotebookSpace</span>
            </span>

            <div className="home-tabs" role="tablist" aria-label="Notebook filter">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'active'}
                className={`home-tab ${tab === 'active' ? 'active' : ''}`}
                onClick={() => setTab('active')}
              >
                My notebooks
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'archived'}
                className={`home-tab ${tab === 'archived' ? 'active' : ''}`}
                onClick={() => setTab('archived')}
              >
                Archived
              </button>
            </div>

            <div className="home-top-right">
              <label className="home-search">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search notebooks"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search notebooks"
                />
                {search && (
                  <button
                    type="button"
                    className="home-search-clear"
                    onClick={() => setSearch('')}
                    aria-label="Clear search query"
                  >
                    &times;
                  </button>
                )}
              </label>

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

              <button
                type="button"
                className="home-icon-btn"
                onClick={() => setIsSettingsOpen(true)}
                title="Workspace settings"
                aria-label="Workspace settings"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>

              <span
                className="workspace-avatar"
                role="img"
                aria-label={currentUser?.email ? `Signed in as ${currentUser.email}` : 'Guest workspace'}
                title={currentUser?.email ? `Signed in as ${currentUser.email}` : 'Guest workspace, private to this browser'}
              >
                {(currentUser?.email || 'G').charAt(0).toUpperCase()}
              </span>
            </div>
          </header>

          <div className="home-content">
            {!isPrivacyBannerDismissed && (
              <div className="home-privacy-note" data-testid="guest-workspace-banner">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <p>
                  Your notebooks, sources and notes are private to this browser and stay after a reload. No sign-in needed.
                </p>
                <button
                  type="button"
                  className="home-icon-btn"
                  onClick={handleDismissBanner}
                  aria-label="Dismiss privacy notice"
                  title="Dismiss notice"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}

            <div className="home-heading-row">
              <h1 className="home-heading">{tab === 'archived' ? 'Archived notebooks' : 'My notebooks'}</h1>
              <button
                type="button"
                className="btn-new-notebook"
                onClick={openCreateModal}
                data-testid="create-subject-btn"
                aria-label="Create new notebook"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>New notebook</span>
              </button>
            </div>

            {loading ? (
              <div className="dashboard-loading-state">
                <div className="step-spinner spinner-large" />
                <p>Loading notebooks...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="home-empty" data-testid="dashboard-empty-state">
                <EmptyStateIcon />
                <h2>
                  {tab === 'archived'
                    ? 'No archived notebooks'
                    : search
                    ? 'No matching notebooks found'
                    : 'Create your first notebook'}
                </h2>
                <p>
                  {tab === 'archived'
                    ? 'Archived notebooks will appear here.'
                    : search
                    ? `No notebooks match "${search}". Try adjusting your search query.`
                    : 'Organize course syllabi, lecture notes, and assignments into notebooks.'}
                </p>
              </div>
            ) : (
              <div className="notebook-grid" role="list" key={`${tab}-${sortBy}`}>
                {tab === 'active' && !search && (
                  <button
                    type="button"
                    role="listitem"
                    className="notebook-card notebook-card-new"
                    onClick={openCreateModal}
                  >
                    <span className="notebook-card-new-icon" aria-hidden="true">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </span>
                    <span>Create new notebook</span>
                  </button>
                )}
                {filtered.map((s) => (
                  <div
                    key={s.id}
                    role="listitem"
                    className={`notebook-card ${activeSubjectId === s.id ? 'active' : ''}`}
                    onClick={() => onOpenSubject(s.id)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && e.key === 'Enter') onOpenSubject(s.id);
                    }}
                    tabIndex={0}
                    data-testid={`subject-card-${s.id}`}
                  >
                    <div className="notebook-card-top">
                      <span className="notebook-card-mark" aria-hidden="true">
                        {notebookMark(s)}
                      </span>
                      {renderCardMenu(s)}
                    </div>
                    <div>
                      <h2 className="notebook-card-title" title={s.name}>
                        {s.name}
                      </h2>
                      <div className="notebook-card-meta">
                        {(s.source_count ?? 0) === 0 ? (
                          <>
                            {s.course_code ? `${s.course_code} · ` : ''}
                            <span className="notebook-card-cta">Add your first source</span>
                          </>
                        ) : (
                          <>
                            {formatDate(s.updated_at)} · {s.source_count}{' '}
                            {s.source_count === 1 ? 'source' : 'sources'}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
                  Notebook name
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
                <label htmlFor="create-subj-code">Course code (optional)</label>
                <input
                  id="create-subj-code"
                  type="text"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
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
                  {submitting ? 'Creating…' : 'Create'}
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
                  Notebook name
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
