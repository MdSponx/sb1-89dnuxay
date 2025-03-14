import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, orderBy, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface Block {
  id: string;
  type: string;
  content: string;
  index?: number;
  isPaginated?: boolean;
  characterId?: string;
  characterName?: string;
}

interface Scene {
  id: string;
  sceneNumber: number;
  sceneHeading: string;
  status: string;
  sceneBlocksData?: Block[]; // ข้อมูล blocks ที่เก็บโดยตรง
  relatedBlocks?: string[]; // ข้อมูล block IDs แบบเก่า
  lastModified: any;
  modifiedBy: string;
}

interface Screenplay {
  id: string;
  title: string;
  metadata: {
    format: 'Movie' | 'Series' | 'Short Film' | 'Micro Drama';
    episode?: number;
    season?: number;
    author: string;
    logline?: string;
    genre?: string[];
  };
  status: 'Draft' | 'Final' | 'Revision';
  lastModified: any;
  version: number;
  hasBlocks: boolean;
  blocksCount: number;
  characters: string[];
  projectId: string;
}

interface EditorState {
  blocks: Block[];
  activeBlock: string;
  selectedBlocks: string[];
  history: Block[][];
  historyIndex: number;
  editingHeader: boolean;
  header: {
    title: string;
    author: string;
    contact: string;
  };
}

interface ScreenplayWithScenes extends Screenplay {
  scenes?: Scene[];
  editorState?: EditorState;
  blocks?: Block[];
}

export const useScreenplays = (projectId: string) => {
  const [screenplays, setScreenplays] = useState<Screenplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchScreenplays = async () => {
      if (!projectId) {
        setError('Project ID is required');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Fetch screenplays from the project's screenplays subcollection
        console.log(`Fetching screenplays for project: ${projectId}`);
        const screenplaysRef = collection(db, `projects/${projectId}/screenplays`);
        const querySnapshot = await getDocs(screenplaysRef);
        
        if (querySnapshot.empty) {
          console.log(`No screenplays found for project: ${projectId}`);
          setScreenplays([]);
          setLoading(false);
          return;
        }
        
        const screenplayData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Screenplay[];

        // Sort the data in memory
        screenplayData.sort((a, b) => {
          // First sort by format (Series episodes together)
          if (a.metadata?.format !== b.metadata?.format) {
            return (a.metadata?.format === 'Series') ? -1 : 1;
          }

          // For Series, sort by season and episode
          if (a.metadata?.format === 'Series') {
            const seasonA = a.metadata?.season || 0;
            const seasonB = b.metadata?.season || 0;
            if (seasonA !== seasonB) return seasonA - seasonB;
            return (a.metadata?.episode || 0) - (b.metadata?.episode || 0);
          }

          // For other formats, sort by lastModified
          return (b.lastModified?.toMillis?.() || 0) - (a.lastModified?.toMillis?.() || 0);
        });

        setScreenplays(screenplayData);
      } catch (err) {
        console.error('Error fetching screenplays:', err);
        setError('Failed to load screenplays');
      } finally {
        setLoading(false);
      }
    };

    fetchScreenplays();
  }, [projectId]);

  // Load screenplay details including scenes and blocks
  const loadScreenplayDetails = useCallback(async (screenplayId: string, userId: string = 'unknown'): Promise<ScreenplayWithScenes | null> => {
    if (!projectId) {
      setError('Project ID is required');
      return null;
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Load screenplay metadata from the project's screenplays subcollection
      const screenplayDoc = await getDoc(doc(db, `projects/${projectId}/screenplays/${screenplayId}`));
      
      if (!screenplayDoc.exists()) {
        throw new Error(`Screenplay with ID ${screenplayId} not found in project ${projectId}`);
      }
      
      const screenplayData = {
        ...screenplayDoc.data(),
        id: screenplayId
      } as ScreenplayWithScenes;
      
      // First try to load editor state if available
      try {
        const editorStateDoc = await getDoc(
          doc(db, `projects/${projectId}/screenplays/${screenplayId}/editor/state`)
        );
        
        if (editorStateDoc.exists()) {
          screenplayData.editorState = editorStateDoc.data() as EditorState;
          
          // Use blocks from editorState if available
          if (screenplayData.editorState.blocks && screenplayData.editorState.blocks.length > 0) {
            console.log(`Found ${screenplayData.editorState.blocks.length} blocks in editor state`);
            screenplayData.blocks = screenplayData.editorState.blocks;
          }
        }
      } catch (err) {
        console.warn("Could not load editor state:", err);
      }
      
      // If no blocks found in editor state, try loading from scenes
      if (!screenplayData.blocks || screenplayData.blocks.length === 0) {
        console.log("No blocks found in editor state, trying to load from scenes");
        
        // Load all scenes for this screenplay
        const scenesSnapshot = await getDocs(
          query(
            collection(db, `projects/${projectId}/screenplays/${screenplayId}/scenes`),
            orderBy('sceneNumber', 'asc')
          )
        );
        
        if (!scenesSnapshot.empty) {
          // Collect scenes data
          const scenes: Scene[] = [];
          let allBlocks: Block[] = [];
          
          scenesSnapshot.docs.forEach(sceneDoc => {
            const sceneData = sceneDoc.data() as Scene;
            const scene = {
              ...sceneData,
              id: sceneDoc.id
            };
            scenes.push(scene);
            
            // Collect blocks from sceneBlocksData
            if (sceneData.sceneBlocksData && Array.isArray(sceneData.sceneBlocksData)) {
              allBlocks = [...allBlocks, ...sceneData.sceneBlocksData];
            }
          });
          
          // Sort scenes by scene number
          scenes.sort((a, b) => a.sceneNumber - b.sceneNumber);
          screenplayData.scenes = scenes;
          
          // Sort blocks by index
          if (allBlocks.length > 0) {
            allBlocks.sort((a, b) => (a.index || 0) - (b.index || 0));
            screenplayData.blocks = allBlocks;
            console.log(`Found ${allBlocks.length} blocks in scenes`);
          }
        }
      }
      
      // Warn if no blocks found
      if (!screenplayData.blocks || screenplayData.blocks.length === 0) {
        console.warn(`No blocks found for screenplay ${screenplayId}`);
      }
      
      return screenplayData;
    } catch (err) {
      console.error(`Error loading screenplay ${screenplayId}:`, err);
      setError(`Failed to load screenplay details: ${err instanceof Error ? err.message : 'Unknown error'}`);
      
      // If we failed to load the screenplay, try to create a new one
      if (projectId && process.env.NODE_ENV === 'development') {
        try {
          console.log(`Creating new screenplay for project: ${projectId}`);
          
          // Create a new screenplay in the project's screenplays subcollection
          const screenplayRef = doc(collection(db, `projects/${projectId}/screenplays`));
          await setDoc(screenplayRef, {
            title: 'Untitled Screenplay',
            ownerId: userId || 'unknown',
            createdAt: new Date(),
            lastModified: new Date(),
            version: 1,
            collaborators: [],
            status: 'Draft',
            metadata: {
              format: 'Movie',
              author: 'Unknown',
              createdAt: new Date()
            },
            hasBlocks: false,
            blocksCount: 0,
            characters: []
          });
          
          // Try loading the screenplay again
          return await loadScreenplayDetails(screenplayRef.id);
        } catch (createErr) {
          console.error('Failed to create new screenplay:', createErr);
        }
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  return { 
    screenplays, 
    loading, 
    error, 
    loadScreenplayDetails 
  };
};
