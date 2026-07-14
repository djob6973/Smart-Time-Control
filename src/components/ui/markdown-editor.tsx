import { useRef, useState } from "react";
import {
  Bold,
  Italic,
  Quote,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Link2,
  Table2,
  Smile,
} from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

const EMOJIS = [
  "😀", "😉", "😊", "🙌", "👍", "👏", "🙏", "💪",
  "🎉", "✅", "❌", "⚠️", "🚨", "❗", "❓", "💡",
  "📢", "📌", "📅", "⏰", "📝", "💬", "🔥", "⭐",
];

function wrapSelection(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  marker: string,
  placeholder: string,
) {
  const { selectionStart: start, selectionEnd: end } = textarea;
  const selected = value.slice(start, end) || placeholder;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const alreadyWrapped = before.endsWith(marker) && after.startsWith(marker);

  let next: string;
  let selStart: number;
  let selEnd: number;
  if (alreadyWrapped) {
    next = before.slice(0, -marker.length) + selected + after.slice(marker.length);
    selStart = start - marker.length;
    selEnd = selStart + selected.length;
  } else {
    next = before + marker + selected + marker + after;
    selStart = start + marker.length;
    selEnd = selStart + selected.length;
  }
  onChange(next);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(selStart, selEnd);
  });
}

function prefixLines(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  prefix: string,
) {
  const { selectionStart: start, selectionEnd: end } = textarea;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const searchFrom = Math.max(end - 1, start);
  const nextBreak = value.indexOf("\n", searchFrom);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;

  const block = value.slice(lineStart, lineEnd);
  const lines = block.split("\n");
  const nonEmpty = lines.filter((l) => l.trim() !== "");
  const allPrefixed = nonEmpty.length > 0 && nonEmpty.every((l) => l.startsWith(prefix));

  const newLines = lines.map((l) => {
    if (l.trim() === "") return l;
    return allPrefixed ? l.slice(prefix.length) : prefix + l;
  });
  const newBlock = newLines.join("\n");
  const next = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);
  const caret = lineStart + newBlock.length;

  onChange(next);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
  });
}

function insertAtCursor(
  textarea: HTMLTextAreaElement,
  value: string,
  onChange: (v: string) => void,
  text: string,
) {
  const { selectionStart: start, selectionEnd: end } = textarea;
  const next = value.slice(0, start) + text + value.slice(end);
  const caret = start + text.length;
  onChange(next);
  requestAnimationFrame(() => {
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
  });
}

function insertLink(textarea: HTMLTextAreaElement, value: string, onChange: (v: string) => void) {
  const url = window.prompt("URL del enlace:", "https://");
  if (!url) return;
  const { selectionStart: start, selectionEnd: end } = textarea;
  const selected = value.slice(start, end) || "texto del enlace";
  insertAtCursor(textarea, value, onChange, `[${selected}](${url})`);
}

const TABLE_TEMPLATE =
  "\n| Columna 1 | Columna 2 |\n| --- | --- |\n| Celda 1 | Celda 2 |\n";

const TOOLBAR_ACTIONS = [
  {
    icon: Heading1,
    label: "Título",
    run: (ta: HTMLTextAreaElement, v: string, c: (v: string) => void) => prefixLines(ta, v, c, "# "),
  },
  {
    icon: Heading2,
    label: "Subtítulo",
    run: (ta: HTMLTextAreaElement, v: string, c: (v: string) => void) => prefixLines(ta, v, c, "## "),
  },
  {
    icon: Bold,
    label: "Negrita",
    run: (ta: HTMLTextAreaElement, v: string, c: (v: string) => void) =>
      wrapSelection(ta, v, c, "**", "texto en negrita"),
  },
  {
    icon: Italic,
    label: "Cursiva",
    run: (ta: HTMLTextAreaElement, v: string, c: (v: string) => void) =>
      wrapSelection(ta, v, c, "*", "texto en cursiva"),
  },
  {
    icon: Quote,
    label: "Cita",
    run: (ta: HTMLTextAreaElement, v: string, c: (v: string) => void) => prefixLines(ta, v, c, "> "),
  },
  {
    icon: List,
    label: "Lista",
    run: (ta: HTMLTextAreaElement, v: string, c: (v: string) => void) => prefixLines(ta, v, c, "- "),
  },
  {
    icon: ListOrdered,
    label: "Lista numerada",
    run: (ta: HTMLTextAreaElement, v: string, c: (v: string) => void) => prefixLines(ta, v, c, "1. "),
  },
  {
    icon: Link2,
    label: "Enlace",
    run: insertLink,
  },
  {
    icon: Table2,
    label: "Tabla",
    run: (ta: HTMLTextAreaElement, v: string, c: (v: string) => void) =>
      insertAtCursor(ta, v, c, TABLE_TEMPLATE),
  },
];

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  className,
  textareaStyle,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  textareaStyle?: React.CSSProperties;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);

  function pickEmoji(emoji: string) {
    if (ref.current) insertAtCursor(ref.current, value, onChange, emoji);
    setEmojiOpen(false);
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-0.5 mb-1.5 flex-wrap">
        {TOOLBAR_ACTIONS.map(({ icon: Icon, label, run }) => (
          <button
            key={label}
            type="button"
            title={label}
            onClick={() => ref.current && run(ref.current, value, onChange)}
            className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <Icon className="size-3.5" />
          </button>
        ))}
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              title="Emoji"
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <Smile className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-auto p-2"
            style={{ display: "grid", gridTemplateColumns: "repeat(6, 2rem)", gap: 2 }}
          >
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => pickEmoji(emoji)}
                className="size-8 flex items-center justify-center overflow-hidden rounded-lg hover:bg-secondary text-lg leading-none"
              >
                {emoji}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>
      <textarea
        ref={ref}
        className="fi"
        style={{ borderRadius: 16, minHeight: 90, ...textareaStyle }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
