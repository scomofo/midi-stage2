import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type AudioSourcePreviewProps = {
  file: File;
  disabled?: boolean;
};

export function AudioSourcePreview({ file, disabled = false }: AudioSourcePreviewProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const url = URL.createObjectURL(file);
    setFailed(false);
    audio.src = url;

    // Keep the same media source through the stage's frequent HUD updates.
    // Replacing the file or closing the library must also stop its playback.
    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
    };
  }, [file]);

  useEffect(() => {
    if (disabled) audioRef.current?.pause();
  }, [disabled]);

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <h4 id={titleId} className="text-sm font-medium text-fg">
        Listen to your track
      </h4>
      <p id={descriptionId} className="text-xs leading-relaxed text-muted">
        Preview the original recording before adding it to your setlist.
      </p>
      <audio
        ref={audioRef}
        controls
        preload="none"
        style={{ colorScheme: "dark" }}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        className={cn("block w-full min-w-0 max-w-full", disabled && "pointer-events-none opacity-60")}
        onPlay={(event) => {
          if (disabled) event.currentTarget.pause();
        }}
        onError={() => setFailed(true)}
      />
      {failed ? (
        <p role="status" className="text-xs leading-relaxed text-tungsten">
          This browser couldn’t play the preview. You can still add the song to your setlist.
        </p>
      ) : null}
    </div>
  );
}
