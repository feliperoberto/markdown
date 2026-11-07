// Stable identity for projects and files (openspec change
// add-sync-item-identity). Local state stays keyed by name; this sidecar
// remembers, per stable id, the item's CURRENT name and when it was last
// renamed. It is synced alongside `projects` so two devices can tell
// "renamed" apart from "deleted + created": a rename keeps the id, so the
// merge sees one item instead of leaving the old name behind as a
// duplicate. Pure functions only — storage lives in storage.ts, wiring in
// useProjects.ts.
import type { ProjectFile, ProjectFiles, ProjectsState } from './types'

export interface ProjectIdentity {
  name: string
  /** ISO time of the last rename (or of the id assignment, for a never-renamed item). */
  nameUpdatedAt: string
}

export interface FileIdentity extends ProjectIdentity {
  /** Id of the owning project; files never move between projects. */
  projectId: string
}

export interface Identities {
  projects: Readonly<Record<string, ProjectIdentity>>
  files: Readonly<Record<string, FileIdentity>>
}

export const NO_IDENTITIES: Identities = { projects: {}, files: {} }

/** Collision-resistant id; `crypto.randomUUID` where available, a random hex fallback otherwise. */
export function generateId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  const hex = () =>
    Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, '0')
  return `${hex()}${hex()}-${hex()}-${hex()}-${hex()}-${hex()}${hex()}${hex()}`
}

function projectIdByName(ids: Identities): Map<string, string> {
  return new Map(Object.entries(ids.projects).map(([id, p]) => [p.name, id]))
}

function fileIdByName(ids: Identities, projectId: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const [id, f] of Object.entries(ids.files)) {
    if (f.projectId === projectId) map.set(f.name, id)
  }
  return map
}

/**
 * Gives an id to every project and file of `state` the sidecar does not
 * know yet (pre-existing data, ZIP imports, newly created items). Never
 * removes anything — see `pruneIdentities`. Same-reference-on-no-op.
 */
export function ensureIdentities(
  ids: Identities,
  state: ProjectsState,
  nowIso: string,
  newId: () => string = generateId,
): Identities {
  let projects = ids.projects
  let files = ids.files
  let current: Identities = ids
  const byName = projectIdByName(ids)

  for (const [projectName, projectFiles] of Object.entries(state)) {
    let projectId = byName.get(projectName)
    if (!projectId) {
      projectId = newId()
      projects = { ...projects, [projectId]: { name: projectName, nameUpdatedAt: nowIso } }
      byName.set(projectName, projectId)
      current = { projects, files }
    }
    const known = fileIdByName(current, projectId)
    for (const fileName of Object.keys(projectFiles)) {
      if (known.has(fileName)) continue
      const fileId = newId()
      files = { ...files, [fileId]: { projectId, name: fileName, nameUpdatedAt: nowIso } }
      current = { projects, files }
    }
  }

  return projects === ids.projects && files === ids.files ? ids : { projects, files }
}

/** Records a project rename: same id, new name and rename time. Same-reference when `oldName` is unknown. */
export function renameProjectIdentity(
  ids: Identities,
  oldName: string,
  newName: string,
  nowIso: string,
): Identities {
  const id = projectIdByName(ids).get(oldName)
  if (!id) return ids
  return {
    ...ids,
    projects: { ...ids.projects, [id]: { name: newName, nameUpdatedAt: nowIso } },
  }
}

/** Records a file rename inside `projectName`. Same-reference when the file is unknown. */
export function renameFileIdentity(
  ids: Identities,
  projectName: string,
  oldName: string,
  newName: string,
  nowIso: string,
): Identities {
  const projectId = projectIdByName(ids).get(projectName)
  if (!projectId) return ids
  const fileId = fileIdByName(ids, projectId).get(oldName)
  if (!fileId) return ids
  return {
    ...ids,
    files: {
      ...ids.files,
      [fileId]: { projectId, name: newName, nameUpdatedAt: nowIso },
    },
  }
}

/** Drops entries for projects and files that are not in `state` any more. Same-reference-on-no-op. */
export function pruneIdentities(ids: Identities, state: ProjectsState): Identities {
  const projects: Record<string, ProjectIdentity> = {}
  const keptProjectNames = new Map<string, string>()
  let changed = false
  for (const [id, p] of Object.entries(ids.projects)) {
    if (Object.prototype.hasOwnProperty.call(state, p.name)) {
      projects[id] = p
      keptProjectNames.set(id, p.name)
    } else {
      changed = true
    }
  }
  const files: Record<string, FileIdentity> = {}
  for (const [id, f] of Object.entries(ids.files)) {
    const projectName = keptProjectNames.get(f.projectId)
    if (
      projectName !== undefined &&
      Object.prototype.hasOwnProperty.call(state[projectName], f.name)
    ) {
      files[id] = f
    } else {
      changed = true
    }
  }
  return changed ? { projects, files } : ids
}

function isIsoTime(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Normalizes an untrusted `Identities`-shaped blob (a pulled Drive
 * backup, or a hand-edited localStorage value): keeps only well-formed
 * entries and drops files whose project is missing, so garbage degrades
 * to "no identity known" instead of poisoning the merge.
 */
export function normalizeIdentities(raw: unknown): Identities {
  if (!isRecord(raw) || !isRecord(raw.projects) || !isRecord(raw.files)) return NO_IDENTITIES

  const projects: Record<string, ProjectIdentity> = {}
  for (const [id, value] of Object.entries(raw.projects)) {
    if (!isRecord(value)) continue
    if (typeof value.name !== 'string' || !value.name || !isIsoTime(value.nameUpdatedAt)) continue
    projects[id] = { name: value.name, nameUpdatedAt: value.nameUpdatedAt }
  }
  const files: Record<string, FileIdentity> = {}
  for (const [id, value] of Object.entries(raw.files)) {
    if (!isRecord(value)) continue
    if (typeof value.name !== 'string' || !value.name || !isIsoTime(value.nameUpdatedAt)) continue
    if (typeof value.projectId !== 'string' || !(value.projectId in projects)) continue
    files[id] = {
      projectId: value.projectId,
      name: value.name,
      nameUpdatedAt: value.nameUpdatedAt,
    }
  }
  return { projects, files }
}

// --- Aligning a pulled snapshot with local names -------------------------------

export interface AppliedRenames {
  projects: Array<{ from: string; to: string }>
  files: Array<{ project: string; from: string; to: string }>
}

export interface AlignResult {
  /** Local projects with any remote-won renames applied (key order preserved). */
  local: ProjectsState
  /** Remote projects renamed to the names both sides now agree on. */
  remote: ProjectsState
  /** Union of both sides' identities, one entry per id, names agreed. */
  identities: Identities
  /** Renames applied to the LOCAL side, so the caller can carry archived flags and selection. */
  localRenames: AppliedRenames
}

function nameMap(entries: Record<string, ProjectIdentity>): Map<string, string> {
  return new Map(Object.entries(entries).map(([id, e]) => [e.name, id]))
}

/** Renames one key while keeping the key order (the order is the UI order). */
function renameKey<V>(
  obj: Record<string, V>,
  from: string,
  to: string,
  map: (value: V) => V = (value) => value,
): Record<string, V> {
  const out: Record<string, V> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (key === from) out[to] = map(value)
    else out[key] = value
  }
  return out
}

/** The later rename wins; an exact tie goes to the larger name so every device picks the same one. */
function pickRename(a: ProjectIdentity, b: ProjectIdentity): ProjectIdentity {
  const ta = Date.parse(a.nameUpdatedAt)
  const tb = Date.parse(b.nameUpdatedAt)
  if (ta > tb) return a
  if (tb > ta) return b
  return a.name >= b.name ? a : b
}

function entryOf<V>(map: Record<string, V>, id: string): V {
  const entry = map[id]
  if (entry === undefined) throw new Error(`Missing identity ${id}`)
  return entry
}

function uniqueName(base: string, isTaken: (name: string) => boolean): string {
  if (!isTaken(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base} (${n})`
    if (!isTaken(candidate)) return candidate
  }
}

/** Moves a project id (and the files that point at it) to another id. */
function moveProjectId(
  projects: Record<string, ProjectIdentity>,
  files: Record<string, FileIdentity>,
  from: string,
  to: string,
): void {
  const entry = projects[from]
  if (from === to || !entry) return
  projects[to] = entry
  delete projects[from]
  for (const [id, f] of Object.entries(files)) {
    if (f.projectId === from) files[id] = { ...f, projectId: to }
  }
}

/**
 * Makes a pulled snapshot use the same names as the local state for every
 * item both sides know by id, and gives each item one id, before the
 * freshness merge (which matches by name):
 *
 * 1. a remote item with no identity (a version 1 backup) adopts the id of
 *    the local item with the same name;
 * 2. two items with the same name but different ids (two devices that
 *    created ids independently) converge on the smaller id;
 * 3. an item known by the same id under two names takes the name with the
 *    later rename time (see `pickRename`) on both sides; if that name is
 *    used by a different item, a numeric suffix keeps both.
 *
 * Pure: the input states are never mutated, and key order is preserved.
 */
export function alignRemote(
  local: ProjectsState,
  localIds: Identities,
  remote: ProjectsState,
  remoteIds: Identities,
  nowIso: string,
  newId: () => string = generateId,
): AlignResult {
  const L = ensureIdentities(pruneIdentities(localIds, local), local, nowIso, newId)
  const R = pruneIdentities(remoteIds, remote)

  const Lp = { ...L.projects }
  const Lf = { ...L.files }
  const Rp = { ...R.projects }
  const Rf = { ...R.files }
  let lState = local
  let rState = remote
  const localRenames: AppliedRenames = { projects: [], files: [] }

  // --- projects: adoption, then same-name convergence --------------------
  const lpByName = nameMap(Lp)
  const rpByName = nameMap(Rp)
  for (const name of Object.keys(rState)) {
    if (rpByName.has(name)) continue
    const lid = lpByName.get(name)
    const entry = lid ? Lp[lid] : undefined
    if (lid && entry && !(lid in Rp)) {
      Rp[lid] = { ...entry }
      rpByName.set(name, lid)
    }
  }
  for (const [rid, entry] of Object.entries(Rp)) {
    if (rid in Lp) continue
    const lid = nameMap(Lp).get(entry.name)
    if (!lid || lid in Rp) continue
    const canonical = lid < rid ? lid : rid
    moveProjectId(Lp, Lf, lid, canonical)
    moveProjectId(Rp, Rf, rid, canonical)
  }

  // --- projects: rename convergence ---------------------------------------
  for (const id of Object.keys(Lp).sort()) {
    const l = Lp[id]
    const r = Rp[id]
    if (!l || !r) continue
    const winner = pickRename(l, r)
    let finalName = winner.name
    if (l.name !== r.name) {
      finalName = uniqueName(winner.name, (candidate) => {
        const lOwner = nameMap(Lp).get(candidate)
        const rOwner = nameMap(Rp).get(candidate)
        return (candidate in lState && lOwner !== id) || (candidate in rState && rOwner !== id)
      })
      if (l.name !== finalName) {
        lState = renameKey(lState, l.name, finalName)
        localRenames.projects.push({ from: l.name, to: finalName })
      }
      if (r.name !== finalName) rState = renameKey(rState, r.name, finalName)
    }
    const merged = { name: finalName, nameUpdatedAt: winner.nameUpdatedAt }
    Lp[id] = merged
    Rp[id] = merged
  }

  // --- files, per project both sides know ----------------------------------
  for (const projectId of Object.keys(Lp).sort()) {
    if (!(projectId in Rp)) continue
    const projectName = entryOf(Lp, projectId).name
    const lFiles = lState[projectName]
    const rFiles = rState[projectName]
    if (!lFiles || !rFiles) continue

    const filesOf = (entries: Record<string, FileIdentity>) =>
      new Map(
        Object.entries(entries)
          .filter(([, f]) => f.projectId === projectId)
          .map(([id, f]) => [f.name, id]),
      )

    // adoption of unidentified remote files
    const lfByName = filesOf(Lf)
    const rfByName = filesOf(Rf)
    for (const name of Object.keys(rFiles)) {
      if (rfByName.has(name)) continue
      const lid = lfByName.get(name)
      const entry = lid ? Lf[lid] : undefined
      if (lid && entry && !(lid in Rf)) Rf[lid] = { ...entry }
    }
    // same name, different ids -> smaller id
    for (const [rid, entry] of Object.entries(Rf)) {
      if (entry.projectId !== projectId || rid in Lf) continue
      const lid = filesOf(Lf).get(entry.name)
      if (!lid || lid in Rf) continue
      const canonical = lid < rid ? lid : rid
      if (lid !== canonical) {
        Lf[canonical] = entryOf(Lf, lid)
        delete Lf[lid]
      }
      if (rid !== canonical) {
        Rf[canonical] = entry
        delete Rf[rid]
      }
    }
    // rename convergence
    let lProject: ProjectFiles = lFiles
    let rProject: ProjectFiles = rFiles
    const setName = (to: string) => (file: ProjectFile) => ({ ...file, name: to })
    for (const id of Object.keys(Lf).sort()) {
      const l = Lf[id]
      const r = Rf[id]
      if (!l || !r || l.projectId !== projectId || r.projectId !== projectId) continue
      const winner = pickRename(l, r)
      let finalName = winner.name
      if (l.name !== r.name) {
        finalName = uniqueName(winner.name, (candidate) => {
          const lOwner = filesOf(Lf).get(candidate)
          const rOwner = filesOf(Rf).get(candidate)
          return (
            (candidate in lProject && lOwner !== id) || (candidate in rProject && rOwner !== id)
          )
        })
        if (l.name !== finalName) {
          lProject = renameKey(lProject, l.name, finalName, setName(finalName))
          localRenames.files.push({ project: projectName, from: l.name, to: finalName })
        }
        if (r.name !== finalName)
          rProject = renameKey(rProject, r.name, finalName, setName(finalName))
      }
      const merged = { projectId, name: finalName, nameUpdatedAt: winner.nameUpdatedAt }
      Lf[id] = merged
      Rf[id] = merged
    }
    if (lProject !== lFiles) lState = { ...lState, [projectName]: lProject }
    if (rProject !== rFiles) rState = { ...rState, [projectName]: rProject }
  }

  // Remote items nobody matched (new on the remote) get fresh ids.
  const remoteComplete = ensureIdentities({ projects: Rp, files: Rf }, rState, nowIso, newId)

  return {
    local: lState,
    remote: rState,
    identities: {
      projects: { ...Lp, ...remoteComplete.projects },
      files: { ...Lf, ...remoteComplete.files },
    },
    localRenames,
  }
}
