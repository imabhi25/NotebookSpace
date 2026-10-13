import React, { useState } from 'react';
import { api } from '../api';
import { SubjectSettings, User } from '../types';
import { ThemeSetting, getThemeSetting, setThemeSetting } from '../theme';

const DEFAULTS_KEY = 'notebookspace_default_response_settings';
const LENGTHS: SubjectSettings['response_length'][] = ['concise', 'default', 'detailed'];
const STYLES: SubjectSettings['response_style'][] = ['general', 'learning-guide'];

// Returns the saved defaults for new notebooks, or null when the user has never changed them.
export const readDefaultResponseSettings = (): SubjectSettings | null => {
  try {
    const raw = window.localStorage.getItem(DEFAULTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (LENGTHS.includes(parsed?.response_length) && STYLES.includes(parsed?.response_style)) {
      return { response_length: parsed.response_length, response_style: parsed.response_style };
    }
  } catch {
    // ignore
  }
  return null;
};

interface SettingsPanelProps {
  currentUser?: User | null;
  isPrivacyBannerDismissed: boolean;
  onShowPrivacyNotice: () => void;
  onRequestReset: () => void;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  currentUser,
  isPrivacyBannerDismissed,
  onShowPrivacyNotice,
  onRequestReset,
  onClose,
}) => {
  const [defaults, setDefaults] = useState<SubjectSettings>(
    () => readDefaultResponseSettings() || { response_length: 'default', response_style: 'general' }
  );
  const [theme, setTheme] = useState<ThemeSetting>(getThemeSetting);
  const chooseTheme = (next: ThemeSetting) => {
    setTheme(next);
    setThemeSetting(next);
  };
  const [exportState, setExportState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');

  const saveDefaults = (next: SubjectSettings) => {
    setDefaults(next);
    try {
      window.localStorage.setItem(DEFAULTS_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  const handleExport = async () => {
    setExportState('working');
    try {
      const subjects = await api.getSubjects(true);
      const notebooks = [];
      for (const s of subjects) {
        const notes = await api.getNotes(s.id);
        notebooks.push({
          name: s.name,
          course_code: s.course_code,
          description: s.description,
          is_archived: s.is_archived,
          notes: notes.map((n) => ({
            title: n.title,
            content: n.content,
            is_saved_answer: n.is_saved_answer,
            citations: n.citations,
            created_at: n.created_at,
            updated_at: n.updated_at,
          })),
        });
      }
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), notebooks }, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `notebookspace-notes-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportState('done');
    } catch {
      setExportState('failed');
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="settings-panel-title">Settings</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="settings-panel-body">
          <section className="settings-section" aria-labelledby="settings-appearance-title">
            <h3 id="settings-appearance-title" className="settings-section-title">Appearance</h3>
            <div className="sidebar-filter-pills home-filter-tabs theme-control" role="radiogroup" aria-labelledby="settings-appearance-title">
              {(['auto', 'light', 'dark'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={theme === option}
                  className={`sidebar-filter-pill ${theme === option ? 'active' : ''}`}
                  onClick={() => chooseTheme(option)}
                >
                  {option === 'auto' ? 'Auto' : option === 'light' ? 'Light' : 'Dark'}
                </button>
              ))}
            </div>
            <p className="settings-section-hint">Auto follows your device.</p>
          </section>

          <section className="settings-section" aria-labelledby="settings-defaults-title">
            <h3 id="settings-defaults-title" className="settings-section-title">Default responses</h3>
            <p className="settings-section-hint">Used for new notebooks. Each notebook can change its own.</p>
            <div className="form-group">
              <label htmlFor="default-resp-length">Response Length</label>
              <select
                id="default-resp-length"
                value={defaults.response_length}
                onChange={(e) =>
                  saveDefaults({ ...defaults, response_length: e.target.value as SubjectSettings['response_length'] })
                }
              >
                <option value="concise">Concise (brief, direct facts)</option>
                <option value="default">Default (balanced)</option>
                <option value="detailed">Detailed (in-depth breakdown)</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="default-resp-style">Response Style</label>
              <select
                id="default-resp-style"
                value={defaults.response_style}
                onChange={(e) =>
                  saveDefaults({ ...defaults, response_style: e.target.value as SubjectSettings['response_style'] })
                }
              >
                <option value="general">General (objective academic assistant)</option>
                <option value="learning-guide">Learning Guide (interactive tutor, step-by-step)</option>
              </select>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="settings-data-title">
            <h3 id="settings-data-title" className="settings-section-title">Your data</h3>
            <div className="settings-rows">
              <button
                type="button"
                className="settings-row"
                onClick={handleExport}
                disabled={exportState === 'working'}
              >
                <span className="settings-row-label">Export notes</span>
                <span className="settings-row-value" role="status">
                  {exportState === 'working'
                    ? 'Preparing...'
                    : exportState === 'done'
                    ? 'Downloaded'
                    : exportState === 'failed'
                    ? 'Export failed. Try again.'
                    : 'JSON file'}
                </span>
              </button>
              <button
                type="button"
                className="settings-row"
                onClick={onShowPrivacyNotice}
                disabled={!isPrivacyBannerDismissed}
              >
                <span className="settings-row-label">Show privacy notice</span>
                <span className="settings-row-value">{isPrivacyBannerDismissed ? 'Hidden' : 'Showing'}</span>
              </button>
              <button type="button" className="settings-row settings-row-danger" onClick={onRequestReset}>
                <span className="settings-row-label">Reset Workspace</span>
              </button>
            </div>
          </section>

          <section className="settings-section" aria-labelledby="settings-about-title">
            <h3 id="settings-about-title" className="settings-section-title">About</h3>
            <div className="settings-rows">
              <div className="settings-row settings-row-static">
                <span className="settings-row-label">Workspace</span>
                <span className="settings-row-value" data-testid="guest-workspace-badge">
                  {currentUser?.email || 'Guest Workspace'}
                </span>
              </div>
            </div>
            <p className="settings-section-hint">Your workspace data is private to this browser.</p>
            <p className="settings-section-hint">Independent student project, not affiliated with Google.</p>
          </section>
        </div>
      </div>
    </div>
  );
};
