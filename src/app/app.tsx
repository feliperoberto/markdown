import { useState } from 'preact/hooks'
import { EditorFeature } from '@/features/editor'

// NOTE: content is local-only for now. Wiring the editor to persisted
// projects/files (issue #19) is out of scope for #18 (editor+preview
// extraction) and is handled by a separate parallel task.
export function App() {
  const [content, setContent] = useState('')

  return <EditorFeature content={content} onContentChange={setContent} />
}
