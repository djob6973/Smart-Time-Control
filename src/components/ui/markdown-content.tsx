import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn(className)}>
      <ReactMarkdown
        components={{
          h1: ({ children }) => <p className="text-base font-semibold mt-1.5 first:mt-0">{children}</p>,
          h2: ({ children }) => <p className="text-sm font-semibold mt-1.5 first:mt-0">{children}</p>,
          p: ({ children }) => <p className="mt-1.5 first:mt-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-2 italic text-muted-foreground mt-1.5 first:mt-0">
              {children}
            </blockquote>
          ),
          ul: ({ children }) => <ul className="list-disc pl-4 mt-1.5 space-y-0.5 first:mt-0">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 mt-1.5 space-y-0.5 first:mt-0">{children}</ol>,
          li: ({ children }) => <li>{children}</li>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline text-primary">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
