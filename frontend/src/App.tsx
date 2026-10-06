import React, { useState, useEffect } from 'react';
import { AskResponse, Citation, DocumentItem, PassageItem } from './types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

export function App() {
  const [question, setQuestion] = useState('');
  const [lastSearched, setLastSearched] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResponse | null>(null);

  // Cited page pane
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [passageLoading, setPassageLoading] = useState(false);
  const [passages, setPassages] = useState<PassageItem[]>([]);

  // Documents and upload
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [showDocs, setShowDocs] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  // Fetch documents list on mount
  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch {
      // Ignore initial doc fetch failure
    }
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedCitation(null);
    setPassages([]);
    setLastSearched(trimmed);

    try {
      const res = await fetch(`${API_BASE_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed, k: 5 }),
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const data: AskResponse = await res.json();
      setResult(data);

      // If citations exist and not abstained, automatically select first citation
      if (data.citations && data.citations.length > 0 && !data.abstained) {
        loadPassage(data.citations[0]);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while answering.');
    } finally {
      setLoading(false);
    }
  };

  const loadPassage = async (citation: Citation) => {
    setSelectedCitation(citation);
    setPassageLoading(true);
    try {
      const url = `${API_BASE_URL}/passages?file=${encodeURIComponent(citation.file)}&page=${citation.page}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setPassages(data);
      } else {
        setPassages([]);
      }
    } catch {
      setPassages([]);
    } finally {
      setPassageLoading(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    setUploading(true);
    setUploadMsg(null);

    const formData = new FormData();
    formData.append('file', uploadFile);

    try {
      const res = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Upload failed');
      }

      const data = await res.json();
      setUploadMsg(`Successfully uploaded ${data.file_name}: stored ${data.chunks_stored} chunk(s).`);
      setUploadFile(null);
      fetchDocuments();
    } catch (err: any) {
      setUploadMsg(`Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const getPlainAbstainReason = (reason?: string | null) => {
    switch (reason) {
      case 'not_found':
        return 'The requested information could not be found in the course documents.';
      case 'low_retrieval_score':
        return 'No sufficiently relevant course passages were found for this question.';
      case 'invalid_citation':
        return 'The generated answer could not be verified against the cited course documents.';
      case 'bad_output':
        return 'Unable to produce a valid response format from the course documents.';
      default:
        return reason ? `The assistant abstained (${reason}).` : 'The assistant abstained from answering.';
    }
  };

  return (
    <div className="app-wrapper">
      <header className="header">
        <h1>Course-Document Assistant</h1>
        <button
          className="btn btn-secondary"
          onClick={() => setShowDocs(!showDocs)}
          aria-expanded={showDocs}
        >
          {showDocs ? 'Hide Documents' : `View Documents (${documents.length})`}
        </button>
      </header>

      {/* Upload and Documents Section */}
      <section className="upload-section">
        <form onSubmit={handleUpload} className="upload-row">
          <label htmlFor="pdf-upload" style={{ fontWeight: 500, fontSize: '0.9rem' }}>
            Upload PDF Document:
          </label>
          <input
            id="pdf-upload"
            type="file"
            accept=".pdf"
            onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
          />
          <button type="submit" className="btn" disabled={!uploadFile || uploading}>
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
          <span className="file-limit-note">Max file size: 10 MB limit</span>
        </form>

        {uploadMsg && (
          <p style={{ marginTop: '8px', fontSize: '0.85rem', color: uploadMsg.startsWith('Error') ? '#b91c1c' : '#15803d' }}>
            {uploadMsg}
          </p>
        )}

        {showDocs && (
          <div className="documents-list">
            <h3 style={{ fontSize: '0.9rem', marginBottom: '8px' }}>Uploaded Documents</h3>
            {documents.length === 0 ? (
              <p className="empty-state">No documents stored yet.</p>
            ) : (
              documents.map((doc, idx) => (
                <div key={idx} className="doc-item">
                  <span style={{ fontWeight: 600 }}>{doc.file_name}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {doc.chunk_count} chunk(s) &bull; {doc.upload_date ? new Date(doc.upload_date).toLocaleDateString() : 'N/A'}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </section>

      {/* Main Two-Column Layout */}
      <main className="main-layout">
        {/* Left Column */}
        <section className="column-left">
          {/* Question Box */}
          <div className="card question-box">
            <label htmlFor="question-input" style={{ fontWeight: 600, fontSize: '0.95rem' }}>
              Ask a question about your course materials:
            </label>
            <textarea
              id="question-input"
              className="question-input"
              placeholder="e.g., When is the final exam and what is the grading breakdown?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={loading}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn"
                onClick={handleAsk}
                disabled={loading || !question.trim()}
              >
                {loading ? 'Searching & Answering...' : 'Ask Question'}
              </button>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="status-box status-loading" role="status">
              Searching course documents and verifying answer...
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="status-box status-error" role="alert">
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Abstained State */}
          {result && result.abstained && (
            <div className="status-box status-abstained" data-testid="abstained-view">
              <div className="abstain-reason">{getPlainAbstainReason(result.abstain_reason)}</div>
              <div className="abstain-query">Searched for: &ldquo;{lastSearched}&rdquo;</div>
            </div>
          )}

          {/* Conflict State */}
          {result && !result.abstained && result.conflict_detected && result.conflicts && result.conflicts.length > 0 && (
            <div className="conflict-container" data-testid="conflict-view">
              <div className="conflict-header">
                <span style={{ fontSize: '1.25rem' }}>⚠️</span>
                <h2 className="conflict-heading">These documents disagree</h2>
              </div>
              {result.conflicts.map((conf, cIdx) => (
                <div key={cIdx} style={{ marginBottom: '12px' }}>
                  <div className="conflict-topic">Conflict Topic: {conf.topic}</div>
                  <div className="conflict-cards-row">
                    {conf.claims.map((claim, clIdx) => (
                      <div
                        key={clIdx}
                        className="conflict-source-card"
                        style={{ cursor: 'pointer' }}
                        onClick={() => loadPassage({ file: claim.file, page: claim.page })}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="source-value">&ldquo;{claim.value}&rdquo;</div>
                        <div className="source-meta">
                          <div><strong>File:</strong> {claim.file} (Page {claim.page})</div>
                          {claim.upload_date && <div><strong>Uploaded:</strong> {claim.upload_date}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Answer State */}
          {result && !result.abstained && (
            <div className="card answer-card" data-testid="answer-view">
              <h2>Answer</h2>
              <div className="answer-text">{result.answer}</div>

              {result.citations && result.citations.length > 0 && (
                <div className="citations-section">
                  <h3>Citations</h3>
                  <div className="chips-row">
                    {result.citations.map((cit, idx) => {
                      const isActive =
                        selectedCitation?.file === cit.file &&
                        selectedCitation?.page === cit.page;
                      return (
                        <button
                          key={idx}
                          type="button"
                          className={`chip ${isActive ? 'active' : ''}`}
                          onClick={() => loadPassage(cit)}
                          data-testid={`citation-chip-${idx}`}
                        >
                          📄 {cit.file} p.{cit.page}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right Column: Cited Page Text */}
        <section className="column-right">
          <div className="card passage-viewer" data-testid="passage-pane">
            <div className="passage-header">
              <h2 style={{ fontSize: '1.1rem', color: '#1e293b' }}>Cited Document Passage</h2>
              {selectedCitation && (
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  {selectedCitation.file} &bull; Page {selectedCitation.page}
                </span>
              )}
            </div>

            {passageLoading ? (
              <p className="empty-state">Loading passage text...</p>
            ) : selectedCitation ? (
              <div className="passage-content" data-testid="passage-content">
                <div style={{ marginBottom: '8px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Showing content from {selectedCitation.file} (Page {selectedCitation.page}):
                </div>
                {passages.length > 0 ? (
                  passages.map((p, idx) => (
                    <p key={idx} style={{ marginBottom: '8px' }}>
                      {p.text || p.chunk_text}
                    </p>
                  ))
                ) : (
                  <p className="empty-state">No text chunks found for this page.</p>
                )}
              </div>
            ) : (
              <p className="empty-state">
                Click a citation chip or conflict card to inspect the cited page text here.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
