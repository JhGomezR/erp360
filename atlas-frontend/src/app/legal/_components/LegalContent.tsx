'use client';

import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import type { LegalDocument } from '@/types';

interface Props {
  document: LegalDocument;
}

/**
 * Renderiza el contenido markdown de un documento legal con sanitización XSS.
 * rehype-sanitize usa el schema estricto por defecto — solo permite tags HTML seguros.
 * OWASP A03: nunca usar dangerouslySetInnerHTML directamente con contenido externo.
 */
export default function LegalContent({ document }: Props) {
  return (
    <article>
      {/* Encabezado */}
      <div className="mb-8 pb-6 border-b border-white/10">
        <h1 className="text-3xl font-bold text-white">{document.title}</h1>
        <div className="flex items-center gap-4 mt-3 text-sm text-slate-400">
          <span>Versión {document.version}</span>
          {document.effective_date && (
            <>
              <span className="text-white/20">·</span>
              <span>
                Vigente desde{' '}
                {new Date(document.effective_date).toLocaleDateString('es-CO', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </span>
            </>
          )}
          {document.published_at && (
            <>
              <span className="text-white/20">·</span>
              <span>
                Publicado el{' '}
                {new Date(document.published_at).toLocaleDateString('es-CO', {
                  year: 'numeric', month: 'long', day: 'numeric',
                })}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Contenido markdown sanitizado */}
      <div className="prose prose-invert prose-sm max-w-none
        prose-headings:text-white prose-headings:font-semibold
        prose-p:text-slate-300 prose-p:leading-relaxed
        prose-li:text-slate-300
        prose-strong:text-white
        prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
        prose-hr:border-white/10
        prose-blockquote:border-l-blue-500 prose-blockquote:text-slate-400
        prose-code:text-blue-300 prose-code:bg-white/5 prose-code:rounded prose-code:px-1
        prose-table:text-slate-300 prose-th:text-white prose-th:border-white/20 prose-td:border-white/10">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeSanitize]}
        >
          {document.content}
        </ReactMarkdown>
      </div>
    </article>
  );
}
