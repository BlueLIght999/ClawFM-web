import { useState, useEffect, useRef, useCallback } from 'react';
import './dj-dialog.css';

const CHAR_SPEED_NO_TTS = 50; // ms per char when no TTS
const AUTO_HIDE_MS = 8000;

export default function DJDialog({ text, streaming, visible, messageId, onReply, onHide, speechAudioRef }) {
  const [displayedLen, setDisplayedLen] = useState(0);
  const [showReply, setShowReply] = useState(false);
  const [ttsDuration, setTtsDuration] = useState(0);
  const hideTimerRef = useRef(null);
  const charTimerRef = useRef(null);
  const onReplyRef = useRef(onReply);
  const onHideRef = useRef(onHide);
  onReplyRef.current = onReply;
  onHideRef.current = onHide;

  const fullLen = text ? text.length : 0;
  const allShown = displayedLen >= fullLen && fullLen > 0;

  // Reset when new message
  useEffect(() => {
    setDisplayedLen(0);
    setShowReply(false);
    setTtsDuration(0);
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    if (charTimerRef.current) { clearTimeout(charTimerRef.current); charTimerRef.current = null; }
  }, [messageId]);

  // Try to read TTS audio duration for pacing
  useEffect(() => {
    if (!visible || !text) return;
    const audio = speechAudioRef?.current;
    if (!audio) return;

    const checkDuration = () => {
      if (audio.duration && !isNaN(audio.duration) && audio.duration > 0) {
        setTtsDuration(audio.duration * 1000); // in ms
      }
    };

    checkDuration();
    audio.addEventListener('durationchange', checkDuration);
    audio.addEventListener('loadedmetadata', checkDuration);
    return () => {
      audio.removeEventListener('durationchange', checkDuration);
      audio.removeEventListener('loadedmetadata', checkDuration);
    };
  }, [visible, text, speechAudioRef]);

  // Left-to-right character reveal, paced by TTS if available
  useEffect(() => {
    if (!visible || !text) return;
    if (displayedLen >= fullLen) return;

    // If TTS is playing, pace chars across the audio duration
    let delay = CHAR_SPEED_NO_TTS;
    if (ttsDuration > 0 && fullLen > 0) {
      // Distribute chars across TTS duration, leave 500ms tail
      delay = Math.max(30, (ttsDuration - 500) / fullLen);
    }

    charTimerRef.current = setTimeout(() => {
      setDisplayedLen(prev => prev + 1);
    }, delay);

    return () => {
      if (charTimerRef.current) clearTimeout(charTimerRef.current);
    };
  }, [visible, text, displayedLen, fullLen, ttsDuration]);

  // Show reply + auto-hide when done
  useEffect(() => {
    if (!visible || fullLen === 0) return;
    if (allShown && !streaming) {
      setShowReply(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => {
        onHideRef.current?.();
      }, AUTO_HIDE_MS);
    } else {
      setShowReply(false);
    }
  }, [allShown, streaming, visible, fullLen]);

  // Reset when hidden
  useEffect(() => {
    if (!visible) {
      setDisplayedLen(0);
      setShowReply(false);
      setTtsDuration(0);
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
      if (charTimerRef.current) { clearTimeout(charTimerRef.current); charTimerRef.current = null; }
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (charTimerRef.current) clearTimeout(charTimerRef.current);
    };
  }, []);

  const handleReply = useCallback(() => {
    onReplyRef.current?.();
    onHideRef.current?.();
  }, []);

  if (!visible || !text) return null;

  const isTyping = displayedLen < fullLen;
  const displayedText = text.slice(0, displayedLen);

  return (
    <div className="dj-dialog-container">
      <div className="dj-dialog-bubble">
        <div className="dj-dialog-header">
          <span className="dj-dialog-label">DJ CLAW</span>
          <span className={`dj-dialog-indicator ${isTyping || streaming ? 'typing' : 'idle'}`} />
        </div>
        <div className="dj-dialog-text-wrap">
          <span className="dj-dialog-text">{displayedText}</span>
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
    </div>
  );
}
