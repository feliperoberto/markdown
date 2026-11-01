## ADDED Requirements

### Requirement: Single markdown file import
The system SHALL read a selected file as text and return an entry whose name is the file name without its last extension, after sanitization, with the raw text as content and its length as size.

#### Scenario: Import a markdown file
- **WHEN** a file named `notes.md` with content `# Hello` is imported
- **THEN** the entry name is `notes`, content is `# Hello` and size is 7
Covered by: src/features/import-export/importFile.test.ts

### Requirement: Reject file names that sanitize to empty
The system MUST reject an imported file whose sanitized name is empty, with an error containing "Nome de arquivo inválido".

#### Scenario: Dotfile name
- **WHEN** a file named `.md` or `...md` is imported
- **THEN** the import rejects and no entry is produced
Covered by: src/features/import-export/importFile.test.ts

### Requirement: Name sanitization
The system SHALL strip control characters, path separators and leading dots from imported names and trim whitespace, while leaving HTML metacharacters unescaped (see `src/lib/sanitize.ts`).

#### Scenario: Traversal characters removed
- **WHEN** a name such as `../../etc/passwd` is sanitized
- **THEN** the result contains no `/`, `\` or leading dots
Covered by: src/lib/sanitize.test.ts

### Requirement: ZIP import structure
The system SHALL parse a ZIP into a patch keyed by project then file, using the first path segment as project name and the last segment, minus a trailing `.md`, as file name, and SHALL ignore directory entries and entries with fewer than two path segments.

#### Scenario: Well-formed archive
- **WHEN** a ZIP contains `My Project/notes.md`
- **THEN** the patch holds project `My Project` with file `notes` and its content
Covered by: src/features/import-export/importZip.test.ts

#### Scenario: Deeply nested entry
- **WHEN** a ZIP contains `Project/sub/dir/file.md`
- **THEN** the file is imported as `file` in project `Project`
Covered by: src/features/import-export/importZip.test.ts

#### Scenario: Top-level file ignored
- **WHEN** a ZIP contains `orphan.md` and `Project/keep.md`
- **THEN** only `Project/keep` is imported
Covered by: src/features/import-export/importZip.test.ts

### Requirement: ZIP import fails when nothing is importable
The system MUST throw an error "ZIP sem arquivos .md válidos" when no entry yields a project and file name.

#### Scenario: Only a folder
- **WHEN** a ZIP contains only an empty folder
- **THEN** the import rejects with that message
Covered by: src/features/import-export/importZip.test.ts

### Requirement: ZIP import sanitizes entry names
The system SHALL sanitize every project and file name taken from ZIP entry paths (issue #27).

#### Scenario: Malicious entry path
- **WHEN** a ZIP entry path contains markup and `../` segments
- **THEN** resulting project and file names contain no path separators or `..`, and content is preserved
Covered by: src/features/import-export/importZip.test.ts

### Requirement: ZIP import keeps first of colliding entries
The system SHALL keep the first entry when several entries sanitize to the same project/file key, skip the later ones, and log a console warning with the skipped count instead of failing.

#### Scenario: Leading-dot collision
- **WHEN** a ZIP contains `Project/notes.md` and `Project/.notes.md`
- **THEN** only `notes` exists, with the first entry's content
Covered by: src/features/import-export/importZip.test.ts

### Requirement: ZIP import stamps entries
The system SHALL set each imported entry's size to its content length and its timestamp to the import time.

#### Scenario: Entry metadata
- **WHEN** a ZIP is imported
- **THEN** each entry has name, content, size and an ISO timestamp
Covered by: none (untested)

### Requirement: Single file export
The system SHALL export a file as a Blob of type `text/markdown;charset=utf-8` containing its content, with suggested download name `<name>.md`.

#### Scenario: Export a file
- **WHEN** file `notes` is exported
- **THEN** the Blob has that type and content, and the name is `notes.md`
Covered by: src/features/import-export/exportFile.test.ts

### Requirement: Project export
The system SHALL pack all files of a project into a DEFLATE ZIP under a folder named after the project, each as `<fileName>.md`, with suggested download name `<project>.zip`.

#### Scenario: Export project
- **WHEN** project `My Project` with `notes` and `todo` is exported
- **THEN** the ZIP holds `My Project/notes.md` and `My Project/todo.md`
Covered by: src/features/import-export/exportProject.test.ts

#### Scenario: Empty project
- **WHEN** a project with no files is exported
- **THEN** the ZIP holds no file entries
Covered by: src/features/import-export/exportProject.test.ts

### Requirement: Batch export grouped by project
The system SHALL pack a multi-project selection into one ZIP grouped by project folder, named `projetos-YYYY-MM-DD.zip` using the (UTC) date given or the current date.

#### Scenario: Two projects
- **WHEN** files from Project A and Project B are exported as a batch
- **THEN** each file appears under its project folder
Covered by: src/features/import-export/exportBatch.test.ts

#### Scenario: Batch file name
- **WHEN** the date is 2024-03-15
- **THEN** the name is `projetos-2024-03-15.zip`
Covered by: src/features/import-export/exportBatch.test.ts

### Requirement: Project ZIP round trip
The system SHALL allow a project exported as ZIP to be re-imported through the sidebar with file content intact.

#### Scenario: Export, delete, import
- **WHEN** a project with a file is downloaded, deleted, and its ZIP imported
- **THEN** the project and file reappear and the editor shows the original content
Covered by: e2e/import-export-golden-path.spec.ts

### Requirement: Batch download area in the app
The app SHALL offer a "Baixar ZIP" action for two or more checked files, keep it reachable while the file list scrolls, and produce a `.zip` download.

#### Scenario: Many files selected on a short viewport
- **WHEN** 15 files are checked on a 560px-high viewport
- **THEN** the button stays fully in view, the list scrolls, and clicking downloads a `.zip`
Covered by: e2e/batch-download-overflow.spec.ts

### Requirement: Toolbar ZIP import notifies caller
The toolbar component SHALL pass the parsed ZIP patch to `onImport` and show a success toast, or an error toast on failure.

#### Scenario: Select a ZIP
- **WHEN** a ZIP with two files is chosen in the toolbar
- **THEN** `onImport` receives both files
Covered by: src/features/import-export/ImportExportToolbar.test.tsx

### Requirement: Toolbar single-file import requires a project
The toolbar component SHALL show a warning toast "Selecione um projeto" and import nothing when no project is open.

#### Scenario: No project selected
- **WHEN** files are chosen with `currentProjectName` null
- **THEN** a warning toast appears and `onImport` is not called
Covered by: none (untested)

### Requirement: TODO: Toolbar is unused and duplicates app-shell logic
The `ImportExportToolbar` component SHALL either be used by the app or removed; it is exported but not rendered by the app.

#### Scenario: Single source of import/export wiring
- **WHEN** the app imports or exports
- **THEN** one shared implementation of downloading and toasts is used
Evidence: `ImportExportToolbar` is referenced only in its test and `index.ts`; `src/app/app.tsx:28` and `src/features/import-export/ImportExportToolbar.tsx:24` each define `downloadBlob`, with different toast copy and a ZIP toast counting projects (toolbar) versus files (app.tsx:283-290).
Covered by: none (untested)

### Requirement: TODO: ZIP import accepts non-markdown entries
ZIP import SHALL import only `.md` entries, as its error message and doc comment imply.

#### Scenario: Text file in archive
- **WHEN** a ZIP contains `Project/readme.txt`
- **THEN** it is skipped (today it is imported under the key `readme.txt`)
Evidence: `src/features/import-export/importZip.ts:44-47` strips `.md` only when present and never filters; pinned by importZip.test.ts "imports non-.md files too".
Covered by: src/features/import-export/importZip.test.ts

### Requirement: TODO: Export does not sanitize or deduplicate names
Export SHALL produce safe ZIP entry paths for project and file names.

#### Scenario: Name with a slash
- **WHEN** a project or file name contains `/` or `..` and is exported
- **THEN** the archive path stays within the project folder
Evidence: `src/features/import-export/zip.ts:21-24` uses names verbatim as folder and file names.
Covered by: none (untested)

### Requirement: TODO: Download revokes object URL immediately
The download helper SHALL delay `URL.revokeObjectURL` until the browser has started the download.

#### Scenario: Large ZIP download
- **WHEN** a large blob is downloaded
- **THEN** the download starts reliably
Evidence: `src/app/app.tsx:28-34` and `ImportExportToolbar.tsx:24-30` call `revokeObjectURL` synchronously after `link.click()`.
Covered by: none (untested)
