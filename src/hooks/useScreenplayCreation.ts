import { useState, useCallback } from 'react';
import {
  collection,
  addDoc,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
  getDoc,
  updateDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { v4 as uuidv4 } from 'uuid';

// Block types
export enum BlockType {
  SCENE_HEADING = 'scene-heading',
  ACTION = 'action',
  CHARACTER = 'character',
  DIALOGUE = 'dialogue',
  PARENTHETICAL = 'parenthetical',
  TRANSITION = 'transition',
  SHOT = 'shot',
  TEXT = 'text',
}

// Block interface
interface Block {
  id: string;
  type: BlockType | string;
  content: string;
  index?: number;
  isPaginated?: boolean;
  characterId?: string;
  characterName?: string;
}

// Screenplay creation parameters
interface CreateScreenplayParams {
  title: string;
  projectId: string;
  ownerId: string;
  metadata: {
    format: 'Movie' | 'Short Film' | 'Series' | 'Micro Drama';
    logline: string;
    genre: string[];
    author: string;
    season?: number;
    episode?: number;
  };
  collaborators?: string[];
}

// Character interface
interface Character {
  id: string;
  name: string;
  bio?: string;
  projects?: string[];
  actor?: string;
  gender?: string;
  age?: number;
  trait?: string;
  personality?: string;
  function?: string;
  description?: string;
  screenplays: string[];
}

export const useScreenplayCreation = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Error handling function
  const handleError = (err: any, customMessage: string) => {
    console.error(`${customMessage}:`, err);
    if (err.message && err.message.includes('permission')) {
      console.warn('Permission error detected, continuing with operation...');
      return false;
    }
    setError(`${customMessage}: ${err instanceof Error ? err.message : 'Unknown error'}`);
    return true;
  };

  // Create character function
  const createCharacter = useCallback(
    async (character: Omit<Character, 'id'>, projectId: string): Promise<Character | null> => {
      try {
        const characterRef = doc(collection(db, `projects/${projectId}/characters`));
        await setDoc(characterRef, {
          ...character,
          actor: character.actor || '',
          gender: character.gender || '',
          age: character.age || null,
          trait: character.trait || '',
          personality: character.personality || '',
          function: character.function || '',
          description: character.description || '',
          createdAt: new Date(),
          lastModified: new Date(),
        });
        console.log(`Character ${character.name} created with ID: ${characterRef.id}`);
        return { id: characterRef.id, ...character };
      } catch (err) {
        console.error('Error creating character:', err);
        return { id: `temp-${uuidv4()}`, ...character };
      }
    },
    []
  );

  // Create sample blocks function
  const createSampleBlocks = useCallback(
    async (projectId: string, screenplayId: string, characters: Character[]): Promise<Block[]> => {
      try {
        // Create sample blocks (simplified for brevity)
        let blocks: Block[] = [];
        let index = 0;
        
        // Scene heading
        blocks.push({
          id: `block-${uuidv4()}`,
          type: BlockType.SCENE_HEADING,
          content: 'EXT. CENTRAL PARK - DAY',
          index: index++,
        });
        
        // Action
        blocks.push({
          id: `block-${uuidv4()}`,
          type: BlockType.ACTION,
          content: 'A beautiful sunny day.',
          index: index++,
        });
        
        // Save blocks to Firestore
        try {
          const editorState = {
            blocks: blocks,
            activeBlock: blocks[0].id,
            selectedBlocks: [],
            history: [blocks],
            historyIndex: 0,
            editingHeader: false,
            header: { title: '', author: '', contact: '' },
          };
          
          await setDoc(
            doc(db, `projects/${projectId}/screenplays/${screenplayId}/editor/state`),
            editorState
          );
          
          await updateDoc(doc(db, `projects/${projectId}/screenplays/${screenplayId}`), {
            hasBlocks: true,
            blocksCount: blocks.length,
            characters: characters.map((char) => char.id),
            lastModified: new Date(),
          });
          
          console.log(`Created ${blocks.length} sample blocks for screenplay ${screenplayId}`);
        } catch (err) {
          console.error('Failed to save editor state:', err);
        }
        
        return blocks;
      } catch (err) {
        console.error('Error creating sample blocks:', err);
        return [];
      }
    },
    []
  );

  // Create screenplay function
  const createScreenplay = useCallback(
    async ({
      title,
      projectId,
      ownerId,
      metadata,
      collaborators = [],
    }: CreateScreenplayParams) => {
      setLoading(true);
      setError(null);

      try {
        if (!title || !projectId || !ownerId) {
          throw new Error('Missing required parameters (title, projectId, or ownerId)');
        }

        console.log('Creating screenplay with parameters:', { title, projectId, ownerId, metadata });
        const currentTime = new Date();

        // Create screenplay document as subcollection of project with the same ID as the project
        // This ensures consistency and prevents duplicate screenplay creation
        const screenplayRef = doc(db, `projects/${projectId}/screenplays`, projectId);
        
        try {
          await setDoc(screenplayRef, {
            title,
            ownerId,
            createdAt: currentTime,
            lastModified: currentTime,
            version: 1,
            collaborators: [ownerId, ...collaborators],
            status: 'Draft',
            metadata,
            hasBlocks: false,
            blocksCount: 0,
            characters: [],
          });
          console.log('Screenplay document created successfully:', screenplayRef.id);
        } catch (err) {
          const shouldStop = handleError(err, 'Error creating screenplay document');
          if (shouldStop) return null;
          console.log('Continuing despite screenplay creation error...');
        }

        // Create characters
        const characters: Character[] = [];
        const john = await createCharacter(
          {
            name: 'JOHN',
            bio: 'A confident man with a thoughtful demeanor.',
            screenplays: [screenplayRef.id],
            projects: [projectId],
          },
          projectId
        );
        if (john) characters.push(john);

        const mary = await createCharacter(
          {
            name: 'MARY',
            bio: 'A smart and witty young woman with a bright smile.',
            screenplays: [screenplayRef.id],
          },
          projectId
        );
        if (mary) characters.push(mary);

        // Create blocks
        const blocks = await createSampleBlocks(projectId, screenplayRef.id, characters);

        // Create scenes
        try {
          const sceneHeadingBlocks = blocks.filter((b) => b.type === BlockType.SCENE_HEADING);
          
          for (let i = 0; i < sceneHeadingBlocks.length; i++) {
            const sceneBlock = sceneHeadingBlocks[i];
            const sceneNumber = i + 1;
            
            // Find blocks for this scene
            const startIndex = blocks.findIndex((b) => b.id === sceneBlock.id);
            let endIndex = blocks.length;
            
            if (i < sceneHeadingBlocks.length - 1) {
              const nextSceneBlock = sceneHeadingBlocks[i + 1];
              endIndex = blocks.findIndex((b) => b.id === nextSceneBlock.id);
            }
            
            const sceneBlocks = blocks.slice(startIndex, endIndex);
            const relatedBlockIds = sceneBlocks.map((b) => b.id);
            
            // Create scene document
            const sceneRef = doc(
              collection(db, `projects/${projectId}/screenplays/${screenplayRef.id}/scenes`)
            );
            
            await setDoc(sceneRef, {
              sceneNumber: sceneNumber,
              sceneHeading: sceneBlock.content,
              status: 'Draft',
              lastModified: currentTime,
              modifiedBy: ownerId,
              relatedBlocks: relatedBlockIds,
              sceneBlocksData: sceneBlocks.map((block) => ({
                id: block.id,
                type: block.type,
                content: block.content,
                index: block.index,
                characterId: block.characterId,
                characterName: block.characterName,
              })),
            });
          }
        } catch (sceneErr) {
          console.warn('Could not create scene documents:', sceneErr);
        }

        return screenplayRef.id;
      } catch (err) {
        handleError(err, 'Error in screenplay creation process');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [createCharacter, createSampleBlocks]
  );

  // Create series screenplays function
  const createSeriesScreenplays = useCallback(
    async ({
      projectId,
      ownerId,
      baseTitle,
      metadata,
      episodes,
      collaborators = [],
    }: Omit<CreateScreenplayParams, 'title'> & {
      baseTitle: string;
      episodes: number;
    }) => {
      setLoading(true);
      setError(null);

      try {
        if (!projectId || !ownerId || !baseTitle || !episodes || episodes < 1) {
          throw new Error('Missing required parameters for series creation');
        }

        const screenplayIds = [];
        const characters: Character[] = [];

        // Create shared characters
        const john = await createCharacter(
          {
            name: 'JOHN',
            bio: 'A confident man with a thoughtful demeanor.',
            screenplays: [],
            projects: [projectId],
          },
          projectId
        );
        if (john) characters.push(john);

        const mary = await createCharacter(
          {
            name: 'MARY',
            bio: 'A smart and witty young woman with a bright smile.',
            screenplays: [],
            projects: [projectId],
          },
          projectId
        );
        if (mary) characters.push(mary);

        // Create episodes
        for (let i = 1; i <= episodes; i++) {
          const episodeTitle = `${baseTitle} - Episode ${i}`;
          const episodeMetadata = { ...metadata, episode: i };
          
          try {
            const currentTime = new Date();
            // For series, use a consistent ID pattern based on project ID and episode number
            // This ensures we can predictably find the screenplay later
            const episodeId = `${projectId}-episode-${i}`;
            const screenplayRef = doc(db, `projects/${projectId}/screenplays`, episodeId);
            
            await setDoc(screenplayRef, {
              title: episodeTitle,
              ownerId,
              createdAt: currentTime,
              lastModified: currentTime,
              version: 1,
              collaborators: [ownerId, ...collaborators],
              status: 'Draft',
              metadata: episodeMetadata,
              hasBlocks: false,
              blocksCount: 0,
              characters: characters.map((char) => char.id),
            });
            
            // Update character screenplays
            for (const character of characters) {
              character.screenplays.push(screenplayRef.id);
            }
            
            // Create blocks and scenes
            const blocks = await createSampleBlocks(projectId, screenplayRef.id, characters);
            
            // Create scenes (simplified)
            const sceneHeadingBlocks = blocks.filter((b) => b.type === BlockType.SCENE_HEADING);
            for (let j = 0; j < sceneHeadingBlocks.length; j++) {
              const sceneBlock = sceneHeadingBlocks[j];
              const sceneRef = doc(
                collection(db, `projects/${projectId}/screenplays/${screenplayRef.id}/scenes`)
              );
              
              await setDoc(sceneRef, {
                sceneNumber: j + 1,
                sceneHeading: sceneBlock.content,
                status: 'Draft',
                lastModified: currentTime,
                modifiedBy: ownerId,
              });
            }
            
            screenplayIds.push(screenplayRef.id);
          } catch (err) {
            console.error(`Error creating episode ${i}:`, err);
          }
        }

        // Update character screenplays
        for (const character of characters) {
          try {
            const characterRef = doc(db, `projects/${projectId}/characters`, character.id);
            await updateDoc(characterRef, {
              screenplays: character.screenplays,
              lastModified: new Date(),
            });
          } catch (err) {
            console.warn(`Failed to update character ${character.name} screenplays:`, err);
          }
        }

        return screenplayIds;
      } catch (err) {
        handleError(err, 'Error creating series screenplays');
        return [];
      } finally {
        setLoading(false);
      }
    },
    [createCharacter, createSampleBlocks]
  );

  // Add block to screenplay function
  const addBlockToScreenplay = useCallback(
    async (
      projectId: string,
      screenplayId: string,
      block: Omit<Block, 'id' | 'index'>,
      afterBlockId?: string
    ) => {
      try {
        // Get current editor state
        const stateRef = doc(db, `projects/${projectId}/screenplays/${screenplayId}/editor/state`);
        const stateDoc = await getDoc(stateRef);

        if (!stateDoc.exists()) {
          throw new Error(`Editor state not found for screenplay ${screenplayId}`);
        }

        const editorState = stateDoc.data();
        const blocks = editorState.blocks || [];

        // Create new block
        const newBlockId = `block-${uuidv4()}`;
        let insertIndex = blocks.length;

        if (afterBlockId) {
          const afterBlockIndex = blocks.findIndex((b: Block) => b.id === afterBlockId);
          if (afterBlockIndex !== -1) {
            insertIndex = afterBlockIndex + 1;
          }
        }

        const newBlock = {
          ...block,
          id: newBlockId,
          index: insertIndex,
        };

        // Update blocks
        const updatedBlocks = [
          ...blocks.slice(0, insertIndex).map((b: Block) => b),
          newBlock,
          ...blocks.slice(insertIndex).map((b: Block) => ({ ...b, index: (b.index || 0) + 1 })),
        ];

        // Update editor state
        const updatedState = {
          ...editorState,
          blocks: updatedBlocks,
          lastModified: new Date(),
        };

        await setDoc(stateRef, updatedState);

        // Update screenplay document
        await updateDoc(doc(db, `projects/${projectId}/screenplays/${screenplayId}`), {
          blocksCount: updatedBlocks.length,
          lastModified: new Date(),
        });

        return newBlockId;
      } catch (err) {
        console.error(`Error adding block to screenplay ${screenplayId}:`, err);
        return null;
      }
    },
    []
  );

  return {
    createScreenplay,
    createSeriesScreenplays,
    createCharacter,
    createSampleBlocks,
    addBlockToScreenplay,
    loading,
    error,
  };
};
