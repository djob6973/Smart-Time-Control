import { useRef } from "react";
import { Bold, Italic, Quote, List, ListOrdered, Heading1, Heading2 } from "lucide-react";

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
