const API_BASE = 'http://localhost:4000';

export async function fetchComments(sketchId) {
  const res = await fetch(`${API_BASE}/comments?sketchId=${encodeURIComponent(sketchId)}`);
  if (!res.ok) throw new Error(`Server responded ${res.status}`);
  return res.json();
}

export async function postComment(sketchId, author, text) {
  const res = await fetch(`${API_BASE}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sketchId, author, text }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Server responded ${res.status}`);
  }
  return res.json();
}
