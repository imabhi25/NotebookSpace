import { ReferenceIcon } from './ReferenceIcon';
import React, { useState } from 'react';
import { SubjectSettings, User } from '../types';
import { useModalFocus } from '../useModalFocus';
import { exportAllNotes } from '../exportNotes';
import { ReadingFont, getReadingFont, setReadingFont } from '../readingFont';

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
  onRequestReset: () => void;
  onClose: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ onRequestReset, onClose }) => {
  const modalRef = useModalFocus(true, onClose);
  const [defaults, setDefaults] = useState<SubjectSettings>(
    () => readDefaultResponseSettings() || { response_length: 'default', response_style: 'general' }
  );
  const [font, setFont] = useState<ReadingFont>(getReadingFont);
  const chooseFont = (next: ReadingFont) => {
    setFont(next);
    setReadingFont(next);
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
      await exportAllNotes();
      setExportState('done');
    } catch {
      setExportState('failed');
    }
  };

  // Answer depth: Concise = brief direct answers, Detailed = in-depth study guide.
  const depth: 'concise' | 'detailed' = defaults.response_length === 'detailed' ? 'detailed' : 'concise';
  const chooseDepth = (next: 'concise' | 'detailed') =>
    saveDefaults(next === 'concise'
      ? { response_length: 'concise', response_style: 'general' }
      : { response_length: 'detailed', response_style: 'learning-guide' });

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal-content settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-panel-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="settings-panel-title">Settings</h2>
          <button type="button" className="modal-close-btn" onClick={onClose} aria-label="Close">
            <ReferenceIcon name="close" size={16} />
          </button>
        </div>

        <div className="settings-panel-body">
          <section className="settings-section" aria-labelledby="settings-reading-title">
            <h3 id="settings-reading-title" className="settings-section-title">Reading &amp; study</h3>
            <div className="settings-field">
              <label htmlFor="reading-font">Reading font</label>
              <select id="reading-font" value={font} onChange={(e) => chooseFont(e.target.value as ReadingFont)}>
                <option value="sans">Clean Sans (Inter)</option>
                <option value="serif">Academic Serif (Editorial)</option>
              </select>
            </div>
            <div className="settings-field">
              <label htmlFor="answer-depth">Answer depth</label>
              <select id="answer-depth" value={depth} onChange={(e) => chooseDepth(e.target.value as 'concise' | 'detailed')}>
                <option value="concise">Concise (Bullet Points)</option>
                <option value="detailed">Detailed (Study Guide)</option>
              </select>
            </div>
            <p className="settings-section-hint">Depth applies to new notebooks. Each notebook can change its own.</p>
          </section>

          <section className="settings-section" aria-labelledby="settings-data-title">
            <h3 id="settings-data-title" className="settings-section-title">Privacy &amp; storage</h3>
            <p className="settings-local-note"><span className="settings-local-dot" aria-hidden="true" />Stored locally in your browser. No account required.</p>
            <div className="settings-rows">
              <div className="settings-row settings-row-static">
                <span className="settings-row-label">Export all notes</span>
                <button type="button" className="settings-action-btn" onClick={handleExport} disabled={exportState === 'working'}>
                  {exportState === 'working' ? 'Preparing…' : 'Export JSON'}
                </button>
              </div>
              {(exportState === 'done' || exportState === 'failed') && (
                <p className="settings-section-hint" role="status">{exportState === 'done' ? 'Downloaded' : 'Export failed. Try again.'}</p>
              )}
              <div className="settings-row settings-row-static">
                <span className="settings-row-label">Reset workspace</span>
                <button type="button" className="settings-action-btn settings-action-danger" aria-label="Reset Workspace" onClick={onRequestReset}>
                  Reset…
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
