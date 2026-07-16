import { useState, useEffect, useRef, useCallback } from 'react';
import './dj-dialog.css';

const TYPE_SPEED = 45; // ms per character
const AUTO_HIDE_MS = 8000; // auto-hide after typing completes

export default function DJDialog({ text, streaming, visible, messageId, onReply, onHide }) {
  const [displayedLen, setDisplayedLen] = useState(0);
  const [showReply, setShowReply] = useState(false);
  const hideTimerRef = useRef(null);
  const onReplyRef = useRef(onReply);
  const onHideRef = useRef(onHide);
  onReplyRef.current = onReply;
  onHideRef.current = onHide;

  // Reset when a new message arrives
  useEffect(() => {
    setDisplayedLen(0);
    setShowReply(false);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, [messageId]);

  // Typewriter: advance one character at a time
  useEffect(() => {
    if (!visible || !text) return;
    if (displayedLen >= text.length) return;

    const id = setTimeout(() => {
      setDisplayedLen(prev => prev + 1);
    }, TYPE_SPEED);
    return () => clearTimeout(id);
  }, [visible, text, displayedLen]);

  // When typing catches up and streaming is done, show reply + schedule auto-hide
  useEffect(() => {
    if (!visible || !text) return;

    if (displayedLen >= text.length && text.length > 0 && !streaming) {
      setShowReply(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        onHideRef.current?.();
      }, AUTO_HIDE_MS);
    } else {
      setShowReply(false);
    }
  }, [displayedLen, text, streaming, visible]);

  // Reset when hidden
  useEffect(() => {
    if (!visible) {
      setDisplayedLen(0);
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

  const isTyping = displayedLen < text.length;
  const displayedText = text.slice(0, displayedLen);

  return (
    <div className="dj-dialog-container">
      <div className="dj-dialog-bubble">
        <div className="dj-dialog-header">
          <span className="dj-dialog-label">DJ CLAW</span>
          <span className={`dj-dialog-indicator ${isTyping ? 'typing' : 'idle'}`} />
        </div>
        <div className="dj-dialog-text">
          {displayedText}
          {isTyping && <span className="dj-dialog-cursor" />}
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
      <div className="dj-dialog-tail" />
    </div>
  );
}
