import { Timestamp } from 'firebase/firestore';

export type SceneStatus = 'Draft' | 'Final' | 'Needs Revision';
export type ScreenplayStatus = 'Draft' | 'Final' | 'Revision';
export type ChangeType = 'UPDATE_SCENE' | 'ADD_SCENE' | 'DELETE_SCENE' | 'UPDATE_METADATA';

export interface Screenplay {
  id: string;
  title: string;
  projectId: string;
  lastModified: Timestamp;
  version: number;
  collaborators: string[];
  status: ScreenplayStatus;
  metadata: {
    format: 'Movie' | 'Series';
    episode?: number;
    author: string;
    createdAt: Timestamp;
    tags?: string[];
  };
}

export interface Scene {
  id: string;
  screenplayId: string;
  sceneNumber: number;
  sceneHeading: string;
  status: SceneStatus;
  lastModified: Timestamp;
  modifiedBy: string;
}

export interface SceneContent {
  id: string;
  sceneId: string;
  action?: string;
  actionChunks?: string[];
  dialogues: Dialogue[];
}

export interface Dialogue {
  characterId?: string;
  characterName: string;
  text: string;
  parenthetical?: string;
}

export interface ChangeHistory {
  id: string;
  screenplayId: string;
  timestamp: Timestamp;
  userId: string;
  sceneId: string | null;
  type: ChangeType;
  description: string;
  changes?: {
    before: any;
    after: any;
  };
}

export interface CollaboratorCursor {
  userId: string;
  sceneId: string;
  position: {
    blockId: string;
    offset: number;
  };
  timestamp: Timestamp;
}

export interface SceneLock {
  sceneId: string;
  userId: string;
  acquired: Timestamp;
  expires: Timestamp;
}

export interface SaveResult {
  success: boolean;
  error?: string;
  version?: number;
  conflicts?: {
    sceneId: string;
    userEmail: string;
    timestamp: Timestamp;
  }[];
}