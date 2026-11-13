import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Project, Client } from '../types/project';
import { projectStorage } from '../services/projectStorage';
import { apiClient } from '../services/apiClient';

interface ProjectContextType {
  projects: Project[];
  clients: Client[];
  isLoading: boolean;
  isBackendOnline: boolean;
  backendError: string | null;
  getProject: (id: string) => Project | null;
  saveProject: (project: Partial<Project> & { title: string }) => Promise<Project>;
  deleteProject: (id: string) => Promise<boolean>;
  duplicateProject: (id: string) => Promise<Project | null>;
  refreshProjects: (clientId?: string) => Promise<void>;
  refreshClients: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | null>(null);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projects, setProjects] = useState<Project[]>(() => projectStorage.getAll());
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBackendOnline, setIsBackendOnline] = useState<boolean>(true);
  const [backendError, setBackendError] = useState<string | null>(null);

  const refreshClients = useCallback(async () => {
    try {
      const data = await apiClient.listClients();
      setClients(data);
    } catch (err) {
      console.warn('Could not load clients from backend:', err);
    }
  }, []);

  const refreshProjects = useCallback(async (clientId?: string) => {
    try {
      setIsLoading(true);
      const data = await projectStorage.fetchAll(clientId);
      setProjects(data);
      setIsBackendOnline(true);
      setBackendError(null);
    } catch (err) {
      console.warn('Backend not reachable:', err);
      setIsBackendOnline(false);
      setBackendError('Backend is not running');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const health = await apiClient.checkHealth();
        if (!health.connected) {
          if (isMounted) {
            setIsBackendOnline(false);
            setBackendError('Backend is not running');
            setIsLoading(false);
          }
          return;
        }

        if (isMounted) {
          setIsBackendOnline(true);
          setBackendError(null);
        }

        await Promise.all([refreshClients(), refreshProjects()]);
      } catch (e) {
        if (isMounted) {
          setIsBackendOnline(false);
          setBackendError('Backend is not running');
          setIsLoading(false);
        }
      }
    }

    init();

    return () => {
      isMounted = false;
    };
  }, [refreshClients, refreshProjects]);

  const getProject = (id: string): Project | null => {
    return projects.find((p) => p.id === id) || projectStorage.getById(id) as any;
  };

  const saveProject = async (project: Partial<Project> & { title: string }): Promise<Project> => {
    try {
      const saved = await projectStorage.save(project);
      await refreshProjects();
      await refreshClients();
      return saved;
    } catch (err) {
      setIsBackendOnline(false);
      setBackendError('Backend is not running');
      throw err;
    }
  };

  const deleteProject = async (id: string): Promise<boolean> => {
    try {
      const success = await projectStorage.delete(id);
      if (success) {
        setProjects((prev) => prev.filter((p) => p.id !== id));
        await refreshClients();
      }
      return success;
    } catch (err) {
      setIsBackendOnline(false);
      setBackendError('Backend is not running');
      return false;
    }
  };

  const duplicateProject = async (id: string): Promise<Project | null> => {
    try {
      const duplicated = await projectStorage.duplicate(id);
      if (duplicated) {
        await refreshProjects();
        await refreshClients();
      }
      return duplicated;
    } catch (err) {
      setIsBackendOnline(false);
      setBackendError('Backend is not running');
      return null;
    }
  };

  return (
    <ProjectContext.Provider
      value={{
        projects,
        clients,
        isLoading,
        isBackendOnline,
        backendError,
        getProject,
        saveProject,
        deleteProject,
        duplicateProject,
        refreshProjects,
        refreshClients,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjects = (): ProjectContextType => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjects must be used within a ProjectProvider');
  }
  return context;
};
