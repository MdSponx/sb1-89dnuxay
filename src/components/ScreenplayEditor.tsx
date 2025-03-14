import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useEditorState } from '../hooks/useEditorState';
import { useBlockHandlers } from '../hooks/useBlockHandlers';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { useScreenplaySave } from '../hooks/useScreenplaySave';
import { organizeBlocksIntoPages } from '../utils/blockUtils';
import { doc, getDoc, collection, getDocs, query, orderBy, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import BlockComponent from './BlockComponent';
import FormatButtons from './ScreenplayEditor/FormatButtons';
import Page from './ScreenplayEditor/Page';
import { useHotkeys } from '../hooks/useHotkeys';
import { useDarkMode } from '../contexts/DarkModeContext';
import { useAuth } from '../contexts/AuthContext';
import ScreenplayNavigator from './ScreenplayNavigator';
import type { Block } from '../types';

const ScreenplayEditor: React.FC = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const { user } = useAuth();
  const [zoomLevel, setZoomLevel] = useState(100);
  const [documentTitle, setDocumentTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get screenplay data and blocks from location state
  const screenplayData = location.state?.screenplayData;
  const initialBlocks = location.state?.blocks || [];

  const {
    state,
    setState,
    addToHistory,
    handleUndo,
    handleRedo,
    updateBlocks,
    selectAllBlocks,
  } = useEditorState();

  const blockRefs = useRef<Record<string, HTMLDivElement | null>>({});
   // Initialize screenplay save functionality
   const {
    isSaving,
    hasChanges,
    error: saveError,
    handleSave,
    setHasChanges
  } = useScreenplaySave(projectId, user?.id || '', state.blocks, state.activeBlock);

  // Get screenplay ID from URL
  const screenplayId = searchParams.get('screenplay');

  // Function to update editor state directly
  const updateEditorState = useCallback(async () => {
    if (!projectId || !screenplayId || !user?.id) return;
    
    try {
      const editorStateRef = doc(db, `projects/${projectId}/screenplays/${screenplayId}/editor/state`);
      const editorStateSnap = await getDoc(editorStateRef);
      
      if (editorStateSnap.exists()) {
        // Update existing editor state with new blocks
        await updateDoc(editorStateRef, {
          blocks: state.blocks,
          activeBlock: state.activeBlock,
          selectedBlocks: Array.from(state.selectedBlocks),
          lastModified: new Date()
        });
        console.log(`Updated editor state for screenplay ${screenplayId} with ${state.blocks.length} blocks`);
      } else {
        // Create new editor state
        await setDoc(editorStateRef, {
          blocks: state.blocks,
          activeBlock: state.activeBlock,
          selectedBlocks: Array.from(state.selectedBlocks),
          history: [state.blocks],
          historyIndex: 0,
          editingHeader: false,
          header: state.header,
          lastModified: new Date()
        });
        console.log(`Created new editor state for screenplay ${screenplayId} with ${state.blocks.length} blocks`);
      }
    } catch (err) {
      console.error('Error updating editor state:', err);
    }
  }, [projectId, screenplayId, user?.id, state.blocks, state.activeBlock, state.selectedBlocks, state.header]);

  // Wrap handleSave to also update editor state
  const handleSaveWithEditorState = useCallback(async () => {
    try {
      // First update the editor state
      await updateEditorState();
      
      // Then call the original handleSave
      return await handleSave();
    } catch (err) {
      console.error('Error saving screenplay:', err);
      return { success: false, error: 'Failed to save screenplay' };
    }
  }, [handleSave, updateEditorState]);

  useEffect(() => {
    setHasChanges(true);
  }, [state.blocks, setHasChanges]);
  
  const {
    handleContentChange,
    handleEnterKey,
    handleKeyDown,
    handleBlockClick,
    handleBlockDoubleClick,
    handleFormatChange,
    handleMouseDown,
  } = useBlockHandlers(
    {
      blocks: state.blocks,
      activeBlock: state.activeBlock,
      textContent: state.textContent,
      selectedBlocks: state.selectedBlocks
    },
    blockRefs,
    addToHistory,
    updateBlocks,
    (blocks) => setState(prev => ({ ...prev, selectedBlocks: blocks })),
    setHasChanges
  );

  useAutoScroll(state.activeBlock, state.blocks, blockRefs);

  useHotkeys({
    handleUndo,
    handleRedo,
    selectAllBlocks,
    blocks: state.blocks,
    activeBlock: state.activeBlock,
    handleFormatChange,
  });

  // Watch for changes to mark content as unsaved
  useEffect(() => {
    setHasChanges(true);
  }, [state.blocks, setHasChanges]);

  // Initialize editor with blocks from location state if available
  useEffect(() => {
    if (initialBlocks && initialBlocks.length > 0) {
      console.log("Initializing editor with blocks from location state:", initialBlocks.length);
      setState(prev => ({
        ...prev,
        blocks: initialBlocks
      }));
      setLoading(false);
      
      // Also update the editor state in Firestore to ensure it's always up to date
      const updateEditorState = async () => {
        if (!projectId || !screenplayId || !user?.id) return;
        
        try {
          console.log(`Updating editor state in Firestore with ${initialBlocks.length} blocks`);
          const editorStateRef = doc(db, `projects/${projectId}/screenplays/${screenplayId}/editor/state`);
          await setDoc(editorStateRef, {
            blocks: initialBlocks,
            activeBlock: initialBlocks.length > 0 ? initialBlocks[0].id : null,
            selectedBlocks: [],
            history: [initialBlocks],
            historyIndex: 0,
            editingHeader: false,
            header: { title: '', author: '', contact: '' },
            lastModified: new Date()
          }, { merge: true });
          console.log("Editor state updated in Firestore");
        } catch (err) {
          console.error('Error updating editor state in Firestore:', err);
        }
      };
      
      updateEditorState();
      return;
    }

    // Fallback to fetching from database if no blocks in location state
    const fetchScreenplayData = async () => {
      const screenplayId = searchParams.get('screenplay');
      if (!screenplayId) return;

      try {
        setLoading(true);
        setError(null);

        // First try to load from editor state
        try {
          if (projectId) {
            console.log(`Trying to load editor state for screenplay ${screenplayId} in project ${projectId}`);
            const editorStateRef = doc(db, `projects/${projectId}/screenplays/${screenplayId}/editor/state`);
            const editorStateSnap = await getDoc(editorStateRef);
            
            if (editorStateSnap.exists() && editorStateSnap.data().blocks && editorStateSnap.data().blocks.length > 0) {
              const editorState = editorStateSnap.data();
              console.log(`Found editor state with ${editorState.blocks.length} blocks`);
              
              // Get screenplay metadata
              const screenplayRef = doc(db, `projects/${projectId}/screenplays/${screenplayId}`);
              const screenplaySnap = await getDoc(screenplayRef);
              
              if (screenplaySnap.exists()) {
                const screenplayData = screenplaySnap.data();
                setDocumentTitle(screenplayData.title || 'Untitled Screenplay');
                
                // Set blocks from editor state
                setState(prev => ({
                  ...prev,
                  blocks: editorState.blocks,
                  activeBlock: editorState.activeBlock || null,
                  selectedBlocks: new Set(editorState.selectedBlocks || []),
                  header: editorState.header || { title: '', author: '', contact: '' },
                  editingHeader: editorState.editingHeader || false
                }));
                
                setLoading(false);
                return;
              }
            }
          }
        } catch (err) {
          console.error('Error loading from editor state:', err);
        }
        
        // Fallback to loading from scenes if editor state not available
        try {
          if (!projectId) {
            setError('Project ID is required to load screenplay');
            return;
          }
          
          console.log(`Falling back to loading scenes for screenplay ${screenplayId} in project ${projectId}`);
          
          // Fetch screenplay metadata
          const screenplayRef = doc(db, `projects/${projectId}/screenplays/${screenplayId}`);
          const screenplaySnap = await getDoc(screenplayRef);
          
          if (!screenplaySnap.exists()) {
            setError('Screenplay not found');
            return;
          }
          
          const screenplayData = screenplaySnap.data();
          setDocumentTitle(screenplayData.title || 'Untitled Screenplay');
          
          // Fetch scenes and their content
          const scenesRef = collection(db, `projects/${projectId}/screenplays/${screenplayId}/scenes`);
          const scenesQuery = query(scenesRef, orderBy('sceneNumber', 'asc'));
          const scenesSnap = await getDocs(scenesQuery);
          
          let allBlocks: Block[] = [];
          
          // Process each scene sequentially to maintain order
          for (const sceneDoc of scenesSnap.docs) {
            const sceneData = sceneDoc.data();
            
            // Add scene heading block
            allBlocks.push({
              id: `${sceneDoc.id}-heading`,
              type: 'scene-heading',
              content: sceneData.sceneHeading,
              number: sceneData.sceneNumber
            });
            
            // Get scene content
            const contentRef = doc(collection(db, `projects/${projectId}/screenplays/${screenplayId}/scenes/${sceneDoc.id}/content`), 'main');
            const contentSnap = await getDoc(contentRef);
            
            if (contentSnap.exists()) {
              const content = contentSnap.data();
              
              // Add action blocks
              if (content.action) {
                allBlocks.push({
                  id: `${sceneDoc.id}-action`,
                  type: 'action',
                  content: content.action
                });
              }
              
              // Add dialogue blocks
              content.dialogues?.forEach((dialogue: any, index: number) => {
                // Character
                allBlocks.push({
                  id: `${sceneDoc.id}-character-${index}`,
                  type: 'character',
                  content: dialogue.characterName
                });
                
                // Parenthetical (if exists)
                if (dialogue.parenthetical) {
                  allBlocks.push({
                    id: `${sceneDoc.id}-parenthetical-${index}`,
                    type: 'parenthetical',
                    content: dialogue.parenthetical
                  });
                }
                
                // Dialogue text
                allBlocks.push({
                  id: `${sceneDoc.id}-dialogue-${index}`,
                  type: 'dialogue',
                  content: dialogue.text,
                  number: index + 1
                });
              });
            }
          }
          
          setState(prev => ({
            ...prev,
            blocks: allBlocks
          }));
        } catch (err) {
          console.error('Error loading from scenes:', err);
          setError('Failed to load screenplay scenes');
        }

      } catch (err) {
        console.error('Error fetching screenplay data:', err);
        setError('Failed to load screenplay data');
      } finally {
        setLoading(false);
      }
    };

    fetchScreenplayData();
  }, [searchParams, setState, initialBlocks, projectId, screenplayId, user?.id]);

  // Set document title from screenplay data
  useEffect(() => {
    if (screenplayData?.title) {
      setDocumentTitle(screenplayData.title);
    }
  }, [screenplayData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F2] dark:bg-gray-800">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#E86F2C] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-[#577B92] dark:text-gray-400">Loading screenplay...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F2] dark:bg-gray-800">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 text-lg mb-4">{error}</p>
          <button 
            onClick={() => navigate(-1)}
            className="text-[#577B92] dark:text-gray-400 hover:text-[#1E4D3A] dark:hover:text-white"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const pages = organizeBlocksIntoPages(state.blocks);

  return (
    <div className="flex flex-col min-h-screen">
      <ScreenplayNavigator
        projectId={projectId}
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
        zoomLevel={zoomLevel}
        setZoomLevel={setZoomLevel}
        documentTitle={documentTitle}
        setDocumentTitle={setDocumentTitle}
        onSave={handleSaveWithEditorState}
        isSaving={isSaving}
        hasChanges={hasChanges}
      />

      <div className="flex-1 overflow-auto screenplay-content relative user-select-text mt-28" data-screenplay-editor="true">
        <div 
          className="max-w-[210mm] mx-auto my-8 screenplay-pages pb-24"
          style={{
            transform: `scale(${zoomLevel / 100})`,
            transformOrigin: 'top center'
          }}
          data-screenplay-pages="true"
        >
          <div className={`rounded-lg shadow-lg ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className={`transition-colors duration-200 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
              <div className="relative user-select-text">
                {pages.map((pageBlocks, pageIndex) => (
                  <Page
                    key={pageIndex}
                    pageIndex={pageIndex}
                    blocks={pageBlocks}
                    isDarkMode={isDarkMode}
                    header={state.header}
                    editingHeader={state.editingHeader}
                    onHeaderChange={(header) => setState(prev => ({ ...prev, header }))}
                    onEditingHeaderChange={(editingHeader) => setState(prev => ({ ...prev, editingHeader }))}
                    onContentChange={handleContentChange}
                    onKeyDown={handleKeyDown}
                    onBlockFocus={(id) => setState(prev => ({ ...prev, activeBlock: id }))}
                    onBlockClick={handleBlockClick}
                    onBlockDoubleClick={handleBlockDoubleClick}
                    onBlockMouseDown={handleMouseDown}
                    selectedBlocks={state.selectedBlocks}
                    activeBlock={state.activeBlock}
                    blockRefs={blockRefs}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        <FormatButtons
          isDarkMode={isDarkMode}
          activeBlock={state.activeBlock}
          onFormatChange={handleFormatChange}
          blocks={state.blocks}
          className="format-buttons"
        />
      </div>

      {/* Save Error Toast */}
      {saveError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg">
          {saveError}
        </div>
      )}
    </div>
  );
};

export default ScreenplayEditor;
