import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  children: string;
  className?: string;
};

/**
 * Renders markdown with journal typography (stone/teal prose).
 */
export function MarkdownBody({ children, className = "" }: Props) {
  return (
    <div className={`journal-prose ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
