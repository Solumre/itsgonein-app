import { useEffect, useRef, useState } from 'react';

// A small, football-flavoured emoji set, in tabs. No big library to download.
const SETS = [
  ['⚽', 'Football', ['⚽', '🥅', '🏆', '🥇', '🏅', '🧤', '👟', '🟨', '🟥', '🏟️', '📣', '📢', '⏱️', '🎯', '🔮', '✌️', '📺', '🗞️', '🚨', '💯']],
  ['😂', 'Faces', ['😂', '🤣', '😅', '😎', '🥳', '🤩', '😍', '🙃', '😬', '😱', '😭', '😤', '😡', '🤯', '🥶', '🤔', '🤫', '😴', '🤡', '👀']],
  ['🙌', 'Hands', ['🙌', '👏', '👍', '👎', '🤞', '💪', '🫡', '🤝', '👊', '✊', '🙏', '👋', '☝️', '👉', '🫶', '🤘']],
  ['🔥', 'Fun', ['🔥', '⚡', '💥', '✨', '🌟', '⭐', '💎', '🚀', '🎉', '🍾', '🐐', '👑', '🦁', '🐺', '🦅', '🐝', '🐉', '🦈', '🍿', '🧠']],
  ['❤️', 'Colours', ['❤️', '💙', '💛', '💚', '🤍', '🖤', '🧡', '💜', '🔴', '🔵', '🟡', '🟢', '⚪', '⚫', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', '🏴󠁧󠁢󠁳󠁣󠁴󠁿', '🏴󠁧󠁢󠁷󠁬󠁳󠁿', '🇮🇪']],
];

// Put an emoji into a text box at the cursor (or the end), and keep the cursor after it.
export function insertAtCursor(input, value, emoji) {
  const start = input?.selectionStart ?? value.length;
  const end = input?.selectionEnd ?? value.length;
  return { value: value.slice(0, start) + emoji + value.slice(end), cursor: start + emoji.length };
}

// A 😀 button that opens a picker and adds the emoji to `inputRef`'s text box.
export default function EmojiPicker({ inputRef, value, onChange, disabled, up = false }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(0);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const pick = (emoji) => {
    const input = inputRef?.current;
    const next = insertAtCursor(input, value, emoji);
    onChange(next.value);
    requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange?.(next.cursor, next.cursor); });
  };
  return (
    <span className="emoji-picker" ref={box}>
      <button type="button" className="icon-btn emoji-btn" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-label="Add an emoji" aria-expanded={open} title="Add an emoji">😀</button>
      {open && (
        <div className={`emoji-pop${up ? ' up' : ''}`} role="dialog" aria-label="Emoji">
          <div className="emoji-tabs" role="tablist">
            {SETS.map(([icon, name], i) => (
              <button type="button" key={name} role="tab" aria-selected={tab === i} aria-label={name} className={tab === i ? 'on' : ''} onClick={() => setTab(i)}>{icon}</button>
            ))}
          </div>
          <div className="emoji-grid">
            {SETS[tab][2].map((e) => <button type="button" key={e} onClick={() => pick(e)} aria-label={e}>{e}</button>)}
          </div>
        </div>
      )}
    </span>
  );
}
