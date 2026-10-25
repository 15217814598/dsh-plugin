/**
 * Helpers for reading the DSH sidebar tree.
 *
 * The sidebar renders projects and sessions in one tree and both use
 * role="treeitem". Project rows carry aria-expanded, their CSS class ends
 * with "projectRow" and the name lives in a "projectText" child span;
 * session rows end with "sessionRow" and carry aria-selected instead.
 * The class prefix is a build hash, so match only the semantic suffixes.
 */

function isProjectRow(el: Element): boolean {
  const cls = typeof el.className === 'string' ? el.className : ''
  if (cls.includes('sessionRow')) return false
  return cls.includes('projectRow') || el.hasAttribute('aria-expanded')
}

/** Read the project name from a project row (falls back to full row text). */
function getRowProjectName(el: Element): string {
  const textEl = el.querySelector('[class*="projectText"]')
  return ((textEl && textEl.textContent) || el.textContent || '').trim()
}

/** Get project names shown in the DSH sidebar tree (sessions excluded). */
export function getDshProjects(): string[] {
  const names: string[] = []
  for (const item of document.querySelectorAll('[role="treeitem"]')) {
    if (!isProjectRow(item)) continue
    const name = getRowProjectName(item)
    if (name && name.length < 50 && !names.includes(name)) names.push(name)
  }
  return names
}

/** Find the sidebar tree item of a project by its exact name. */
export function findProjectTreeItem(name: string): HTMLElement | null {
  for (const item of document.querySelectorAll('[role="treeitem"]')) {
    if (!isProjectRow(item)) continue
    if (getRowProjectName(item) === name) return item as HTMLElement
  }
  return null
}
