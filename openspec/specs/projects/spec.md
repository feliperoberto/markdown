# projects Specification

## Purpose
Project and file management: create, rename, archive, delete, reorder and switch between projects and files.

## Requirements

### Requirement: Pure state model with no-op identity
The model functions in `model.ts` SHALL be pure and immutable over a nested `projects[project][file]` state, and SHALL return the identical input reference when a request is invalid or changes nothing (unknown project or file, empty name, duplicate or identical target name, self-move).

#### Scenario: Duplicate or empty names are refused
- **WHEN** a project or file is created or renamed to an empty name, or to a name that already exists in the same scope
- **THEN** the same state reference is returned and nothing is persisted

Covered by: src/features/projects/useProjects.test.tsx

#### Scenario: Names matching Object.prototype members are handled
- **WHEN** a project is named like an inherited member such as "constructor" and existence is checked
- **THEN** existence uses own-property checks, so a non-existent "constructor" project is reported absent and a real one is found

Covered by: src/features/projects/model.test.ts

### Requirement: File content edits refresh size and timestamp
Creating or updating a file SHALL set `size` to the content length and `timestamp` to the current ISO time, and renaming a file SHALL update its `name` while preserving content and key order semantics of the rename.

#### Scenario: Create a file
- **WHEN** a file is created in an existing project
- **THEN** the file stores its content, a size equal to the content length and a fresh ISO timestamp

Covered by: src/features/projects/useProjects.test.tsx

### Requirement: First-run seeding
Loading projects SHALL seed a default project with one empty file and persist it immediately only when nothing at all is stored, and SHALL NOT re-seed after the user has stored (even an emptied) state.

#### Scenario: Nothing stored
- **WHEN** projects are loaded and the storage key is absent
- **THEN** a default project with a default file is returned and written, and a second load does not seed again

Covered by: src/features/projects/storage.test.ts

#### Scenario: Stored but emptied
- **WHEN** the user has stored an empty projects object
- **THEN** no default project is seeded

Covered by: src/features/projects/storage.test.ts

### Requirement: Envelope loading and schema handling
Loading SHALL parse the versioned envelope, migrate older shapes and persist the migrated form, SHALL return an empty state on unparseable data, and SHALL read a future-schema envelope as-is without migrating while stamping its own schema version on later saves (ADR-0003).

#### Scenario: Future schema
- **WHEN** the stored envelope is stamped with a newer schema version than the build knows
- **THEN** its projects are returned unmigrated and a later save writes the build's own schema version

Covered by: src/features/projects/storage.test.ts

### Requirement: Selection on boot and last-edited memory
On first render the hook SHALL open the remembered last-edited file when it still exists and is neither inside an archived project nor individually archived; otherwise it SHALL pick the first file, preferring non-archived content and progressively falling back to project-filtered then unfiltered, and the selection SHALL be persisted on every change.

#### Scenario: Remembered file exists
- **WHEN** the stored last-edited pointer names an existing, visible file
- **THEN** that file is selected on mount

Covered by: src/features/projects/useProjects.test.tsx

#### Scenario: Remembered file is archived
- **WHEN** the pointer names a file whose project or the file itself is archived
- **THEN** the first non-archived file is selected instead

Covered by: src/features/projects/useProjects.test.tsx

#### Scenario: Malformed pointer
- **WHEN** the stored pointer is malformed
- **THEN** it is ignored and the first file is used

Covered by: src/features/projects/storage.test.ts

### Requirement: Persist before updating state
Every mutation SHALL write through `saveProjects` first and update in-memory state only if the write succeeded; on failure it SHALL show an error toast and keep the previous state visible.

#### Scenario: Save fails
- **WHEN** persisting a change throws
- **THEN** an error toast is shown and the displayed projects are unchanged

Covered by: src/features/projects/useProjects.test.tsx

#### Scenario: Asynchronous IndexedDB write failure
- **WHEN** the IndexedDB backend reports a write error after the in-memory update
- **THEN** an error toast is shown, rate-limited to one per 10 seconds

Covered by: src/features/projects/useProjects.test.tsx

### Requirement: Creating and selecting projects and files
Creating a file SHALL make it the active file unless `select: false` is passed, creating a project SHALL select it and clear the open file, and the batch `createFiles` SHALL persist once, skip colliding names, return the created names and never change selection.

#### Scenario: New file becomes active
- **WHEN** a file is created with default options
- **THEN** its project and name become the current selection

Covered by: src/features/projects/useProjects.test.tsx

#### Scenario: Batch create
- **WHEN** several entries are created in one call and one collides with an existing name
- **THEN** all non-colliding entries are created in a single persist and selection is unchanged

Covered by: src/features/projects/useProjects.test.tsx

#### Scenario: Create a project
- **WHEN** a new project is created from the sidebar
- **THEN** it becomes the current project, the open file is cleared and a success toast is shown

Covered by: none (untested)

### Requirement: Rename and delete cascade
Renaming or deleting a project or file SHALL carry or drop its archived flags and record tombstones in the same step, and renaming the active file or project SHALL keep the selection on the renamed item; deleting the active project or file SHALL clear the selection.

#### Scenario: Rename carries archived flags
- **WHEN** an archived project or file is renamed
- **THEN** the archived flag, and for a project every archived-file entry, moves to the new name

Covered by: src/features/projects/useProjects.test.tsx

#### Scenario: Delete drops archived flags
- **WHEN** an archived project or file is deleted
- **THEN** its archived entries are removed

Covered by: src/features/projects/useProjects.test.tsx

#### Scenario: Colliding rename is a no-op
- **WHEN** a project or file is renamed into an existing name
- **THEN** nothing changes and no archived flag is moved to the other item

Covered by: src/features/projects/useProjects.test.tsx

#### Scenario: Failed delete keeps archive flag
- **WHEN** a project delete fails to persist
- **THEN** the project stays archived

Covered by: src/features/projects/useProjects.test.tsx

### Requirement: Destructive operations take a rotating backup
Deleting a project or file that exists, importing a ZIP and applying a merge that changes local state SHALL first back up the current blob to a rotating slot; a backup identical to the newest SHALL be skipped, the cap SHALL be 3 on localStorage and 10 on IndexedDB, and backup failures SHALL NOT block the operation.

#### Scenario: Rotation and cap
- **WHEN** more backups are written than the cap
- **THEN** newest is slot 1 and the oldest is dropped

Covered by: src/features/projects/storage.test.ts

#### Scenario: Duplicate snapshot skipped
- **WHEN** the snapshot equals the newest backup
- **THEN** no new backup is written, but a content-only change is still backed up

Covered by: src/features/projects/storage.test.ts

#### Scenario: No backup for a no-op delete
- **WHEN** a delete targets something that does not exist
- **THEN** no backup is written

Covered by: src/features/projects/useProjects.test.tsx

#### Scenario: Sync backs up only on local change
- **WHEN** reconciling with remote leaves local state unchanged
- **THEN** no backup is written

Covered by: src/features/projects/useProjects.test.tsx

### Requirement: Quota recovery by evicting backups
When saving the primary blob hits a quota error, the system SHALL evict backups oldest-first and retry, rethrow the original error if nothing fits, and never evict on non-quota errors; the IndexedDB backend SHALL apply the same policy after an asynchronous failure.

#### Scenario: Eviction makes the write fit
- **WHEN** the save throws a quota error and old backups exist
- **THEN** backups are removed oldest-first until the write succeeds

Covered by: src/features/projects/storage.test.ts

#### Scenario: Asynchronous IndexedDB quota
- **WHEN** an IndexedDB write fails with a quota error
- **THEN** the oldest backup is evicted and the flush is retried

Covered by: src/features/projects/storage-init.test.ts

### Requirement: Storage backend selection at boot
Boot SHALL open IndexedDB and migrate the localStorage blob and newest backups into it in one transaction before clearing localStorage (ADR-0005); if IndexedDB is unavailable and unused it SHALL stay on localStorage and prune excess backups, and if the data already moved there it SHALL run in memory only with a warning toast.

#### Scenario: Migration
- **WHEN** a localStorage blob exists and IndexedDB opens
- **THEN** the blob and backups are copied, localStorage is freed and later saves go to IndexedDB

Covered by: src/features/projects/storage-init.test.ts

#### Scenario: IndexedDB unavailable after migration
- **WHEN** the marker says data lives in IndexedDB but it cannot open
- **THEN** the session runs in memory and localStorage is not touched

Covered by: src/features/projects/storage-init.test.ts

#### Scenario: Stale tab blob
- **WHEN** a pre-IndexedDB tab wrote a blob after migration
- **THEN** it is merged by per-file freshness and only then removed

Covered by: src/features/projects/storage-init.test.ts

#### Scenario: Hung IndexedDB read
- **WHEN** the initial read does not resolve within the timeout
- **THEN** the system falls back to localStorage

Covered by: src/features/projects/storage-init.test.ts

### Requirement: Archive projects and files
Projects and files SHALL be archivable and unarchivable without confirmation or data change, archived state SHALL be device-local sidecar data pruned of stale entries, archived projects SHALL be hidden behind a "Mostrar arquivados (N)" toggler and archived files behind a per-project toggler, and archiving the open item SHALL move selection to a sibling or the first visible file with progressive fallback.

#### Scenario: Hide and reveal an archived project
- **WHEN** a project is archived from its menu
- **THEN** it disappears from the list, a toggler with the count appears, revealing it shows it with an archived badge, and the state survives a reload

Covered by: e2e/archive-projects.spec.ts

#### Scenario: Hide and reveal an archived file
- **WHEN** a file is archived from its menu
- **THEN** it is hidden until the project's toggler is used and survives a reload

Covered by: e2e/archive-files.spec.ts

#### Scenario: Open item archived
- **WHEN** the currently open file or project is archived
- **THEN** selection moves to a sibling file, else the first visible file, else an archived file rather than null

Covered by: src/features/projects/useProjects.test.tsx

#### Scenario: All archived
- **WHEN** every project (or every file in a project) is archived
- **THEN** an all-archived empty message is shown with the toggler

Covered by: src/features/projects/ProjectsSidebar.test.tsx

#### Scenario: Menu label flips without confirmation
- **WHEN** the archive menu item is used
- **THEN** its label alternates between archive and unarchive and no dialog opens

Covered by: src/features/projects/ProjectsSidebar.test.tsx

### Requirement: Batch selection pruning
The sidebar SHALL keep a transient multi-select checkbox set per project, report it via `onSelectionChange`, and drop entries whose file was renamed, deleted or archived or whose project was archived.

#### Scenario: Archive drops checked file
- **WHEN** a checked file, or its project, is archived
- **THEN** it is removed from the reported selection

Covered by: src/features/projects/ProjectsSidebar.test.tsx

### Requirement: Single open actions menu
The sidebar SHALL keep at most one "..." actions menu open across project headers and file rows, close it on an outside click, on drag start and when its owner is deleted or collapsed, and expose the file trigger by keyboard.

#### Scenario: Opening a second menu
- **WHEN** a second project menu is opened
- **THEN** the first closes

Covered by: src/features/projects/ProjectsSidebar.test.tsx

#### Scenario: Outside or propagation-stopping click
- **WHEN** the user clicks outside, or on a control that stops propagation
- **THEN** the open menu closes

Covered by: src/features/projects/ProjectsSidebar.test.tsx

#### Scenario: File trigger visibility and keyboard
- **WHEN** a non-active row's trigger is reached with Tab, or a row is tapped
- **THEN** the trigger is focusable, and tapping opens the file without opening the menu

Covered by: e2e/file-row-actions.spec.ts

### Requirement: Row activation
Clicking a file row, or pressing Enter or Space while the row itself has focus, SHALL open that file, and the active row SHALL carry the active class and `aria-current`.

#### Scenario: Click opens file
- **WHEN** a file row is clicked
- **THEN** `onSelectFile` is called with its project and name

Covered by: src/features/projects/FileRow.test.tsx

### Requirement: Name prompts and delete confirmation
Creating or renaming a project or file SHALL use a prompt dialog that validates the trimmed value (non-empty, no duplicate in the full unfiltered list, including hidden archived items), and deleting a project SHALL require a confirm dialog while renaming by double-clicking the project header SHALL open the rename prompt.

#### Scenario: Dialog button order
- **WHEN** a prompt or confirm dialog opens
- **THEN** Cancelar is on the left and the confirm action on the right, and typing keeps input focus

Covered by: src/features/projects/dialogs.test.tsx

#### Scenario: Duplicate name rejected
- **WHEN** the typed name matches an existing (possibly archived) project or file
- **THEN** an alert shows the duplicate message and the dialog does not resolve

Covered by: none (untested)

#### Scenario: Create, rename, delete a file in the tree
- **WHEN** the user creates, renames and deletes a file through the UI
- **THEN** the tree reflects each change

Covered by: src/features/projects/ProjectsSidebar.test.tsx

### Requirement: Upload reveals target project
Uploading files to a project SHALL offer a single "Upload" menu item accepting multiple Markdown files, create them in one batch, select the last created file, and expand a collapsed project only once something was actually created.

#### Scenario: Several files
- **WHEN** several files are uploaded
- **THEN** all are created and the last is selected

Covered by: src/features/projects/ProjectsSidebar.test.tsx

#### Scenario: Collapsed target
- **WHEN** the target project is collapsed and the upload creates a file
- **THEN** the project is expanded

Covered by: src/features/projects/ProjectsSidebar.test.tsx

### Requirement: Collapsed state memory
Collapsed projects SHALL be remembered per device in a sidecar set, default to expanded, and be pruned when a project no longer exists.

#### Scenario: Round trip
- **WHEN** a set of collapsed names is saved and loaded, including malformed entries
- **THEN** valid names round-trip and invalid input yields an empty set

Covered by: src/features/projects/storage.test.ts

### Requirement: Reorder files and projects
Files SHALL be reorderable only within their own project and projects at top level, by moving an item before a target or appending when the target is null or unknown, via either a pointer drag on a handle or the "Mover para cima/baixo" menu items computed over the visible list; moving a file to another project SHALL NOT be possible and archived projects SHALL NOT be reorderable.

#### Scenario: Model reorder
- **WHEN** a file or project is moved before a target, or with a null target
- **THEN** key order changes accordingly, and unknown or self targets return the same reference

Covered by: src/features/projects/model.test.ts

#### Scenario: Drop resolution
- **WHEN** a drag ends over a same-project file row, group padding, a different project, or an archived group
- **THEN** it inserts before the row, appends, is rejected, or is accepted only for the file's own archived group, respectively

Covered by: src/features/projects/dnd.test.ts

#### Scenario: Menu step skips hidden items
- **WHEN** a move-down or move-up item is used with archived neighbours hidden
- **THEN** the step is computed over the visible list and omitted at either end

Covered by: src/features/projects/dnd.test.ts

#### Scenario: Menu items by keyboard
- **WHEN** the user moves a file or project via its menu
- **THEN** the order changes, no "move to project" item exists, and ends omit the unavailable direction

Covered by: e2e/sidebar-reorder-menu.spec.ts

#### Scenario: Mouse drag and reload
- **WHEN** a file is dropped on another row, or a project header handle is dragged
- **THEN** order changes and persists across reload, a drop onto another project is a no-op, and Escape cancels

Covered by: e2e/sidebar-reorder.spec.ts

#### Scenario: Touch drag
- **WHEN** a touch pointer drags the handle
- **THEN** the file is reordered and only the handle opts out of native touch scrolling

Covered by: e2e/sidebar-reorder-touch.spec.ts

### Requirement: Pointer drag gesture lifecycle
The sidebar SHALL start a drag only from a drag handle when the matching move handler is wired and only after the movement threshold, SHALL show a body-level ghost stripped of identity attributes, SHALL suppress the click following a committed drag, and SHALL abort and clean up on pointercancel, Escape, window blur or unmount.

#### Scenario: Commit
- **WHEN** the handle is pressed, moved past the threshold and released over another row
- **THEN** the move is committed and the next click is suppressed

Covered by: src/features/projects/useSidebarDnd.test.tsx

#### Scenario: Sub-threshold tap
- **WHEN** the pointer moves less than the threshold
- **THEN** no move is committed and the next click is not suppressed

Covered by: src/features/projects/useSidebarDnd.test.tsx

#### Scenario: Abort paths
- **WHEN** the gesture is cancelled, Escape is pressed, or the component unmounts mid-drag
- **THEN** no move occurs and no ghost, listener or dragging flag remains

Covered by: src/features/projects/useSidebarDnd.test.tsx

### Requirement: Merge strategies for import and restore
ZIP import SHALL merge additively with the incoming file winning a same-key collision, and Drive restore SHALL merge additively with the local file winning, never losing local-only content.

#### Scenario: ZIP import
- **WHEN** an imported file has the same project and name as a local one
- **THEN** the incoming file replaces it

Covered by: src/features/projects/model.test.ts

#### Scenario: Drive restore
- **WHEN** a backup shares a file with local state
- **THEN** the local file is kept and local-only projects and files remain

Covered by: src/features/projects/model.test.ts

### Requirement: Freshness merge for smart sync
Reconciling with a remote snapshot SHALL union projects and files, keep the newer `timestamp` for files on both sides (a tie keeps local), report `localChanged` and `remoteChanged`, and return the merged result even when only remote needed updating (ADR-0004).

#### Scenario: Newer side wins
- **WHEN** a same-named file is newer remotely or locally
- **THEN** the newer version is kept and the matching change flag is set

Covered by: src/features/projects/model.test.ts

#### Scenario: Union and identity
- **WHEN** each side has exclusive files or projects, or both are identical
- **THEN** exclusive entries are kept and identical sides report no change

Covered by: src/features/projects/model.test.ts

#### Scenario: Hook-level reconcile
- **WHEN** reconcileWithRemote receives a remote with extra or newer files
- **THEN** local files are preserved and newer remote files applied

Covered by: src/features/projects/useProjects.test.tsx

### Requirement: Tombstones prevent resurrection
Renames and deletes SHALL record file and project tombstones (a project operation also tombstones each of its files), tombstones SHALL be merged per key taking the later time, pruned after 90 days, and applied only to remote-only entries older than the tombstone; local entries, entries edited after the deletion and empty remote projects SHALL survive.

#### Scenario: Remote-only file older than tombstone
- **WHEN** a remote-only file is older than its tombstone
- **THEN** it is dropped and remote is flagged for update

Covered by: src/features/projects/model.test.ts

#### Scenario: Recreated or local content
- **WHEN** the remote file is newer than the tombstone, the entry is local, or the remote project is empty
- **THEN** it is kept

Covered by: src/features/projects/model.test.ts

#### Scenario: Tombstone store operations
- **WHEN** tombstones are recorded, cleared, merged, pruned or normalized
- **THEN** keys use the composite encoding, later times win, expired or malformed entries are dropped, and no-ops return the same reference

Covered by: src/features/projects/tombstones.test.ts

#### Scenario: Round trip across syncs
- **WHEN** a file is renamed twice, deleted, or a deleted/renamed project name is reused between syncs
- **THEN** exactly one copy under the final name remains and old files are not resurrected

Covered by: src/features/projects/sync-roundtrip.test.tsx

### Requirement: Untrusted snapshot normalization
Remote project snapshots SHALL be normalized before merging: non-object projects and files with non-string content are dropped, names are sanitized (empty results dropped), `file.name` is forced to equal its key, `size` is recomputed, a missing or non-string timestamp is replaced with the current time, and empty projects are kept.

#### Scenario: Malformed input
- **WHEN** a blob contains non-objects, bad content types or path-traversal names
- **THEN** they are dropped or sanitized without throwing

Covered by: src/features/projects/validate.test.ts

#### Scenario: Name and size repair
- **WHEN** a file's `name` or `size` disagrees with its key or content
- **THEN** both are rewritten from key and content

Covered by: src/features/projects/validate.test.ts

### Requirement: Sidebar chrome and configuration entry
The sidebar SHALL render a labelled navigation with project groups, a footer with new project, ZIP import and Config buttons, an empty-state message when no projects exist, and the Config button SHALL open the configuration modal so that it stays interactable while the sidebar is open.

#### Scenario: Config modal while menu open
- **WHEN** the left menu is open and Config is activated
- **THEN** the modal is not covered by the sidebar and remains interactable

Covered by: e2e/config-modal-overlap.spec.ts

### Requirement: TODO: Success toast and selection change after a failed or no-op mutation
Rename and delete handlers SHALL show success toasts, and clear or retarget selection, only when the change actually persisted. Today the success toast fires even after `persist` returned false (an error toast has already been shown), and deleting clears the selection regardless of the save outcome. Evidence: src/features/projects/useProjects.ts:385, :448, :632, :664 (toasts), :402-407 and :642-644 (selection cleared before checking `saved`).

#### Scenario: Failed delete
- **WHEN** deleting a file or project fails to persist
- **THEN** only the error toast is shown and the file or project stays selected

Covered by: none (untested)

### Requirement: TODO: createProject should not act when the model refuses
`createProject` SHALL do nothing when the name is empty or already exists. Today the hook still selects the name, clears the open file and shows "Projeto criado" because it ignores that the model returned the same state; the sidebar validation hides the case from the UI but the hook API is unguarded. Evidence: src/features/projects/useProjects.ts:303-320 versus the guarded `createFile` at :543-547.

#### Scenario: Duplicate project name through the hook
- **WHEN** createProject is called with an existing name
- **THEN** selection and toasts are unchanged

Covered by: none (untested)

### Requirement: TODO: Validate remote timestamps as ISO dates
Normalization SHALL accept only parseable ISO timestamps for files. Today any string is kept, and since freshness merging compares timestamps lexically, a value such as "zzz" would always win and could overwrite newer local content (while `normalizeTombstones` does validate its dates). Evidence: src/features/projects/validate.ts:42, src/features/projects/model.ts:330.

#### Scenario: Non-date timestamp
- **WHEN** a restored file carries a non-ISO timestamp string
- **THEN** it is replaced with the current time or the file is treated as stale rather than winning the merge

Covered by: none (untested)

### Requirement: TODO: Confirm or undo for file deletion
Deleting a file SHALL be as protected as deleting a project. Today "Excluir" on a file deletes immediately with no confirm dialog (only a backup is taken), whereas deleting a project opens a confirm dialog. Evidence: src/features/projects/FileRow.tsx:124-128 versus src/features/projects/ProjectGroup.tsx:217-226. This may be intentional; confirm with product.

#### Scenario: Delete a file from the menu
- **WHEN** the user chooses to delete a file
- **THEN** a confirmation is requested before the file is removed

Covered by: none (untested)
