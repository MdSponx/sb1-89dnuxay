import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, FileText, ArrowLeft, UserPlus, AlertCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDarkMode } from '../../contexts/DarkModeContext';
import { doc, getDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import ProjectSidebar from '../../components/Projects/ProjectSidebar';
import ScreenplayList from '../../components/screenplay/ScreenplayList';
import CreateScreenplayDialog from '../../components/screenplay/CreateScreenplayDialog';
import { useScreenplays } from '../../hooks/useScreenplays';
import type { Project } from '../../types/project';
import type { Screenplay } from '../../types/screenplay';

const Writing: React.FC = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDarkMode } = useDarkMode();

  const [activeTab, setActiveTab] = useState('screenplay-files');
  const [project, setProject] = useState<Project | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { screenplays, loading, error, loadScreenplayDetails } = useScreenplays(projectId || '');
  const [loadingScreenplayId, setLoadingScreenplayId] = useState<string | null>(null);

  // Simplified and more robust screenplay click handler
  const handleScreenplayClick = async (screenplayId: string) => {
    if (!projectId) {
      console.error('Project ID is missing');
      alert('Project ID is required to load screenplay');
      return;
    }
    
    try {
      setLoadingScreenplayId(screenplayId);
      console.log(`Loading screenplay ${screenplayId} for project ${projectId}`);
      
      // Get screenplay metadata first
      const screenplayRef = doc(db, `projects/${projectId}/screenplays/${screenplayId}`);
      const screenplaySnap = await getDoc(screenplayRef);
      
      if (!screenplaySnap.exists()) {
        console.error(`Screenplay ${screenplayId} not found in project ${projectId}`);
        alert('Screenplay not found. It may have been deleted.');
        setLoadingScreenplayId(null);
        return;
      }
      
      const screenplayData = {
        ...screenplaySnap.data(),
        id: screenplayId
      };
      
      // Try to get blocks from editor state first (most reliable source)
      let blocks = [];
      try {
        const editorStateRef = doc(db, `projects/${projectId}/screenplays/${screenplayId}/editor/state`);
        const editorStateSnap = await getDoc(editorStateRef);
        
        if (editorStateSnap.exists() && editorStateSnap.data().blocks && editorStateSnap.data().blocks.length > 0) {
          blocks = editorStateSnap.data().blocks;
          console.log(`Found ${blocks.length} blocks in editor state for screenplay ${screenplayId}`);
        }
      } catch (err) {
        console.error('Error loading editor state:', err);
      }
      
      // If no blocks in editor state, try to reconstruct from scenes
      if (!blocks || blocks.length === 0) {
        console.log(`No blocks found in editor state, trying to reconstruct from scenes`);
        blocks = await reconstructBlocksFromScenes(projectId, screenplayId);
        console.log(`Reconstructed ${blocks.length} blocks from scenes`);
      }
      
      // If still no blocks, create default blocks
      if (!blocks || blocks.length === 0) {
        console.log(`No blocks found, creating default blocks`);
        blocks = [
          {
            id: `default-scene-heading-${Date.now()}`,
            type: 'scene-heading',
            content: 'INT. LOCATION - DAY',
            number: 1
          },
          {
            id: `default-action-${Date.now()}`,
            type: 'action',
            content: 'Write your scene description here.'
          }
        ];
      }
      
      // Navigate to editor with screenplay data and blocks
      console.log(`Navigating to editor with ${blocks.length} blocks`);
      navigate(`/editor?project=${projectId}&screenplay=${screenplayId}`, {
        state: {
          screenplayData: screenplayData,
          blocks: blocks
        }
      });
    } catch (err) {
      console.error('Error in handleScreenplayClick:', err);
      alert('An error occurred while loading the screenplay. Please try again.');
    } finally {
      setLoadingScreenplayId(null);
    }
  };
  
  // Helper function to reconstruct blocks from scenes
  const reconstructBlocksFromScenes = async (projectId: string, screenplayId: string) => {
    try {
      const scenesRef = collection(db, `projects/${projectId}/screenplays/${screenplayId}/scenes`);
      const scenesQuery = query(scenesRef, orderBy('sceneNumber', 'asc'));
      const scenesSnap = await getDocs(scenesQuery);
      
      if (scenesSnap.empty) {
        console.log('No scenes found');
        return [];
      }
      
      let allBlocks = [];
      
      // Process each scene sequentially to maintain order
      for (const sceneDoc of scenesSnap.docs) {
        const sceneData = sceneDoc.data();
        
        // Add scene heading block
        allBlocks.push({
          id: `${sceneDoc.id}-heading`,
          type: 'scene-heading',
          content: sceneData.sceneHeading || 'INT. LOCATION - DAY',
          number: sceneData.sceneNumber || allBlocks.length + 1
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
          } else if (content.actionBlocks && Array.isArray(content.actionBlocks)) {
            // Handle action blocks array format
            content.actionBlocks.forEach((actionBlock, index) => {
              allBlocks.push({
                id: actionBlock.blockId || `${sceneDoc.id}-action-${index}`,
                type: 'action',
                content: actionBlock.content || ''
              });
            });
          }
          
          // Add dialogue blocks
          if (content.dialogues && Array.isArray(content.dialogues)) {
            content.dialogues.forEach((dialogue, index) => {
              // Character
              allBlocks.push({
                id: dialogue.characterBlockId || `${sceneDoc.id}-character-${index}`,
                type: 'character',
                content: dialogue.characterName || 'CHARACTER'
              });
              
              // Parenthetical (if exists)
              if (dialogue.parenthetical) {
                allBlocks.push({
                  id: dialogue.parentheticalBlockId || `${sceneDoc.id}-parenthetical-${index}`,
                  type: 'parenthetical',
                  content: dialogue.parenthetical
                });
              }
              
              // Dialogue text
              allBlocks.push({
                id: dialogue.dialogueBlockId || `${sceneDoc.id}-dialogue-${index}`,
                type: 'dialogue',
                content: dialogue.text || '',
                number: index + 1
              });
            });
          }
        }
      }
      
      return allBlocks;
    } catch (err) {
      console.error('Error reconstructing blocks from scenes:', err);
      return [];
    }
  };

  useEffect(() => {
    const fetchProjectData = async () => {
      if (!projectId) return;

      try {
        const projectRef = doc(db, 'projects', projectId);
        const projectSnap = await getDoc(projectRef);

        if (projectSnap.exists()) {
          const projectData = projectSnap.data() as Project;
          setProject({ ...projectData, id: projectSnap.id });
        }
      } catch (err) {
        console.error('Error fetching project data:', err);
      }
    };

    fetchProjectData();
  }, [projectId]);

  // Log component state for debugging
  console.log('Writing component state:', {
    projectId,
    project,
    activeTab,
    screenplaysCount: screenplays?.length || 0,
    loading,
    error
  });

  if (!projectId) {
    console.error('Writing: No project ID provided');
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F2] dark:bg-gray-800">
        <div className="text-center">
          <div className="w-16 h-16 text-red-500 mb-4">
            <AlertCircle size={64} className="mx-auto" />
          </div>
          <p className="text-red-600 dark:text-red-400 text-lg mb-4">Missing project ID</p>
          <button 
            onClick={() => navigate('/projects')}
            className="px-4 py-2 bg-[#1E4D3A] text-white rounded-lg hover:bg-[#1E4D3A]/90"
          >
            Go to Projects
          </button>
        </div>
      </div>
    );
  }

  if (loading && !project) {
    console.log('Writing: Showing loading state for project data');
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F2] dark:bg-gray-800">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#E86F2C] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-[#577B92] dark:text-gray-400">Loading project data...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    console.error('Writing: Project data not found');
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F2] dark:bg-gray-800">
        <div className="text-center">
          <div className="w-16 h-16 text-red-500 mb-4">
            <AlertCircle size={64} className="mx-auto" />
          </div>
          <p className="text-red-600 dark:text-red-400 text-lg mb-4">Project not found</p>
          <button 
            onClick={() => navigate('/projects')}
            className="px-4 py-2 bg-[#1E4D3A] text-white rounded-lg hover:bg-[#1E4D3A]/90"
          >
            Go to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F5F5F2] dark:bg-gray-800">
      <ProjectSidebar
        project={project}
        activeModule="writing"
        onModuleChange={() => {}}
      />

      <div className="flex-1 overflow-auto">
        {/* Header */}
        <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Back Button and Title */}
            <div className="h-16 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => navigate(`/projects/${projectId}`)}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  <ArrowLeft
                    size={20}
                    className="text-[#577B92] dark:text-gray-400"
                  />
                </button>
                <h2 className="text-lg font-semibold text-[#1E4D3A] dark:text-white">
                  Writing
                </h2>
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex -space-x-2">
                  {project.collaborators.slice(0, 3).map((collaborator, index) => (
                    <div
                      key={collaborator.id}
                      className={`w-8 h-8 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-900 ${
                        ['bg-blue-500', 'bg-purple-500', 'bg-green-500'][index]
                      } text-white`}
                    >
                      {collaborator.email.charAt(0).toUpperCase()}
                    </div>
                  ))}
                  {project.collaborators.length > 3 && (
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center border-2 border-white dark:border-gray-900">
                      +{project.collaborators.length - 3}
                    </div>
                  )}
                </div>
                <button className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#2563eb] via-[#9333ea] to-[#db2777] text-white font-medium hover:opacity-90 transition-opacity flex items-center">
                  <UserPlus size={18} className="mr-2" />
                  Invite
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
              <div className="flex -mb-px">
                <button
                  onClick={() => setActiveTab('drafting-board')}
                  className={`py-4 px-6 border-b-2 font-medium text-sm ${
                    activeTab === 'drafting-board'
                      ? 'border-[#E86F2C] text-[#E86F2C]'
                      : 'border-transparent text-[#577B92] dark:text-gray-400 hover:text-[#1E4D3A] dark:hover:text-white'
                  }`}
                >
                  Drafting Board
                </button>
                <button
                  onClick={() => setActiveTab('screenplay-files')}
                  className={`py-4 px-6 border-b-2 font-medium text-sm ${
                    activeTab === 'screenplay-files'
                      ? 'border-[#E86F2C] text-[#E86F2C]'
                      : 'border-transparent text-[#577B92] dark:text-gray-400 hover:text-[#1E4D3A] dark:hover:text-white'
                  }`}
                >
                  Screenplay Files
                </button>
                <button
                  onClick={() => setActiveTab('document-library')}
                  className={`py-4 px-6 border-b-2 font-medium text-sm ${
                    activeTab === 'document-library'
                      ? 'border-[#E86F2C] text-[#E86F2C]'
                      : 'border-transparent text-[#577B92] dark:text-gray-400 hover:text-[#1E4D3A] dark:hover:text-white'
                  }`}
                >
                  Document Library
                </button>
              </div>
              <div className="flex items-center">
                <span
                  className={`px-3 py-1 rounded-full text-sm ${
                    isDarkMode
                      ? 'bg-gray-800 text-gray-300'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  Type:{' '}
                  {project.type === 'Series'
                    ? `Series (${project.episodes} Episodes)`
                    : 'Feature Film'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {activeTab === 'screenplay-files' && (
            <ScreenplayList
              screenplays={screenplays as any}
              projectId={projectId || ''}
              onCreateScreenplay={() => setShowCreateDialog(true)}
              onScreenplayClick={handleScreenplayClick}
              loadingScreenplayId={loadingScreenplayId}
              loading={loading}
              error={error}
            />
          )}
        </div>
      </div>

      {/* Create Screenplay Dialog */}
      {showCreateDialog && (
        <CreateScreenplayDialog
          project={project}
          isOpen={showCreateDialog}
          onClose={() => setShowCreateDialog(false)}
        />
      )}
    </div>
  );
};

export default Writing;
