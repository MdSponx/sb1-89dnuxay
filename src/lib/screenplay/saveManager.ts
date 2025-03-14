import { 
  doc, collection, writeBatch, serverTimestamp, 
  increment, getDoc, getDocs, query, where,
  onSnapshot, Timestamp, updateDoc, deleteDoc, setDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Block } from '../../types';
import type { 
  Screenplay, Scene, SceneContent, 
  SaveResult, SceneLock
} from '../../types/screenplay';

const SCENE_SIZE_LIMIT = 500 * 1024; // 500KB
const LOCK_DURATION = 5 * 60 * 1000; // 5 minutes

export class ScreenplaySaveManager {
  private screenplay: Screenplay;
  private userId: string;
  private activeLocks: Map<string, NodeJS.Timeout>;
  private changeBuffer: Map<string, {
    content: Block[];
    timer: NodeJS.Timeout;
  }>;

  constructor(screenplay: Screenplay, userId: string) {
    this.screenplay = screenplay;
    this.userId = userId;
    this.activeLocks = new Map();
    this.changeBuffer = new Map();
  }

  // Get the project ID from the screenplay
  public getProjectId(): string {
    return this.screenplay.projectId;
  }

  // Update the project ID in the screenplay
  public updateProjectId(projectId: string): void {
    if (projectId && this.screenplay.projectId !== projectId) {
      console.log(`Updating screenplay projectId from ${this.screenplay.projectId} to ${projectId}`);
      this.screenplay.projectId = projectId;
    }
  }

  private async acquireLock(sceneId: string): Promise<boolean> {
    try {
      const lockRef = doc(db, 'scene_locks', sceneId);
      const lockDoc = await getDoc(lockRef);

      if (lockDoc.exists()) {
        const lock = lockDoc.data() as SceneLock;
        if (lock.userId !== this.userId && 
            lock.expires.toMillis() > Date.now()) {
          return false;
        }
      }

      const batch = writeBatch(db);
      batch.set(lockRef, {
        sceneId,
        userId: this.userId,
        acquired: serverTimestamp(),
        expires: Timestamp.fromMillis(Date.now() + LOCK_DURATION)
      });
      await batch.commit();

      // Set up auto-renewal
      const renewInterval = setInterval(async () => {
        try {
          await this.renewLock(sceneId);
        } catch (err) {
          console.error('Failed to renew lock:', err);
          this.releaseLock(sceneId);
        }
      }, LOCK_DURATION / 2);

      this.activeLocks.set(sceneId, renewInterval);
      return true;
    } catch (err) {
      console.error('Failed to acquire lock:', err);
      return false;
    }
  }

  private async renewLock(sceneId: string): Promise<void> {
    const lockRef = doc(db, 'scene_locks', sceneId);
    await updateDoc(lockRef, {
      expires: Timestamp.fromMillis(Date.now() + LOCK_DURATION)
    });
  }

  private async releaseLock(sceneId: string): Promise<void> {
    const interval = this.activeLocks.get(sceneId);
    if (interval) {
      clearInterval(interval);
      this.activeLocks.delete(sceneId);
    }

    try {
      const lockRef = doc(db, 'scene_locks', sceneId);
      await deleteDoc(lockRef);
    } catch (err) {
      console.error('Failed to release lock:', err);
    }
  }

  private splitActionIntoChunks(action: string): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    const sentences = action.split(/(?<=[.!?])\s+/);

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > SCENE_SIZE_LIMIT) {
        chunks.push(currentChunk);
        currentChunk = sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  private async checkConflicts(sceneId: string): Promise<boolean> {
    // Get the effective screenplay ID
    const effectiveScreenplayId = this.getEffectiveScreenplayId();
    
    const sceneRef = doc(db, `projects/${this.screenplay.projectId}/screenplays/${effectiveScreenplayId}/scenes`, sceneId);
    const sceneDoc = await getDoc(sceneRef);

    if (!sceneDoc.exists()) return false;

    const scene = sceneDoc.data() as Scene;
    return scene.modifiedBy !== this.userId && 
           scene.lastModified.toMillis() > Date.now() - 5000;
  }

  // Helper method to get the effective screenplay ID
  private getEffectiveScreenplayId(): string {
    // Check URL for screenplay ID first
    const urlParams = new URLSearchParams(window.location.search);
    const urlScreenplayId = urlParams.get('screenplay');
    
    // Use the screenplay ID from the URL if available, otherwise use the one from the screenplay object
    let effectiveScreenplayId = urlScreenplayId || this.screenplay.id;
    
    // Ensure we never use 'default-screenplay-id'
    if (effectiveScreenplayId === 'default-screenplay-id') {
      // First try to get a more specific ID from the URL path
      const pathMatch = window.location.pathname.match(/\/screenplays\/([^\/]+)/);
      if (pathMatch && pathMatch[1] && pathMatch[1] !== 'default-screenplay-id') {
        effectiveScreenplayId = pathMatch[1];
        console.log('Using screenplay ID from URL path:', effectiveScreenplayId);
      } 
      // If that fails, use the project ID from the screenplay object
      else if (this.screenplay.projectId) {
        effectiveScreenplayId = this.screenplay.projectId;
        console.log('Using project ID as screenplay ID:', effectiveScreenplayId);
      }
    }
    
    return effectiveScreenplayId;
  }

  public async saveScene(sceneId: string, blocks: Block[], ignoreConflicts: boolean = false): Promise<SaveResult> {
    try {
      // Get the effective screenplay ID
      const effectiveScreenplayId = this.getEffectiveScreenplayId();
      
      // If the screenplay ID has changed, update our internal reference
      if (effectiveScreenplayId !== this.screenplay.id) {
        console.log(`Updating screenplay ID from ${this.screenplay.id} to ${effectiveScreenplayId} for scene ${sceneId}`);
        this.screenplay.id = effectiveScreenplayId;
      }
      
      // Check for conflicts (skip if ignoreConflicts is true)
      if (!ignoreConflicts && await this.checkConflicts(sceneId)) {
        return {
          success: false,
          error: 'Scene has been modified by another user',
          conflicts: [{
            sceneId,
            userEmail: 'another-user@example.com', // Using a placeholder email
            timestamp: Timestamp.now()
          }]
        };
      }

      // Acquire lock
      if (!await this.acquireLock(sceneId)) {
        return {
          success: false,
          error: 'Scene is being edited by another user',
          conflicts: [{
            sceneId,
            userEmail: 'another-user@example.com', // Using a placeholder email
            timestamp: Timestamp.now()
          }]
        };
      }

      const batch = writeBatch(db);
      const sceneRef = doc(db, `projects/${this.screenplay.projectId}/screenplays/${effectiveScreenplayId}/scenes`, sceneId);
      const contentRef = doc(db, `projects/${this.screenplay.projectId}/screenplays/${effectiveScreenplayId}/scenes/${sceneId}/content`, 'main');

      // Process blocks into scene content
      const sceneHeading = blocks.find(b => b.type === 'scene-heading')?.content || '';
      const actionBlocks = blocks.filter(b => b.type === 'action');
      const dialogueBlocks = blocks.filter(b => ['character', 'dialogue', 'parenthetical'].includes(b.type));

      // Prepare scene content
      const action = actionBlocks.map(b => b.content).join('\n');
      const actionSize = new Blob([action]).size;

      const sceneContent: SceneContent = {
        id: 'main',
        sceneId,
        dialogues: []
      };

      // Handle large action text
      if (actionSize > SCENE_SIZE_LIMIT) {
        sceneContent.actionChunks = this.splitActionIntoChunks(action);
      } else {
        sceneContent.action = action;
      }

      // Process dialogues
      let currentCharacter: string | null = null;
      let currentParenthetical: string | null = null;

      for (const block of dialogueBlocks) {
        if (block.type === 'character') {
          currentCharacter = block.content;
          currentParenthetical = null;
        } else if (block.type === 'parenthetical') {
          currentParenthetical = block.content;
        } else if (block.type === 'dialogue' && currentCharacter) {
          sceneContent.dialogues.push({
            characterName: currentCharacter,
            text: block.content,
            parenthetical: currentParenthetical || undefined
          });
          currentParenthetical = null;
        }
      }

      // Update scene metadata
      batch.set(sceneRef, {
        id: sceneId,
        screenplayId: effectiveScreenplayId,
        sceneHeading,
        status: 'Draft',
        lastModified: serverTimestamp(),
        modifiedBy: this.userId
      });

      // Update scene content
      batch.set(contentRef, sceneContent);

      // Update screenplay metadata
      const screenplayRef = doc(db, `projects/${this.screenplay.projectId}/screenplays`, effectiveScreenplayId);
      
      // Check if the screenplay exists
      const screenplaySnap = await getDoc(screenplayRef);
      
      if (screenplaySnap.exists()) {
        batch.update(screenplayRef, {
          lastModified: serverTimestamp(),
          version: increment(1)
        });
      } else {
        // Create screenplay if it doesn't exist
        batch.set(screenplayRef, {
          id: effectiveScreenplayId,
          title: 'Untitled Screenplay',
          ownerId: this.userId,
          createdAt: serverTimestamp(),
          lastModified: serverTimestamp(),
          version: serverTimestamp(),
          collaborators: [this.userId],
          status: 'Draft',
          metadata: {
            format: 'Movie',
            author: 'Unknown',
            createdAt: serverTimestamp()
          },
          hasBlocks: true,
          blocksCount: 0,
          characters: [],
          scenes: 1
        });
      }

      // Record change history
      const changeRef = doc(collection(db, `projects/${this.screenplay.projectId}/screenplays/${effectiveScreenplayId}/history`));
      batch.set(changeRef, {
        timestamp: serverTimestamp(),
        userId: this.userId,
        sceneId,
        type: 'UPDATE_SCENE',
        description: 'Updated scene content'
      });

      await batch.commit();
      return { success: true };

    } catch (err) {
      console.error('Failed to save scene:', err);
      return {
        success: false,
        error: 'Failed to save scene'
      };
    } finally {
      await this.releaseLock(sceneId);
    }
  }

  public bufferChanges(sceneId: string, blocks: Block[]): void {
    // Clear existing timer
    const existing = this.changeBuffer.get(sceneId);
    if (existing?.timer) {
      clearTimeout(existing.timer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      const content = this.changeBuffer.get(sceneId)?.content;
      if (content) {
        this.saveScene(sceneId, content)
          .catch(err => console.error('Autosave failed:', err));
        this.changeBuffer.delete(sceneId);
      }
    }, 3000);

    this.changeBuffer.set(sceneId, { content: blocks, timer });
  }

  public async saveScreenplay(conflictResolution?: 'overwrite' | 'merge'): Promise<SaveResult> {
    try {
      // Check if we're resolving conflicts
      const ignoreConflicts = conflictResolution === 'overwrite';
      
      // Get the effective screenplay ID
      const effectiveScreenplayId = this.getEffectiveScreenplayId();
      
      // If the screenplay ID has changed, update our internal reference
      if (effectiveScreenplayId !== this.screenplay.id) {
        console.log(`Updating screenplay ID from ${this.screenplay.id} to ${effectiveScreenplayId}`);
        this.screenplay.id = effectiveScreenplayId;
      }
      
      // Save any pending changes
      const savePromises = Array.from(this.changeBuffer.entries())
        .map(([sceneId, { content }]) => this.saveScene(sceneId, content, ignoreConflicts));
      
      const results = await Promise.all(savePromises);
      const failures = results.filter((r: SaveResult) => !r.success);

      if (failures.length > 0) {
        // If we're already trying to resolve conflicts but still failing,
        // there might be a more serious issue
        if (ignoreConflicts) {
          return {
            success: false,
            error: 'Failed to save some scenes even after conflict resolution',
            conflicts: failures.map((f: SaveResult) => f.conflicts || []).flat()
          };
        }
        
        return {
          success: false,
          error: 'Failed to save some scenes',
          conflicts: failures.map((f: SaveResult) => f.conflicts || []).flat()
        };
      }

      // Clear change buffer
      this.changeBuffer.clear();

      // Update screenplay metadata
      const screenplayRef = doc(db, `projects/${this.screenplay.projectId}/screenplays`, effectiveScreenplayId);
      
      // Check if the screenplay exists
      const screenplaySnap = await getDoc(screenplayRef);
      
      // Get all blocks from all scenes
      const allBlocks: Block[] = [];
      const scenesQuery = query(
        collection(db, `projects/${this.screenplay.projectId}/screenplays/${effectiveScreenplayId}/scenes`)
      );
      const scenesSnapshot = await getDocs(scenesQuery);
      
      for (const sceneDoc of scenesSnapshot.docs) {
        const sceneData = sceneDoc.data();
        if (sceneData.sceneBlocksData && Array.isArray(sceneData.sceneBlocksData)) {
          allBlocks.push(...sceneData.sceneBlocksData);
        }
      }
      
      // Sort blocks by index if available, otherwise by position in array
      if (allBlocks.length > 0) {
        allBlocks.sort((a, b) => {
          // Use index if available, otherwise use number property or default to 0
          const aIndex = (a as any).index !== undefined ? (a as any).index : (a.number || 0);
          const bIndex = (b as any).index !== undefined ? (b as any).index : (b.number || 0);
          return aIndex - bIndex;
        });
        
        // Update editor state with all blocks
        try {
          const editorStateRef = doc(db, `projects/${this.screenplay.projectId}/screenplays/${effectiveScreenplayId}/editor/state`);
          const editorStateSnap = await getDoc(editorStateRef);
          
          if (editorStateSnap.exists()) {
            // Update existing editor state with new blocks
            await updateDoc(editorStateRef, {
              blocks: allBlocks,
              lastModified: serverTimestamp()
            });
          } else {
            // Create new editor state
            await setDoc(editorStateRef, {
              blocks: allBlocks,
              activeBlock: allBlocks.length > 0 ? allBlocks[0].id : null,
              selectedBlocks: [],
              history: [allBlocks],
              historyIndex: 0,
              editingHeader: false,
              header: { title: '', author: '', contact: '' },
              lastModified: serverTimestamp()
            });
          }
        } catch (err) {
          console.error('Error updating editor state:', err);
        }
      }
      
      if (screenplaySnap.exists()) {
        // Update existing screenplay
        await updateDoc(screenplayRef, {
          lastModified: serverTimestamp(),
          version: increment(1),
          hasBlocks: allBlocks.length > 0,
          blocksCount: allBlocks.length
        });
      } else {
        // Create new screenplay if it doesn't exist
        const newScreenplayData = {
          ...this.screenplay,
          id: effectiveScreenplayId,
          lastModified: serverTimestamp(),
          version: serverTimestamp(),
          createdAt: serverTimestamp(),
          ownerId: this.userId,
          collaborators: [this.userId],
          status: 'Draft',
          metadata: {
            format: 'Movie',
            author: 'Unknown',
            createdAt: serverTimestamp()
          },
          hasBlocks: allBlocks.length > 0,
          blocksCount: allBlocks.length,
          characters: []
        };
        await setDoc(screenplayRef, newScreenplayData);
      }

      return { success: true };

    } catch (err) {
      console.error('Failed to save screenplay:', err);
      return {
        success: false,
        error: 'Failed to save screenplay'
      };
    }
  }

  public cleanup(): void {
    // Clear all timers and locks
    for (const [sceneId, timer] of this.changeBuffer.entries()) {
      clearTimeout(timer.timer);
      this.releaseLock(sceneId);
    }
    this.changeBuffer.clear();

    for (const interval of this.activeLocks.values()) {
      clearInterval(interval);
    }
    this.activeLocks.clear();
  }
}
