import { useState, useEffect, useRef, useCallback } from 'react';
import './dj-dialog.css';

const LINE_DELAY = 120; // ms per line reveal
const AUTO_HIDE_MS = 8000; // auto-hide after all lines shown

export default function DJDialog({ text, streaming, visible, messageId, onReply, onHide }) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [showReply, setShowReply] = useState(false);
  const hideTimerRef = useRef(null);
  const onReplyRef = useRef(onReply);
  const onHideRef = useRef(onHide);
  onReplyRef.current = onReply;
  onHideRef.current = onHide;

  // Split text into lines
  const lines = text ? text.split('\n').filter(l => l.length > 0) : [];
  const allLinesShown = visibleLines >= lines.length;

  // Reset when a new message arrives
  useEffect(() => {
    setVisibleLines(0);
    setShowReply(false);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, [messageId]);

  // Line-by-line reveal
  useEffect(() => {
    if (!visible || lines.length === 0) return;
    if (visibleLines >= lines.length) return;

    const id = setTimeout(() => {
      setVisibleLines(prev => prev + 1);
    }, LINE_DELAY);
    return () => clearTimeout(id);
  }, [visible, visibleLines, lines.length]);

  // When all lines shown and streaming done, show reply + schedule auto-hide
  useEffect(() => {
    if (!visible || lines.length === 0) return;

    if (allLinesShown && !streaming) {
      setShowReply(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        onHideRef.current?.();
      }, AUTO_HIDE_MS);
    } else {
      setShowReply(false);
    }
  }, [allLinesShown, streaming, visible, lines.length]);

  // Reset when hidden
  useEffect(() => {
    if (!visible) {
      setVisibleLines(0);
      setShowReply(false);
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    }
  }, [visible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const handleReply = useCallback(() => {
    onReplyRef.current?.();
    onHideRef.current?.();
  }, []);

  if (!visible || !text) return null;

  return (
    <div className="dj-dialog-container">
      <div className="dj-dialog-bubble">
        <div className="dj-dialog-header">
          <span className="dj-dialog-label">DJ CLAW</span>
          <span className={`dj-dialog-indicator ${!allLinesShown || streaming ? 'typing' : 'idle'}`} />
        </div>
        <div className="dj-dialog-body">
          {lines.slice(0, visibleLines).map((line, i) => (
            <p key={i} className="dj-dialog-line" style={{ animationDelay: `${i * 20}ms` }}>
              {line}
            </p>
          ))}
          {!allLinesShown && <span className="dj-dialog-cursor" />}
        </div>
        {showReply && (
          <div className="dj-dialog-reply-row">
            <button className="dj-dialog-reply" onClick={handleReply}>
              <span className="dj-dialog-reply-arrow">{'>>'}</span>
              <span>REPLY</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
