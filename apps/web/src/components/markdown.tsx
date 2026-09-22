import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

/**
 * GitHub's sanitize rules (no scripts, styles, iframes or event handlers; http(s) links only), plus
 * `<center>`, which project pages use a lot.
 */
const schema = { ...defaultSchema, tagNames: [...(defaultSchema.tagNames ?? []), 'center'] }

/** Renders a project description: Markdown with inline HTML, sanitized. Links open in a new tab. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        'prose prose-neutral dark:prose-invert max-w-none prose-img:inline-block prose-img:my-2 prose-a:text-primary prose-headings:tracking-tight',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Raw HTML is parsed first, so the sanitizer sees (and cleans) it too.
        rehypePlugins={[rehypeRaw, [rehypeSanitize, schema]]}
        components={{
          a: ({ node: _, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
          img: ({ node: _, ...props }) => <img {...props} alt={props.alt ?? ''} loading="lazy" />,
          center: ({ children }) => <div className="text-center">{children}</div>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
