/** A tenant inside a DevPulse installation. Every event belongs to exactly one. */
export interface Project {
  id: string;
  name: string;
  /** Lowercase, url-safe identifier used in dashboard routes. */
  slug: string;
  ownerId: string;
  /** Hosts allowed to post events with this project's write key. Empty means "any". */
  allowedOrigins: string[];
  /** Events older than this are pruned by the retention job. */
  retentionDays: number;
  createdAt: string;
  updatedAt: string;
}

/** Public, non-secret view of a project. Safe to hand to the browser. */
export type PublicProject = Omit<Project, 'ownerId'>;

export interface CreateProjectInput {
  name: string;
  slug?: string;
  allowedOrigins?: string[];
  retentionDays?: number;
}

export interface UpdateProjectInput {
  name?: string;
  allowedOrigins?: string[];
  retentionDays?: number;
}
