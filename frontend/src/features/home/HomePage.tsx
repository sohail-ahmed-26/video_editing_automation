import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Film } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/ui/EmptyState';
import { ProjectCard } from '../../components/projects/ProjectCard';
import { NewProjectModal } from '../../components/projects/NewProjectModal';
import { useProjects } from '../../store/ProjectContext';
import { useWorkspace } from '../../store/WorkspaceContext';
import { Project } from '../../types/project';
import { APP_NAME } from '../../config/brand';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { projects, clients, deleteProject, saveProject } = useProjects();
  const { loadProjectData } = useWorkspace();

  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState('all');

  // Rename modal state
  const [projectToRename, setProjectToRename] = useState<Project | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Delete modal state
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenProject = (project: Project) => {
    loadProjectData(project);
    navigate(`/editor/${project.id}`);
  };

  const handleInitiateRename = (project: Project) => {
    setProjectToRename(project);
    setRenameTitle(project.title);
  };

  const handleConfirmRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectToRename || !renameTitle.trim() || isRenaming) return;
    try {
      setIsRenaming(true);
      await saveProject({
        id: projectToRename.id,
        title: renameTitle.trim(),
      });
      setProjectToRename(null);
    } catch (err) {
      console.error('Failed to rename project:', err);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!projectToDelete || isDeleting) return;
    try {
      setIsDeleting(true);
      await deleteProject(projectToDelete);
      setProjectToDelete(null);
    } catch (err) {
      console.error('Failed to delete project:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      const matchesSearch =
        searchQuery === '' ||
        project.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (project.client?.name && project.client.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (project.clientName && project.clientName.toLowerCase().includes(searchQuery.toLowerCase()));

      const clientName = project.client?.name || project.clientName || 'General';
      const matchesClient =
        selectedClient === 'all' ||
        clientName.toLowerCase() === selectedClient.toLowerCase();

      return matchesSearch && matchesClient;
    });
  }, [projects, searchQuery, selectedClient]);

  return (
    <div className="w-full max-w-none p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#23262D] pb-5">
        <div className="flex items-center gap-3">
          <img src="/editron-logo.png" alt={APP_NAME} className="h-7 w-auto max-w-[170px] object-contain" />
        </div>

        <Button
          variant="primary"
          size="sm"
          leftIcon={<Plus className="w-4 h-4" />}
          onClick={() => setIsNewProjectModalOpen(true)}
        >
          New Project
        </Button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            leftIcon={<Search className="w-4 h-4 text-[#8B909A]" />}
          />
        </div>

        <div className="w-full sm:w-48">
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="w-full bg-[#121317] border border-[#23262D] focus:border-[#C8A96A] text-[#ECEDEF] text-xs rounded px-3 py-2 outline-none transition-colors"
          >
            <option value="all">All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Project Cards Grid */}
      {projects.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No projects yet"
          description="Create a project to start editing."
          actionLabel="New Project"
          onAction={() => setIsNewProjectModalOpen(true)}
        />
      ) : filteredProjects.length === 0 ? (
        <div className="p-8 text-center border border-dashed border-[#23262D] rounded bg-[#121317]/50">
          <p className="text-xs text-[#8B909A]">
            No projects match your search or filter criteria.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
          {filteredProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={handleOpenProject}
              onRename={handleInitiateRename}
              onDelete={(id) => setProjectToDelete(id)}
            />
          ))}
        </div>
      )}

      {/* New Project Modal */}
      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
      />

      {/* Rename Dialog */}
      <Modal
        isOpen={Boolean(projectToRename)}
        onClose={() => setProjectToRename(null)}
        title="Rename Project"
        maxWidth="sm"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setProjectToRename(null)}
              disabled={isRenaming}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleConfirmRename}
              isLoading={isRenaming}
            >
              Save
            </Button>
          </>
        }
      >
        <form onSubmit={handleConfirmRename} className="space-y-3">
          <Input
            label="Title"
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            placeholder="Enter new title"
            autoFocus
          />
        </form>
      </Modal>

      {/* Delete Confirmation Dialog */}
      <Modal
        isOpen={Boolean(projectToDelete)}
        onClose={() => setProjectToDelete(null)}
        title="Delete Project"
        maxWidth="sm"
        footer={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setProjectToDelete(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmDelete}
              isLoading={isDeleting}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-xs text-[#8B909A]">
          Are you sure you want to delete this project? This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
};

