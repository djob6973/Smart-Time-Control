import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn(className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
          table: ({ children }) => (
            <div className="overflow-x-auto mt-1.5 first:mt-0">
              <table className="w-full text-left border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
          tr: ({ children }) => <tr className="border-b border-border last:border-0">{children}</tr>,
          th: ({ children }) => <th className="py-1 pr-3 font-semibold">{children}</th>,
          td: ({ children }) => <td className="py-1 pr-3 align-top">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
