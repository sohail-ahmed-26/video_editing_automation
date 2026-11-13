import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useWorkspace } from '../../store/WorkspaceContext';
import { useProjects } from '../../store/ProjectContext';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { resetWorkspace, setProjectTitle, setCurrentProjectId } = useWorkspace();
  const { saveProject, clients } = useProjects();

  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    try {
      setIsSubmitting(true);
      const finalTitle = title.trim() || 'Untitled Project';
      const finalClient = clientName.trim() || 'General';

      resetWorkspace();
      setProjectTitle(finalTitle);

      const saved = await saveProject({
        title: finalTitle,
        clientName: finalClient,
        description: `Project for ${finalClient}`,
        status: 'draft',
        rawPrompt: '',
        preferences: {
          aspectRatio: '16:9',
          resolution: '1080p',
          frameRate: '30fps',
          style: 'viral-fast',
          pacingDensity: 4,
          cutSilences: true,
          generateCaptions: true,
          autoColorGrade: false,
          addBackgroundMusic: false,
          musicMood: 'chill',
        },
      });

      setCurrentProjectId(saved.id);
      onClose();
      navigate(`/editor/${saved.id}`);
    } catch (err) {
      console.error('Error creating project:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="New Project"
      maxWidth="sm"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleCreate} isLoading={isSubmitting}>
            Create
          </Button>
        </>
      }
    >
      <form onSubmit={handleCreate} className="space-y-3">
        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Project title"
          autoFocus
        />

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-[#8B909A]">
            Client name
          </label>
          <input
            list="client-suggestions"
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Select or enter client name"
            className="w-full bg-[#121317] border border-[#23262D] focus:border-[#C8A96A] rounded px-3 py-2 text-sm text-[#ECEDEF] placeholder-[#5a5f6b] focus:outline-none transition-colors"
          />
          <datalist id="client-suggestions">
            {clients.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
        </div>
      </form>
    </Modal>
  );
};
