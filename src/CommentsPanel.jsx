import React, { useState } from 'react';

export default function CommentsPanel({ annotations = [], disabled, onAdd, selectedId, onSelect }) {
  const [draft, setDraft] = useState('');
  const comments = annotations.filter(item => item.type === 'comment');
  return <div className="comments-panel">
    <h3>Comments</h3>
    <textarea aria-label="New comment" placeholder="Write a note for this page" value={draft}
      disabled={disabled} onChange={event => setDraft(event.target.value)} />
    <button disabled={disabled || !draft.trim()} onClick={() => {
      onAdd(draft); setDraft('');
    }}>Add page comment</button>
    <p className="muted">Notes appear near the top of this page and remain comments in your saved PDF.</p>
    <ul aria-label="Page comments" className="comment-list">
      {comments.map((comment, index) => <li key={comment.id}>
        <button className={selectedId === comment.id ? 'active' : ''} onClick={() => onSelect(comment.id)}
          aria-label={`Read comment ${index + 1}`} aria-pressed={selectedId === comment.id}>
          <strong>Note {index + 1}</strong><span>{comment.text}</span>
        </button>
      </li>)}
    </ul>
    {!comments.length && <p className="muted">No comments on this page.</p>}
  </div>;
}

export function CommentMarkers({ viewport, annotations = [], selectedId, onSelect }) {
  const comments = annotations.filter(item => item.type === 'comment');
  return <div className="comment-markers" aria-label="Comment markers">
    {comments.map((item, index) => {
      const rect = viewport.convertToViewportRectangle([item.x, item.y, item.x + 20, item.y + 20]);
      const x = Math.min(rect[0], rect[2]);
      const y = Math.min(rect[1], rect[3]);
      return <button key={item.id} className={`comment-marker ${selectedId === item.id ? 'active' : ''}`}
        style={{ left: x, top: y }} title={item.text} aria-label={`Comment marker ${index + 1}`}
        onClick={() => onSelect(item.id)}>{index + 1}</button>;
    })}
  </div>;
}
