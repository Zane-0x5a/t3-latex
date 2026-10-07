// Markdown to HTML the way T3 renders a chat message: remark-parse → T3's
// remark plugins (GFM here) → remark-math → remark-rehype → T3's rehype
// plugins (raw HTML + sanitize) → our KaTeX, appended last. The markdown goes
// through the normaliser first, as the patched react-markdown does.
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import { normalizeDelimiters } from '../src/normalize.js'
import { remarkPlugins, rehypePlugins } from '../src/plugins.js'

const processor = unified()
  .use(remarkParse)
  .use([remarkGfm, ...remarkPlugins])
  .use(remarkRehype, { allowDangerousHtml: true })
  .use([rehypeRaw, [rehypeSanitize, defaultSchema], ...rehypePlugins])
  .use(rehypeStringify)

export const renderMarkdown = md => String(processor.processSync(normalizeDelimiters(md)))
