import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function Markdown({ children, className = '' }) {
  return (
    <div className={`markdown ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren, ...props }) => (
            <a
              href={href}
              {...props}
              target={href?.startsWith('http') ? '_blank' : undefined}
              rel={href?.startsWith('http') ? 'noreferrer noopener' : undefined}
            >
              {linkChildren}
            </a>
          ),
          pre: ({ children, ...props }) => (
            <pre
              className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950 p-3 font-mono text-sm leading-6 text-emerald-300"
              {...props}
            >
              {children}
            </pre>
          ),
          code: ({ className, children, ...props }) => {
            const isBlock = /language-/.test(className || '') || String(children).includes('\n');
            if (isBlock) {
              return (
                <code className="bg-transparent p-0 font-mono text-emerald-300" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] text-cyan-800 dark:bg-white/10 dark:text-brand-200"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {children || ''}
      </ReactMarkdown>
    </div>
  );
}
