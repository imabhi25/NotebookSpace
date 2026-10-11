import React, { useState } from 'react';
import { Subject } from '../types';

interface DashboardViewProps {
  subjects: Subject[];
  loading: boolean;
  onOpenSubject: (subjectId: string) => void;
  onCreateSubject: (data: { name: string; course_code?: string; description?: string }) => Promise<void>;
  onUpdateSubject: (subjectId: string, data: { name?: string; course_code?: string; description?: string }) => Promise<void>;
  onArchiveSubject: (subjectId: string) => Promise<void>;
  onRestoreSubject: (subjectId: string) => Promise<void>;
  onDeleteSubject: (subjectId: string) => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  subjects,
  loading,
  onOpenSubject,
  onCreateSubject,
  onUpdateSubject,
  onArchiveSubject,
  onRestoreSubject,
  onDeleteSubject,
}) => {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'updated_at' | 'name' | 'created_at'>('updated_at');
  const [tab, setTab] = useState<'active' | 'archived'>('active');

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

  const openCreateModal = () => {
    setFormName('');
    setFormCode('');
    setFormDesc('');
    setFormError(null);
    setIsCreateOpen(true);
  };

  const openEditModal = (s: Subject, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSubject(s);
    setFormName(s.name);
    setFormCode(s.course_code || '');
    setFormDesc(s.description || '');
    setFormError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError('Subject name is required.');
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await onCreateSubject({
        name: formName.trim(),
        course_code: formCode.trim() || undefined,
        description: formDesc.trim() || undefined,
      });
      setIsCreateOpen(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to create subject.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSubject || !formName.trim()) {
      setFormError('Subject name is required.');
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
      setFormError(err.message || 'Failed to update subject.');
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
      alert(err.message || 'Failed to delete subject.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter and sort
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
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="dashboard-root">
      {/* Dashboard Header Bar */}
      <div className="dashboard-header-container">
        <div className="dashboard-title-area">
          <h1 className="dashboard-main-title">Study Notebooks</h1>
          <p className="dashboard-sub-title">
            Select a course notebook to inspect verified source citations and study collaboratively.
          </p>
        </div>
        <div className="dashboard-actions-area">
          <button
            type="button"
            className="btn btn-primary btn-new-subject"
            onClick={openCreateModal}
            data-testid="create-subject-btn"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Create Subject</span>
          </button>
        </div>
      </div>

      {/* Guest Workspace Browser Notice */}
      <div className="guest-workspace-notice" data-testid="guest-workspace-banner">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <div className="guest-workspace-notice-content">
          <span className="guest-workspace-notice-title">Private Browser Workspace:</span>
          <span>Your course notebooks, uploaded materials, and saved notes are private to this browser session and persist across reloads. No sign-in required.</span>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="dashboard-controls-bar">
        <div className="dashboard-search-box">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="dashboard-search-input"
            placeholder="Search subjects or course codes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search subjects"
          />
        </div>

        <div className="dashboard-filter-tabs">
          <button
            type="button"
            className={`tab-btn ${tab === 'active' ? 'active' : ''}`}
            onClick={() => setTab('active')}
          >
            Active Notebooks
          </button>
          <button
            type="button"
            className={`tab-btn ${tab === 'archived' ? 'active' : ''}`}
            onClick={() => setTab('archived')}
          >
            Archived
          </button>
        </div>

        <div className="dashboard-sort-box">
          <label htmlFor="sort-select" className="sort-label">Sort:</label>
          <select
            id="sort-select"
            className="sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
          >
            <option value="updated_at">Last Activity</option>
            <option value="name">Subject Name</option>
            <option value="created_at">Date Created</option>
          </select>
        </div>
      </div>

      {/* Main Grid or Empty State */}
      {loading ? (
        <div className="dashboard-loading-state">
          <div className="step-spinner" />
          <p>Loading notebooks...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="dashboard-empty-state" data-testid="dashboard-empty-state">
          <div className="empty-state-brand-mark">
            <span className="brand-logo-letter">N</span>
          </div>
          <h2 className="empty-heading">
            {tab === 'archived'
              ? 'No archived notebooks'
              : search
              ? 'No matching notebooks found'
              : 'Create your first subject notebook'}
          </h2>
          <p className="empty-subtext">
            {tab === 'archived'
              ? 'Archived subjects will appear here.'
              : search
              ? `No subjects match "${search}". Try adjusting your search query.`
              : 'Organize course syllabi, lecture notes, and assignments by subject. For example: EECS 3101 — Algorithms or EECS 2031 — Software Tools.'}
          </p>
          {tab === 'active' && !search && (
            <button type="button" className="btn btn-primary" onClick={openCreateModal}>
              Create Subject
            </button>
          )}
        </div>
      ) : (
        <div className="subject-cards-grid">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="subject-card"
              onClick={() => onOpenSubject(s.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onOpenSubject(s.id);
              }}
              data-testid={`subject-card-${s.id}`}
            >
              <div className="subject-card-header">
                <div className="subject-card-badges">
                  {s.course_code && (
                    <span className="course-code-badge">{s.course_code}</span>
                  )}
                  {s.is_archived && <span className="archived-badge">Archived</span>}
                </div>
                <div className="subject-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className="card-action-btn"
                    title="Edit Subject"
                    onClick={(e) => openEditModal(s, e)}
                    aria-label={`Edit ${s.name}`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                    </svg>
                  </button>
                  {s.is_archived ? (
                    <button
                      type="button"
                      className="card-action-btn"
                      title="Restore Subject"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRestoreSubject(s.id);
                      }}
                      aria-label={`Restore ${s.name}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="1 4 1 10 7 10" />
                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="card-action-btn"
                      title="Archive Subject"
                      onClick={(e) => {
                        e.stopPropagation();
                        onArchiveSubject(s.id);
                      }}
                      aria-label={`Archive ${s.name}`}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="21 8 21 21 3 21 3 8" />
                        <rect x="1" y="3" width="22" height="5" />
                        <line x1="10" y1="12" x2="14" y2="12" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    className="card-action-btn card-action-delete"
                    title="Delete Subject"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingSubject(s);
                    }}
                    aria-label={`Delete ${s.name}`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>

              <h3 className="subject-card-title">{s.name}</h3>

              {s.description && (
                <p className="subject-card-description">{s.description}</p>
              )}

              <div className="subject-card-footer">
                <span className="source-count-indicator">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span>{s.source_count} {s.source_count === 1 ? 'source' : 'sources'}</span>
                </span>
                <span className="subject-card-date">
                  Updated {formatDate(s.updated_at)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Subject Modal */}
      {isCreateOpen && (
        <div className="modal-backdrop" onClick={() => setIsCreateOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Create New Subject Notebook</h2>
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
                <label htmlFor="create-subj-name">Subject Name *</label>
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
                <label htmlFor="create-subj-code">Course Code (Optional)</label>
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
                <label htmlFor="create-subj-desc">Description (Optional)</label>
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

      {/* Edit Subject Modal */}
      {editingSubject && (
        <div className="modal-backdrop" onClick={() => setEditingSubject(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Subject Notebook</h2>
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
                <label htmlFor="edit-subj-name">Subject Name *</label>
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
                <label htmlFor="edit-subj-code">Course Code (Optional)</label>
                <input
                  id="edit-subj-code"
                  type="text"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="edit-subj-desc">Description (Optional)</label>
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
              <h2>Delete Subject?</h2>
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
    </div>
  );
};
