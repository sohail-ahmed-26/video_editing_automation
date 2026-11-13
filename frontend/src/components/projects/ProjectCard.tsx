import React, { useState } from 'react';
import { Film, MoreVertical, FolderOpen, Edit2, Trash2, Calendar, User } from 'lucide-react';
import { Project } from '../../types/project';
import { formatDate } from '../../utils/formatters';

interface ProjectCardProps {
  project: Project;
  onOpen: (project: Project) => void;
  onRename: (project: Project) => void;
  onDelete: (id: string) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onOpen,
  onRename,
  onDelete,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [imgError, setImgError] = useState(false);

  const clientName = project.client?.name || project.clientName || 'General';
  const versionCount = project.versions?.length || project._count?.versions || 1;
  const aspectRatio = project.preferences?.aspectRatio || '16:9';

  return (
    <div
      onClick={() => onOpen(project)}
      className={`group relative bg-[#121317] border border-[#23262D] hover:border-[#C8A96A]/60 rounded flex flex-col transition-colors cursor-pointer select-none ${
        showMenu ? 'z-30' : 'z-0'
      }`}
    >
      {/* Thumbnail area */}
      <div className="relative aspect-video w-full bg-[#0B0C0E] border-b border-[#23262D] flex items-center justify-center overflow-hidden rounded-t">
        {project.thumbnailUrl && !imgError ? (
          <img
            src={project.thumbnailUrl}
            alt=""
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-[#8B909A] gap-1">
            <Film className="w-6 h-6 text-[#5a5f6b]" />
            <span className="text-[10px] font-mono text-[#5a5f6b]">{aspectRatio}</span>
          </div>
        )}

        {/* Aspect ratio & versions badge */}
        <div className="absolute top-2 left-2 flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#0B0C0E]/90 text-[#ECEDEF] border border-[#23262D]">
            {aspectRatio}
          </span>
          <span className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#181A1F]/90 text-[#8B909A] border border-[#23262D]">
            {versionCount} {versionCount === 1 ? 'version' : 'versions'}
          </span>
        </div>
      </div>

      {/* Card Details */}
      <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[11px] text-[#8B909A] mb-1 truncate">
              <User className="w-3 h-3 flex-shrink-0 text-[#C8A96A]" />
              <span className="truncate">{clientName}</span>
            </div>
            <h4 className="text-sm font-semibold text-[#ECEDEF] group-hover:text-white transition-colors truncate">
              {project.title}
            </h4>
          </div>

          {/* Action Menu */}
          <div className="relative flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 rounded text-[#8B909A] hover:text-[#ECEDEF] hover:bg-[#181A1F] transition-colors"
              aria-label="Actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(false);
                  }}
                />
                <div className="absolute right-0 top-7 w-32 bg-[#181A1F] border border-[#23262D] rounded shadow-xl py-1 z-50">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onOpen(project);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#ECEDEF] hover:bg-[#23262D] text-left transition-colors"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[#8B909A]" />
                    <span>Open</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onRename(project);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#ECEDEF] hover:bg-[#23262D] text-left transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-[#8B909A]" />
                    <span>Rename</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(false);
                      onDelete(project.id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#C75B5B] hover:bg-[#C75B5B]/15 text-left transition-colors font-medium border-t border-[#23262D]"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[#C75B5B]" />
                    <span>Delete</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-[11px] text-[#8B909A] pt-2 border-t border-[#23262D]">
          <span className="flex items-center gap-1 font-mono">
            <Calendar className="w-3 h-3 text-[#5a5f6b]" />
            {formatDate(project.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
};
