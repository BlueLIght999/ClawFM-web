/**
 * Ambient type declarations for names that appear in JSDoc across the codebase
 * but were never actually declared anywhere.
 *
 * Why ambient (no top-level import/export): this file must be visible to every
 * layer — domain, application, infrastructure — without any of them importing
 * it. A module with an import/export becomes a real dependency edge and would
 * reintroduce the cross-layer coupling the architecture forbids; a global
 * declaration file is visible everywhere and creates no edge at all
 * (dependency-cruiser does not cruise .d.ts).
 *
 * Scope: shapes here are intentionally loose. The goal is to let `tsc --checkJs`
 * reach the *structural* errors underneath this noise — a wrong argument count
 * in a real call, a missing port on a real adapter — not to build a full type
 * model of the app. Tighten a shape only when something depends on the detail.
 */

/** A song as it crosses the MusicSourcePort seam (source shape, pre-DTO). */
declare type Song = {
  id: string | number;
  name?: string;
  ar?: Array<{ id?: string | number; name: string }>;
  al?: { id?: string | number; name?: string; picUrl?: string };
  dt?: number;
  [key: string]: any;
};

/** A weighted profile tag. */
declare type Tag = {
  tag: string;
  weight: number;
  dimension?: string;
  [key: string]: any;
};

/** The fused listener profile produced by domain/profile. */
declare type ListenerProfile = {
  userId?: string;
  tags?: Record<string, Record<string, number>>;
  artistAffinity?: Array<{ artist: string; weight: number }>;
  timeSlot?: Record<string, number>;
  meta?: Record<string, any>;
  [key: string]: any;
};

/** A point-in-time snapshot of a listener profile. */
declare type ProfileSnapshot = {
  profile: ListenerProfile;
  schemaVersion?: number;
  capturedAt?: string;
  [key: string]: any;
};

/** Result of a clustering run over member or listener vectors. */
declare type ClusterResult = {
  strategy?: string;
  k: number;
  clusters: Array<{
    clusterId: number;
    label?: string;
    memberCount?: number;
    memberUserIds?: string[];
    centroid?: Record<string, number>;
  }>;
  memberAssignments?: Record<string, number>;
  [key: string]: any;
};

/** ClusterResult as persisted (DB row shape, snake_case). */
declare type ClusterResultDO = {
  clusterId: number;
  label?: string;
  memberCount?: number;
  centroid?: string | Record<string, number>;
  [key: string]: any;
};

/** A cached style/genre tag. */
declare type StyleTag = {
  tag: string;
  category?: string;
  score?: number;
  [key: string]: any;
};

/** Write shape for a cached style tag. */
declare type StyleTagDO = {
  tag: string;
  category?: string;
  score?: number;
  [key: string]: any;
};

/** Association between a song and a style tag. */
declare type SongStyleMapping = {
  songId: string;
  tag: string;
  weight?: number;
  [key: string]: any;
};

/** Write shape for a song-style mapping. */
declare type SongStyleMappingDO = {
  songId: string;
  tag: string;
  weight?: number;
  [key: string]: any;
};

/** Progress state of a profile collection run. */
declare type CollectionState = {
  userId?: string;
  status?: string;
  lastCollectedAt?: string | null;
  [key: string]: any;
};

/** Outcome of a metadata-enrichment pass. */
declare type EnrichmentResult = {
  enriched?: number;
  skipped?: number;
  failed?: number;
  [key: string]: any;
};

/** A tool exposed to the agent loop. */
declare type ToolDefinition = {
  name: string;
  description?: string;
  parameters?: Record<string, any>;
  handler?: Function;
  [key: string]: any;
};

/**
 * State machine of the ReAct agent loop. It is a behaviour object (methods that
 * close over the internal 'idle'|'thinking'|... states), not a data record, so
 * the shape is declared as methods. Returns from createAgentLoopState().
 */
declare type AgentLoopState = {
  start: () => void;
  recordThought: (thought: any) => void;
  recordAction: (action: any) => void;
  recordObservation: (observation: any) => void;
  canContinue: () => boolean;
  finish: () => void;
  isDone: () => boolean;
  getIterationCount: () => number;
  getHistory: () => Array<object>;
  getState: () => string;
};

/** Base class of the profile search providers. */
declare type BaseSearchProvider = {
  search: (query: string, options?: object) => Promise<any[]>;
  [key: string]: any;
};

/**
 * Abstract clustering strategy. Both the concrete KMeans/DBSCAN classes in
 * domain/shared/ClusterStrategy.js and any injected test double satisfy this.
 */
declare type ClusterStrategy = {
  readonly name?: string;
  cluster: (vectors: Array<object>, options?: object) => ClusterResult;
  [key: string]: any;
};

/** Express types, used by the HTTP layer's JSDoc. */
declare namespace Express {
  interface Request {
    [key: string]: any;
  }
  interface Response {
    [key: string]: any;
  }
}
