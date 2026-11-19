'use client';

import React, { useState } from 'react';
import { VIDEO_FORMATS, VIDEO_TYPES } from '@/lib/constants';
import type { VideoFormat, VideoType } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';

interface NewVideoSheetProps {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { format: VideoFormat; type: VideoType }) => Promise<void>;
}

export function NewVideoSheet({ open, onClose, onCreate }: NewVideoSheetProps) {
  const [format, setFormat] = useState<VideoFormat>('16:9');
  const [type, setType] = useState<VideoType>('Explainer');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await onCreate({ format, type });
      onClose();
    } finally {
      setCreating(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      side="right"
      title="New video"
      subtitle="Choose an aspect ratio and style"
      footer={
        <div className="flex items-center gap-2.5">
          <Button variant="secondary" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button
            variant="primary"
            fullWidth
            loading={creating}
            onClick={() => void handleCreate()}
          >
            Create
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <div>
          <div className="mb-2.5 text-xs font-medium text-text-secondary">
            Format
          </div>
          <div className="grid grid-cols-3 gap-2.5">
            {VIDEO_FORMATS.map((item) => {
              const selected = format === item.value;
              const previewClass =
                item.value === '9:16'
                  ? 'h-11 w-[25px]'
                  : item.value === '16:9'
                    ? 'h-[25px] w-11'
                    : 'h-9 w-9';

              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFormat(item.value)}
                  aria-pressed={selected}
                  className={cn(
                    'flex min-h-[116px] flex-col items-center justify-between rounded-[12px] border p-3 text-center transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    selected
                      ? 'border-accent bg-accent/10'
                      : 'border-border bg-surface-2/60 hover:bg-surface-2'
                  )}
                >
                  <div className="flex h-12 items-center justify-center">
                    <div
                      className={cn(
                        'rounded-[5px] border-2 transition-colors',
                        previewClass,
                        selected
                          ? 'border-accent bg-accent/20'
                          : 'border-text-muted/60 bg-surface-1'
                      )}
                    />
                  </div>
                  <div className="mt-2">
                    <div className="font-mono text-xs font-semibold text-text">
                      {item.value}
                    </div>
                    <div className="mt-0.5 text-[11px] text-text-secondary">
                      {item.label}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2.5 text-xs font-medium text-text-secondary">
            Video type
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {VIDEO_TYPES.map((item) => {
              const selected = type === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setType(item)}
                  aria-pressed={selected}
                  className={cn(
                    'min-h-[44px] rounded-[12px] border px-3.5 py-2.5 text-left text-sm font-medium transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    selected
                      ? 'border-accent bg-accent/10 text-text'
                      : 'border-border bg-surface-2/60 text-text-secondary hover:bg-surface-2 hover:text-text'
                  )}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
