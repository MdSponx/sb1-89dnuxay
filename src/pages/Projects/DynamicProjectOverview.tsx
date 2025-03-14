import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Pencil, ClipboardList, Clock, DollarSign, UserCog,
  Edit, UserPlus
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useDarkMode } from '../../contexts/DarkModeContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import type { Project } from '../../types/project';
import ProjectSidebar from '../../components/Projects/ProjectSidebar';
import Permissions from '../../components/Projects/Permissions';
import EditProjectDialog from '../../components/Projects/EditProjectDialog';
import QuickActionCard from '../../components/Projects/QuickActionCard';

const DynamicProjectOverview: React.FC = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDarkMode } = useDarkMode();
  
  const [activeModule, setActiveModule] = useState('overview');
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);

  useEffect(() => {
    const fetchProject = async () => {
      if (!projectId) return;

      try {
        setLoading(true);
        const projectRef = doc(db, 'projects', projectId);
        const projectSnap = await getDoc(projectRef);
        
        if (projectSnap.exists()) {
          setProject({ id: projectSnap.id, ...projectSnap.data() } as Project);
        } else {
          setError('Project not found');
        }
      } catch (err) {
        console.error('Error fetching project:', err);
        setError('Failed to load project');
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [projectId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F2] dark:bg-gray-800">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#E86F2C] border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-[#577B92] dark:text-gray-400">Loading project...</p>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F2] dark:bg-gray-800">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 text-lg">{error || 'Project not found'}</p>
          <button 
            onClick={() => navigate('/projects')}
            className="mt-4 px-4 py-2 text-[#577B92] dark:text-gray-400 hover:text-[#1E4D3A] dark:hover:text-white"
          >
            Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F5F5F2] dark:bg-gray-800">
      <ProjectSidebar 
        project={project}
        activeModule={activeModule}
        onModuleChange={setActiveModule}
      />
      
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Top Bar */}
        <div className={`${isDarkMode ? 'bg-gray-900' : 'bg-white'} border-b border-[#577B92]/10 dark:border-gray-700 px-6 py-3 flex justify-between items-center sticky top-0 z-10`}>
          <div className="flex items-center">
            <h2 className="text-lg font-semibold text-[#1E4D3A] dark:text-white">
              {activeModule === 'overview' && 'Project Overview'}
              {activeModule === 'writing' && 'Writing'}
              {activeModule === 'elements' && 'Elements'}
              {activeModule === 'schedules' && 'Schedules'}
              {activeModule === 'budgets' && 'Budgets'}
              {activeModule === 'cast-crew' && 'Cast and Crew'}
              {activeModule === 'files' && 'Files and Media'}
              {activeModule === 'permissions' && 'Permissions'}
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
            <button 
              onClick={() => setShowInviteModal(true)}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#2563eb] via-[#9333ea] to-[#db2777] text-white font-medium hover:opacity-90 transition-opacity flex items-center"
            >
              <UserPlus size={18} className="mr-2" />
              Invite
            </button>
          </div>
        </div>
        
        {/* Module Content */}
        <div className="p-6">
          {activeModule === 'overview' && (
            <div className="space-y-6">
              {/* Project Overview Card */}
              <div className={`rounded-xl ${isDarkMode ? 'bg-gray-900' : 'bg-white'} border border-[#577B92]/10 dark:border-gray-700 overflow-hidden`}>
                <div className="relative h-48">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent z-10"></div>
                  {project.coverImage ? (
                    <img 
                      src={project.coverImage} 
                      alt={project.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div className={`absolute inset-0 ${project.coverColor || 'bg-gradient-to-br from-[#1E4D3A] to-[#577B92]'}`} />
                  )}
                  <div className="absolute bottom-0 left-0 right-0 p-6 z-20">
                    <div className="flex items-center justify-between">
                      <div>
                        <h1 className="text-3xl font-bold text-white mb-2">{project.title}</h1>
                        <div className="flex items-center text-white/80 space-x-4">
                          <span>Created: {new Date(project.createdAt).toLocaleDateString()}</span>
                          <span>•</span>
                          <span>Last Updated: {new Date(project.updatedAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowEditDialog(true)}
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                      >
                        <Edit size={20} className="text-white" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-3 gap-6">
                    <div>
                      <h3 className="text-sm font-medium text-[#577B92] dark:text-gray-400">Format</h3>
                      <p className="mt-1 text-[#1E4D3A] dark:text-white">{project.format}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-[#577B92] dark:text-gray-400">Length</h3>
                      <p className="mt-1 text-[#1E4D3A] dark:text-white">{project.length} minutes</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-[#577B92] dark:text-gray-400">Status</h3>
                      <p className="mt-1 text-[#1E4D3A] dark:text-white">{project.status}</p>
                    </div>
                    {project.episodes && (
                      <div>
                        <h3 className="text-sm font-medium text-[#577B92] dark:text-gray-400">Episodes</h3>
                        <p className="mt-1 text-[#1E4D3A] dark:text-white">{project.episodes}</p>
                      </div>
                    )}
                    <div>
                      <h3 className="text-sm font-medium text-[#577B92] dark:text-gray-400">Scenes</h3>
                      <p className="mt-1 text-[#1E4D3A] dark:text-white">{project.scenes}</p>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-[#577B92] dark:text-gray-400">Team</h3>
                      <p className="mt-1 text-[#1E4D3A] dark:text-white">{project.collaborators.length} members</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div>
                <h2 className="text-xl font-semibold text-[#1E4D3A] dark:text-white mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <QuickActionCard
                    icon={Pencil}
                    title="Continue Writing"
                    description="Resume your screenplay writing"
                    onClick={() => navigate(`/editor?project=${projectId}`)}
                    color="bg-blue-500"
                  />
                  <QuickActionCard
                    icon={ClipboardList}
                    title="Script Breakdown"
                    description="Analyze and break down your script"
                    onClick={() => setActiveModule('elements')}
                    color="bg-purple-500"
                  />
                  <QuickActionCard
                    icon={Clock}
                    title="Scheduling"
                    description="Plan your production schedule"
                    onClick={() => setActiveModule('schedules')}
                    color="bg-green-500"
                  />
                  <QuickActionCard
                    icon={DollarSign}
                    title="Budgeting"
                    description="Manage your project budget"
                    onClick={() => setActiveModule('budgets')}
                    color="bg-amber-500"
                  />
                  <QuickActionCard
                    icon={UserCog}
                    title="Cast & Crew"
                    description="Manage your production team"
                    onClick={() => setActiveModule('cast-crew')}
                    color="bg-red-500"
                  />
                </div>
              </div>
            </div>
          )}
          {activeModule === 'permissions' && (
            <Permissions project={project} />
          )}
        </div>
      </div>

      {/* Edit Project Dialog */}
      {showEditDialog && (
        <EditProjectDialog
          project={project}
          isOpen={showEditDialog}
          onClose={() => setShowEditDialog(false)}
          onSubmit={async (projectData) => {
            try {
              const projectRef = doc(db, 'projects', projectId!);
              await updateDoc(projectRef, {
                ...projectData,
                updated_at: new Date().toISOString()
              });
              setProject(prev => prev ? { ...prev, ...projectData } as Project : null);
              setShowEditDialog(false);
            } catch (err) {
              console.error('Error updating project:', err);
              throw err;
            }
          }}
        />
      )}
    </div>
  );
};

export default DynamicProjectOverview;