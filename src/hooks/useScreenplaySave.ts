import { useState, useCallback, useEffect, useRef } from 'react';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  serverTimestamp, 
  writeBatch,
  Timestamp,
  addDoc,
  updateDoc,
  increment
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { ScreenplaySaveManager } from '../lib/screenplay/saveManager';
import type { Block } from '../types';
import type { Screenplay } from '../types/screenplay';
import type { SaveResult } from '../types/screenplay';

export const useScreenplaySave = (
  projectId: string | undefined,
  userId: string,
  blocks: Block[],
  activeBlock: string | null
) => {
  // Reference to the save manager
  const saveManagerRef = useRef<ScreenplaySaveManager | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedVersion, setLastLoadedVersion] = useState<Timestamp | null>(null);
  const [screenplayId, setScreenplayId] = useState<string | undefined>(undefined);

  // Validate required parameters
  useEffect(() => {
    if (!projectId) {
      setError('Project ID is required');
      return;
    }

    if (!userId) {
      setError('User ID is required');
      return;
    }

    // Clear error if both are present
    setError(null);
  }, [projectId, userId]);

  // Fetch the current screenplay version when component mounts and initialize save manager
  useEffect(() => {
    const fetchScreenplayData = async () => {
      if (!projectId || !userId) {
        console.warn('Project ID or User ID not available');
        return;
      }
      
      try {
        // Check URL for screenplay ID first
        const urlParams = new URLSearchParams(window.location.search);
        const urlScreenplayIdParam = urlParams.get('screenplay');
        
        // If we have a screenplay ID in the URL, use it directly
        if (urlScreenplayIdParam) {
          const urlScreenplayId = urlScreenplayIdParam; // Convert to non-null string
          console.log('Found screenplay ID in URL:', urlScreenplayId);
          
          // Get the screenplay data
          const screenplayRef = doc(db, `projects/${projectId}/screenplays`, urlScreenplayId);
          const screenplaySnap = await getDoc(screenplayRef);
          
          if (screenplaySnap.exists()) {
            setScreenplayId(urlScreenplayId);
            setLastLoadedVersion(screenplaySnap.data().version);
            
            // Initialize the save manager with the screenplay data
            const screenplayData = screenplaySnap.data() as Screenplay;
            screenplayData.id = urlScreenplayId; // Ensure ID is set
            
            // Create a new save manager instance
            saveManagerRef.current = new ScreenplaySaveManager(screenplayData, userId);
            console.log('Save manager initialized for screenplay from URL:', urlScreenplayId);
            return;
          }
        }
        
        // If no screenplay ID in URL or it doesn't exist, get the active screenplay for this project
        const screenplayQuery = query(
          collection(db, `projects/${projectId}/screenplays`)
        );
        
        const screenplaySnap = await getDocs(screenplayQuery);
        
        if (!screenplaySnap.empty) {
          // Get the most recently modified screenplay
          const latestScreenplay = screenplaySnap.docs.reduce((latest, current) => {
            const currentModified = current.data().lastModified?.toMillis() || 0;
            const latestModified = latest.data().lastModified?.toMillis() || 0;
            return currentModified > latestModified ? current : latest;
          }, screenplaySnap.docs[0]);

          const screenplayId = latestScreenplay.id;
          setScreenplayId(screenplayId);
          setLastLoadedVersion(latestScreenplay.data().version);
          
          // Initialize the save manager with the screenplay data
          const screenplayData = latestScreenplay.data() as Screenplay;
          screenplayData.id = screenplayId; // Ensure ID is set
          
          // Create a new save manager instance
          saveManagerRef.current = new ScreenplaySaveManager(screenplayData, userId);
          console.log('Save manager initialized for screenplay from project:', screenplayId);
        } else {
          console.warn('No screenplay found for this project');
          
          // In development, create a default screenplay
          if (process.env.NODE_ENV === 'development') {
            // Always use the project ID to create a consistent screenplay ID
            // This ensures we always save to and load from the same screenplay
            const defaultScreenplayId = projectId;
            setScreenplayId(defaultScreenplayId);
            
            // Create a default screenplay data object with all required properties
            // Ensure projectId is explicitly set and will be used for saving
            const defaultScreenplayData: Screenplay = {
              id: defaultScreenplayId,
              title: 'Default Screenplay',
              projectId: projectId,
              lastModified: Timestamp.now(),
              version: 1,
              collaborators: [userId],
              status: 'Draft',
              metadata: {
                format: 'Movie',
                author: userId,
                createdAt: Timestamp.now(),
              }
            };
            
            // Log the screenplay data to verify projectId is set
            console.log('Created default screenplay with projectId:', projectId);
            
            // Create a new save manager instance with the default screenplay
            saveManagerRef.current = new ScreenplaySaveManager(defaultScreenplayData, userId);
            console.log('Created default screenplay for development using project ID:', defaultScreenplayId);
          } else {
            setError('No screenplay found for this project');
          }
        }
      } catch (err) {
        console.error('Error fetching screenplay data:', err);
        setError('Failed to load screenplay data');
      }
    };
    
    fetchScreenplayData();
    
    // Cleanup save manager on unmount
    return () => {
      if (saveManagerRef.current) {
        saveManagerRef.current.cleanup();
        saveManagerRef.current = null;
      }
    };
  }, [projectId, userId]);

  // Extract unique characters from blocks
  const extractCharacters = useCallback((blocks: Block[]) => {
    const characters = new Set<string>();
    
    blocks.forEach(block => {
      if (block.type === 'character') {
        characters.add(block.content.trim());
      }
    });
    
    return Array.from(characters);
  }, []);

  // Save characters to project
  const saveCharacters = useCallback(async (projectId: string, characters: string[]) => {
    if (!userId) return;

    try {
      // Get existing characters
      const charactersRef = collection(db, 'projects', projectId, 'characters');
      const charactersSnap = await getDocs(charactersRef);
      
      const existingCharacters = new Map<string, string>();
      charactersSnap.docs.forEach(doc => {
        existingCharacters.set(doc.data().name.toLowerCase(), doc.id);
      });
      
      const batch = writeBatch(db);
      
      // Add new characters
      for (const character of characters) {
        if (!existingCharacters.has(character.toLowerCase())) {
          const newCharRef = doc(collection(db, 'projects', projectId, 'characters'));
          batch.set(newCharRef, {
            name: character,
            created_at: serverTimestamp(),
            created_by: userId,
            updated_at: serverTimestamp()
          });
        }
      }
      
      await batch.commit();
    } catch (err) {
      console.error('Error saving characters:', err);
    }
  }, [userId]);

  const getProjectIdFromScreenplay = useCallback(async (screenplayId: string) => {
    try {
      // First try to extract project ID from the URL
      const urlParams = new URLSearchParams(window.location.search);
      const urlProjectId = urlParams.get('project');
      if (urlProjectId) {
        console.log('Found project ID in URL:', urlProjectId);
        return urlProjectId;
      }
      
      // If not in URL, try to find the screenplay in all projects
      // This is a fallback and less efficient approach
      const projectsRef = collection(db, 'projects');
      const projectsSnap = await getDocs(projectsRef);
      
      for (const projectDoc of projectsSnap.docs) {
        const projectId = projectDoc.id;
        const screenplayRef = doc(db, `projects/${projectId}/screenplays`, screenplayId);
        const screenplaySnap = await getDoc(screenplayRef);
        
        if (screenplaySnap.exists()) {
          console.log(`Found screenplay ${screenplayId} in project ${projectId}`);
          return projectId;
        }
      }
      
      console.warn(`Could not find project ID for screenplay ${screenplayId}`);
      return null;
    } catch (err) {
      console.error('Error fetching screenplay data:', err);
      return null;
    }
  }, []);

  const handleSave = useCallback(async (): Promise<SaveResult> => {
    // Check for conflict resolution strategy in URL
    const url = new URL(window.location.href);
    const conflictResolution = url.searchParams.get('conflict_resolution');
    
    // Get projectId using multiple strategies
    let effectiveProjectId = projectId;
    
    if (!effectiveProjectId) {
      // Strategy 1: Try to find projectId in blocks metadata (if it exists)
      const projectBlock = blocks.find(b => b.type === 'scene-heading' && (b as any).metadata?.projectId);
      if (projectBlock && (projectBlock as any).metadata?.projectId) {
        effectiveProjectId = (projectBlock as any).metadata.projectId;
        console.log('Found projectId in blocks metadata:', effectiveProjectId);
      } else {
        // Strategy 2: Try to get projectId from DOM if it's displayed
        const projectIdField = document.querySelector('[data-field="projectId"]')?.textContent;
        if (projectIdField && projectIdField.trim()) {
          effectiveProjectId = projectIdField.trim();
          console.log('Found projectId in DOM:', effectiveProjectId);
        } else {
          // Strategy 3: Check URL parameters (?project=123)
          const urlParams = new URLSearchParams(window.location.search);
          const urlProjectIdParam = urlParams.get('project');
          const urlProjectId = urlProjectIdParam || undefined;
          
          // Strategy 4: Check URL path for project patterns
          const pathMatch = window.location.pathname.match(/\/projects\/([^\/]+)/);
          let pathProjectId: string | undefined = undefined;
          
          if (pathMatch) {
            pathProjectId = pathMatch[1];
            console.log('Found projectId in URL path:', pathProjectId);
          }
          
          // Use the first available projectId from our various sources
          effectiveProjectId = urlProjectId || pathProjectId || undefined;
        }
      }
    }

    // If we still don't have a projectId, use a default one for development
    if (!effectiveProjectId && process.env.NODE_ENV === 'development') {
      effectiveProjectId = 'default-project-id';
      console.log('Using default project ID for development:', effectiveProjectId);
    }

    // Use the project ID as the screenplay ID if none is available
    let effectiveScreenplayId = screenplayId;
    if (!effectiveScreenplayId && effectiveProjectId) {
      effectiveScreenplayId = effectiveProjectId;
      console.log('Using project ID as screenplay ID:', effectiveScreenplayId);
    }

    console.log({
      url: window.location.href,
      originalProjectId: projectId,
      screenplayId,
      effectiveProjectId,
      effectiveScreenplayId
    });

    // Validate required parameters
    if (!effectiveProjectId) {
      return { success: false, error: 'Project ID is not available' };
    }

    if (!userId) {
      return { success: false, error: 'User ID is not available' };
    }

    if (!effectiveScreenplayId) {
      return { success: false, error: 'No active screenplay found' };
    }

    setIsSaving(true);
    setError(null);

    try {
      // If we have a save manager, use it for advanced save functionality
      if (saveManagerRef.current) {
        console.log('Using save manager to save screenplay with ID:', effectiveScreenplayId);
        console.log('Screenplay projectId:', saveManagerRef.current.getProjectId());
        
        // Ensure the screenplay has the correct projectId before saving
        saveManagerRef.current.updateProjectId(effectiveProjectId);
        
        // Pass conflict resolution strategy if available
        const result = await saveManagerRef.current.saveScreenplay(
          conflictResolution as 'overwrite' | 'merge' | undefined
        );
        
        if (result.success) {
          setHasChanges(false);
        } else {
          setError(result.error || 'Failed to save screenplay');
        }
        
        return result;
      }
      
      // Fallback to the original save implementation if save manager is not available
      console.log('Save manager not available, using fallback save method');
      
      // Check for version conflicts (skip if we're resolving conflicts)
      const screenplayRef = doc(db, `projects/${effectiveProjectId}/screenplays/${effectiveScreenplayId}`);
      const screenplaySnap = await getDoc(screenplayRef);
      
      if (screenplaySnap.exists()) {
        const screenplayData = screenplaySnap.data();
        const currentVersion = screenplayData?.version;
        
        // If the document was modified since we loaded it and we're not resolving conflicts
        if (!conflictResolution && 
            lastLoadedVersion && 
            currentVersion && 
            currentVersion.toMillis && 
            lastLoadedVersion.toMillis && 
            currentVersion.toMillis() > lastLoadedVersion.toMillis()) {
          return {
            success: false,
            conflicts: [{
              sceneId: effectiveScreenplayId,
              userEmail: 'another-user@example.com',
              timestamp: currentVersion
            }]
          };
        }
      }

      const batch = writeBatch(db);
      
      // Extract all characters and save them to the project
      const characters = extractCharacters(blocks);
      await saveCharacters(effectiveProjectId, characters);

      // Group blocks by scene
      const scenes = new Map<number, Block[]>();
      let currentSceneNumber = 0;
      let currentSceneId = '';
      let currentSceneBlocks: Block[] = [];

      // Make sure blocks is an array and not undefined
      const blocksToProcess = Array.isArray(blocks) ? blocks : [];

      blocksToProcess.forEach(block => {
        if (block.type === 'scene-heading') {
          if (currentSceneBlocks.length > 0) {
            scenes.set(currentSceneNumber, currentSceneBlocks);
          }
          currentSceneNumber = block.number || 0;
          // Extract scene ID from block ID if available (format: sceneId-heading)
          const match = block.id.match(/^(.*)-heading$/);
          currentSceneId = match ? match[1] : '';
          currentSceneBlocks = [block];
        } else {
          currentSceneBlocks.push(block);
        }
      });

      // Add the last scene
      if (currentSceneBlocks.length > 0) {
        scenes.set(currentSceneNumber, currentSceneBlocks);
      }

      // Keep track of all scenes for metadata update
      const savedScenes = new Set<string>();

      // Process each scene
      for (const [sceneNumber, sceneBlocks] of scenes) {
        const sceneHeading = sceneBlocks.find(b => b.type === 'scene-heading');
        if (!sceneHeading) continue;

        // Determine if we're updating an existing scene or creating a new one
        let sceneRef;
        let isNewScene = false;

        if (sceneHeading.id.includes('-heading') && !sceneHeading.id.startsWith('temp-')) {
          // Extract scene ID from the heading block ID
          const match = sceneHeading.id.match(/^(.*)-heading$/);
          if (match && match[1]) {
            sceneRef = doc(db, `projects/${effectiveProjectId}/screenplays/${effectiveScreenplayId}/scenes`, match[1]);
          } else {
            sceneRef = doc(collection(db, `projects/${effectiveProjectId}/screenplays/${effectiveScreenplayId}/scenes`));
            isNewScene = true;
          }
        } else {
          sceneRef = doc(collection(db, `projects/${effectiveProjectId}/screenplays/${effectiveScreenplayId}/scenes`));
          isNewScene = true;
        }

        savedScenes.add(sceneRef.id);
        
        // Prepare scene content
        const actionBlocks: { content: string, blockId: string }[] = [];
        const dialogueSequences: Array<{
          characterName: string;
          characterBlockId: string;
          text: string;
          dialogueBlockId: string;
          parenthetical?: string;
          parentheticalBlockId?: string;
        }> = [];

        let currentCharacter = '';
        let currentCharacterBlockId = '';
        let currentParenthetical = '';
        let currentParentheticalBlockId = '';

        sceneBlocks.forEach(block => {
          switch (block.type) {
            case 'action':
              actionBlocks.push({ 
                content: block.content,
                blockId: block.id
              });
              break;
            case 'character':
              currentCharacter = block.content;
              currentCharacterBlockId = block.id;
              currentParenthetical = '';
              currentParentheticalBlockId = '';
              break;
            case 'parenthetical':
              currentParenthetical = block.content;
              currentParentheticalBlockId = block.id;
              break;
            case 'dialogue':
              if (currentCharacter) {
                dialogueSequences.push({
                  characterName: currentCharacter,
                  characterBlockId: currentCharacterBlockId,
                  text: block.content,
                  dialogueBlockId: block.id,
                  ...(currentParenthetical && { 
                    parenthetical: currentParenthetical,
                    parentheticalBlockId: currentParentheticalBlockId 
                  })
                });
                currentParenthetical = '';
                currentParentheticalBlockId = '';
              }
              break;
          }
        });

        // Set scene metadata
        batch.set(sceneRef, {
          sceneNumber,
          sceneHeading: sceneHeading.content,
          headingBlockId: sceneHeading.id,
          status: 'Draft',
          lastModified: serverTimestamp(),
          modifiedBy: userId,
          created_at: isNewScene ? serverTimestamp() : screenplaySnap?.data()?.created_at || serverTimestamp(),
          created_by: isNewScene ? userId : screenplaySnap?.data()?.created_by || userId,
        });

        // Set scene content
        const contentRef = doc(collection(db, `projects/${effectiveProjectId}/screenplays/${effectiveScreenplayId}/scenes/${sceneRef.id}/content`), 'main');
        batch.set(contentRef, {
          actionBlocks,
          dialogueSequences,
          lastModified: serverTimestamp(),
          modifiedBy: userId
        });
      }

      // If screenplay doesn't exist, create it
      if (!screenplaySnap.exists()) {
        batch.set(screenplayRef, {
          title: 'Untitled Screenplay',
          ownerId: userId,
          createdAt: serverTimestamp(),
          lastModified: serverTimestamp(),
          version: serverTimestamp(),
          collaborators: [userId],
          status: 'Draft',
          metadata: {
            format: 'Movie',
            author: 'Unknown',
            createdAt: serverTimestamp()
          },
          hasBlocks: true,
          blocksCount: blocksToProcess.length,
          characters: [],
          scenes: savedScenes.size
        });
      } else {
        // Update screenplay metadata
        batch.update(screenplayRef, {
          lastModified: serverTimestamp(),
          version: serverTimestamp(),
          hasBlocks: true,
          blocksCount: blocksToProcess.length,
          scenes: savedScenes.size
        });
      }

      // Update project metadata
      const projectRef = doc(db, 'projects', effectiveProjectId);
      const projectSnap = await getDoc(projectRef);
      
      if (projectSnap.exists()) {
        batch.update(projectRef, {
          updated_at: serverTimestamp()
        });
      } else {
        // Create project if it doesn't exist (for development)
        batch.set(projectRef, {
          title: 'Default Project',
          created_at: serverTimestamp(),
          created_by: userId,
          updated_at: serverTimestamp()
        });
      }

      // Update editor state with the latest blocks
      try {
        const editorStateRef = doc(db, `projects/${effectiveProjectId}/screenplays/${effectiveScreenplayId}/editor/state`);
        const editorStateSnap = await getDoc(editorStateRef);
        
        if (editorStateSnap.exists()) {
          // Update existing editor state with new blocks
          const editorState = editorStateSnap.data();
          batch.update(editorStateRef, {
            blocks: blocksToProcess,
            lastModified: serverTimestamp()
          });
        } else {
          // Create new editor state
          batch.set(editorStateRef, {
            blocks: blocksToProcess,
            activeBlock: blocksToProcess.length > 0 ? blocksToProcess[0].id : null,
            selectedBlocks: [],
            history: [blocksToProcess],
            historyIndex: 0,
            editingHeader: false,
            header: { title: '', author: '', contact: '' },
            lastModified: serverTimestamp()
          });
        }
      } catch (err) {
        console.error('Error updating editor state:', err);
      }

      // Commit all changes
      await batch.commit();

      // Update last loaded version
      const updatedScreenplaySnap = await getDoc(screenplayRef);
      if (updatedScreenplaySnap.exists()) {
        setLastLoadedVersion(updatedScreenplaySnap.data().version);
      }

      setHasChanges(false);
      return { success: true };
    } catch (err) {
      console.error('Error saving screenplay:', err);
      const errorMessage = 'Failed to save screenplay';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setIsSaving(false);
    }
  }, [projectId, userId, screenplayId, blocks, lastLoadedVersion, extractCharacters, saveCharacters]);

  return {
    isSaving,
    hasChanges,
    error,
    handleSave,
    setHasChanges
  };
};
