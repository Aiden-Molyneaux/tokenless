// Mock projects for visual development of the app shell.
// Phase 2A renders these in the ProjectSwitcher dropdown.
// Phase 3 replaces with real projects from SQLite via IPC.

export interface MockProject {
  id: string
  name: string
  rootPath: string
}

export const MOCK_PROJECTS: readonly MockProject[] = [
  { id: 'proj-tokenless', name: 'TokenLess', rootPath: 'C:/personal/tokenless' },
  { id: 'proj-website', name: 'Personal Website', rootPath: 'C:/personal/website' },
  { id: 'proj-cad', name: 'CAD Mobile (work)', rootPath: 'C:/work/cad-mobile' }
]
