'use client';

import React, { useState } from 'react';
import { FolderOpen, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatRelativeTime } from '@/lib/db';
import type { Project } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { IconButton } from '@/components/ui/IconButton';
import { Input } from '@/components/ui/Input';
import { Sheet } from '@/components/ui/Sheet';

interface ProjectsSheetProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  activeProjectId: string | null;
  loading: boolean;
  onSelectProject: (id: string) => void;
  onOpenNewVideo: () => void;
  onRenameProject: (id: string, title: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
}

export function ProjectsSheet({
  open,
  onClose,
  projects,
  activeProjectId,
  loading,
  onSelectProject,
  onOpenNewVideo,
  onRenameProject,
  onDeleteProject,
}: ProjectsSheetProps) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<Project | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);

  const openRenameDialog = (project: Project) => {
    setMenuOpenId(null);
    setRenameTarget(project);
    setRenameInput(project.title);
  };

  const openDeleteDialog = (project: Project) => {
    setMenuOpenId(null);
    setDeleteTarget(project);
  };

  const handleConfirmRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget) return;
    const trimmed = renameInput.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await onRenameProject(renameTarget.id, trimmed);
      setRenameTarget(null);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await onDeleteProject(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet
        open={open}
        onClose={() => {
          setMenuOpenId(null);
          onClose();
        }}
        side="left"
        title="Projects"
        subtitle={`${projects.length} local ${projects.length === 1 ? 'video' : 'videos'}`}
        footer={
          <Button
            variant="primary"
            fullWidth
            onClick={() => {
              setMenuOpenId(null);
              onClose();
              onOpenNewVideo();
            }}
          >
            <Plus className="h-4 w-4" />
            <span>New video</span>
          </Button>
        }
      >
        {loading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className="h-16 animate-pulse rounded-[12px] border border-border bg-surface-2"
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState
            icon={<FolderOpen className="h-5 w-5" />}
            title="No projects yet"
            description="Create a new video project to keep your prompts and aspect ratio organized."
          />
        ) : (
          <ul className="space-y-2">
            {projects.map((project) => {
              const isActive = project.id === activeProjectId;
              const menuOpen = menuOpenId === project.id;

              return (
                <li key={project.id} className="relative">
                  <div
                    className={cn(
                      'flex items-center gap-2 rounded-[12px] border p-2 transition-colors duration-150',
                      isActive
                        ? 'border-accent/60 bg-accent/8'
                        : 'border-border bg-surface-2/60 hover:bg-surface-2'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpenId(null);
                        onSelectProject(project.id);
                        onClose();
                      }}
                      className="min-h-[44px] min-w-0 flex-1 px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-[8px]"
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-text">
                          {project.title}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
                        <Badge variant={isActive ? 'accent' : 'default'}>
                          {project.format}
                        </Badge>
                        <span className="truncate tabular-nums">
                          {formatRelativeTime(project.updatedAt)}
                        </span>
                      </div>
                    </button>

                    <IconButton
                      aria-label={`Actions for ${project.title}`}
                      aria-expanded={menuOpen}
                      onClick={() =>
                        setMenuOpenId((prev) =>
                          prev === project.id ? null : project.id
                        )
                      }
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </IconButton>
                  </div>

                  {menuOpen && (
                    <div
                      role="menu"
                      className="absolute right-2 top-14 z-20 w-40 rounded-[12px] border border-border bg-surface-1 p-1.5"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openRenameDialog(project)}
                        className="flex min-h-[40px] w-full items-center gap-2 rounded-[8px] px-2.5 text-sm text-text hover:bg-surface-2"
                      >
                        <Pencil className="h-3.5 w-3.5 text-text-secondary" />
                        <span>Rename</span>
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openDeleteDialog(project)}
                        className="flex min-h-[40px] w-full items-center gap-2 rounded-[8px] px-2.5 text-sm text-danger hover:bg-danger/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Sheet>

      <Dialog
        open={renameTarget !== null}
        onClose={() => setRenameTarget(null)}
        title="Rename project"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setRenameTarget(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              form="rename-project-form"
              variant="primary"
              loading={busy}
              disabled={!renameInput.trim() || busy}
            >
              Save
            </Button>
          </>
        }
      >
        <form id="rename-project-form" onSubmit={handleConfirmRename}>
          <Input
            label="Project title"
            value={renameInput}
            onChange={(e) => setRenameInput(e.target.value)}
            autoFocus
            placeholder="Untitled video"
          />
        </form>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete project?"
        description={
          deleteTarget
            ? `This will permanently delete "${deleteTarget.title}" and all of its saved messages from this browser.`
            : undefined
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              onClick={() => void handleConfirmDelete()}
            >
              Delete
            </Button>
          </>
        }
      />
    </>
  );
}
