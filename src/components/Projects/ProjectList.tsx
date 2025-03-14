import React from 'react';
import { FileText, Plus, Calendar, Users, Eye, Edit, Trash, MoreHorizontal } from 'lucide-react';
import { Project } from '../../types/project';

interface ProjectListProps {
  title: string;
  projects: Project[];
  viewMode: 'grid' | 'list';
  renderProject: (project: Project) => React.ReactNode;
  onCreateProject?: () => void;
  emptyStateText: string;
  emptyStateAction: string;
}

const ProjectList: React.FC<ProjectListProps> = ({
  title,
  projects,
  viewMode,
  renderProject,
  onCreateProject,
  emptyStateText,
  emptyStateAction,
}) => {
  const formatDate = (dateString: string | { seconds: number; nanoseconds: number }) => {
    try {
      // Handle Firestore Timestamp
      if (typeof dateString === 'object' && 'seconds' in dateString) {
        return new Date(dateString.seconds * 1000).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      }
      
      // Handle ISO string
      return new Date(dateString).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch (err) {
      console.error('Error formatting date:', err);
      return 'Invalid Date';
    }
  };

  return (
    <div className="mb-12">
      <h2 className="text-lg font-medium text-[#1E4D3A] dark:text-white mb-6">{title}</h2>
      {projects.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {projects.map(project => renderProject(project))}
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-[#577B92]/10 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#577B92] dark:text-gray-400 uppercase tracking-wider">
                      Project
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#577B92] dark:text-gray-400 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#577B92] dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#577B92] dark:text-gray-400 uppercase tracking-wider">
                      Last Updated
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#577B92] dark:text-gray-400 uppercase tracking-wider">
                      Members
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-[#577B92] dark:text-gray-400 uppercase tracking-wider">
                      Scenes
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-[#577B92] dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {projects.map((project) => (
                    <tr key={project.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-16 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden mr-3">
                            {project.coverImage ? (
                              <img 
                                src={project.coverImage} 
                                alt={project.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center">
                                <FileText size={16} className="text-[#577B92] dark:text-gray-400" />
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-[#1E4D3A] dark:text-white">
                              {project.title}
                            </div>
                            {project.company && (
                              <div className="text-xs text-[#577B92] dark:text-gray-400">
                                {project.company.name}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-[#1E4D3A] dark:text-white">{project.format}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          project.status === 'Draft' ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' :
                          project.status === 'In Progress' ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' :
                          project.status === 'Completed' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                          'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                        }`}>
                          {project.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-[#577B92] dark:text-gray-400">
                          <Calendar size={14} className="mr-1" />
                          {formatDate(project.updated_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-[#1E4D3A] dark:text-white">
                          <Users size={14} className="mr-1 text-[#577B92] dark:text-gray-400" />
                          {project.collaborators.length}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-[#1E4D3A] dark:text-white">
                        {project.scenes}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end space-x-2">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              renderProject(project);
                            }}
                            className="text-[#577B92] dark:text-gray-400 hover:text-[#1E4D3A] dark:hover:text-white"
                          >
                            <Eye size={16} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              renderProject(project);
                            }}
                            className="text-[#577B92] dark:text-gray-400 hover:text-[#1E4D3A] dark:hover:text-white"
                          >
                            <Edit size={16} />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              renderProject(project);
                            }}
                            className="text-[#577B92] dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                          >
                            <Trash size={16} />
                          </button>
                          <div className="relative group">
                            <button className="text-[#577B92] dark:text-gray-400 hover:text-[#1E4D3A] dark:hover:text-white">
                              <MoreHorizontal size={16} />
                            </button>
                            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 hidden group-hover:block z-10">
                              <div className="py-1">
                                <button className="block w-full text-left px-4 py-2 text-sm text-[#1E4D3A] dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800">
                                  Duplicate
                                </button>
                                <button className="block w-full text-left px-4 py-2 text-sm text-[#1E4D3A] dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800">
                                  Export
                                </button>
                                <button className="block w-full text-left px-4 py-2 text-sm text-[#1E4D3A] dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800">
                                  Archive
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
          <FileText size={48} className="mx-auto text-[#577B92] dark:text-gray-500 mb-3" />
          <h4 className="text-lg font-medium text-[#1E4D3A] dark:text-white mb-2">{emptyStateText}</h4>
          <p className="text-[#577B92] dark:text-gray-400 text-sm max-w-sm mx-auto">{emptyStateAction}</p>
          {onCreateProject && (
            <button
              onClick={onCreateProject}
              className="mt-4 px-6 py-2 bg-gradient-to-r from-[#2563eb] via-[#9333ea] to-[#db2777] text-white rounded-lg hover:opacity-90 transition-opacity inline-flex items-center"
            >
              <Plus size={18} className="mr-2" />
              Create Project
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ProjectList;