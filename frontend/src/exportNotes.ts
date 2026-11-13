import { api } from './api';

/** Downloads every notebook's notes as one JSON file. Rejects if any request fails. */
export async function exportAllNotes(): Promise<void> {
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
  const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), notebooks }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `notebookspace-notes-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
