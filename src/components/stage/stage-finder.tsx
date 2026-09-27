import { useRef, useState, type KeyboardEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import {
  ArrowRight,
  Lamp,
  Maximize2,
  Music2,
  Pause,
  Play,
  Repeat2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import "./stage-finder.css";

export type StageFinderItem = {
  id: string;
  label: string;
  detail?: string;
  keywords?: string[];
  group: "Stage" | "Songs" | "Passages" | "Controls";
  icon?: "play" | "pause" | "song" | "passage" | "focus" | "room" | "sound" | "import" | "reset";
  disabled?: boolean;
  onSelect: () => void;
};

export type StageFinderProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: StageFinderItem[];
  songName: string;
  setupLabel: string;
  onReturnFocus: () => void;
};

const GROUPS = ["Stage", "Songs", "Passages", "Controls"] as const;
const ICONS: Record<NonNullable<StageFinderItem["icon"]>, LucideIcon> = {
  play: Play,
  pause: Pause,
  song: Music2,
  passage: Repeat2,
  focus: Maximize2,
  room: Lamp,
  sound: SlidersHorizontal,
  import: Upload,
  reset: RotateCcw,
};

// Match meaningful words so a song title never loses to unrelated letters
// scattered through a long action description. Exact titles rank first.
function matchCommand(value: string, search: string, keywords?: string[]) {
  const query = search.trim().toLocaleLowerCase();
  if (!query) return 1;
  const label = (keywords?.[0] ?? value).toLocaleLowerCase();
  if (label === query) return 1;
  if (label.startsWith(query)) return 0.95;
  if (label.includes(query)) return 0.9;
  const words = `${label} ${(keywords ?? []).join(" ")}`.toLocaleLowerCase();
  return query.split(/\s+/).every((word) => words.includes(word)) ? 0.5 : 0;
}

// Native recovery buttons keep their own Enter/Space behavior inside cmdk.
function stopCommandActivation(event: KeyboardEvent<HTMLButtonElement>) {
  if (event.key === "Enter" || event.key === " ") event.stopPropagation();
}

export function StageFinder({ open, onOpenChange, items, songName, setupLabel, onReturnFocus }: StageFinderProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const executingRef = useRef(false);

  function clearSearch() {
    setQuery("");
    inputRef.current?.focus();
  }

  function selectItem(item: StageFinderItem) {
    if (item.disabled) return;
    executingRef.current = true;
    onOpenChange(false);
    // Keep this in the original input event so audio commands retain the gesture.
    item.onSelect();
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="stage-finder-overlay" />
        <Dialog.Content
          className="stage-finder"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            executingRef.current = false;
            setQuery("");
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // Commands may open another panel or focus their destination.
            if (!executingRef.current) onReturnFocus();
          }}
        >
          <header className="stage-finder-header">
            <div className="stage-finder-heading">
              <Dialog.Title className="stage-finder-title">Stage finder</Dialog.Title>
              <Dialog.Description className="stage-finder-context">
                <span className="stage-finder-song">{songName}</span>
                <span className="stage-finder-setup">{setupLabel}</span>
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button className="stage-finder-icon-button" type="button" aria-label="Close stage finder">
                <X size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
          </header>

          <Command className="stage-finder-command" label="Stage finder commands" vimBindings={false} filter={matchCommand}>
            <div className="stage-finder-search">
              <Search className="stage-finder-search-icon" size={20} aria-hidden="true" />
              <Command.Input
                ref={inputRef}
                className="stage-finder-input"
                placeholder="Find a song, passage or action…"
                aria-label="Search stage finder"
                value={query}
                onValueChange={setQuery}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {query && (
                <button
                  className="stage-finder-icon-button stage-finder-clear"
                  type="button"
                  aria-label="Clear search"
                  onClick={clearSearch}
                  onKeyDown={stopCommandActivation}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>

            <Command.List className="stage-finder-list" label="Songs, passages and stage actions">
              <Command.Empty className="stage-finder-empty">
                <Search size={24} aria-hidden="true" />
                <strong>No matches{query.trim() ? ` for “${query.trim()}”` : " yet"}</strong>
                <p>Try a song title, passage or action.</p>
                {query && (
                  <button
                    className="stage-finder-recovery"
                    type="button"
                    onClick={clearSearch}
                    onKeyDown={stopCommandActivation}
                  >
                    Show all commands <ArrowRight size={15} aria-hidden="true" />
                  </button>
                )}
              </Command.Empty>
              {GROUPS.map((group) => {
                const groupItems = items.filter((item) => item.group === group);
                if (!groupItems.length) return null;
                return (
                  <Command.Group className="stage-finder-group" key={group} heading={group} value={group}>
                    {groupItems.map((item) => {
                      const Icon = item.icon ? ICONS[item.icon] : ArrowRight;
                      return (
                        <Command.Item
                          className="stage-finder-item"
                          key={item.id}
                          value={item.id}
                          keywords={[item.label, item.detail ?? "", ...(item.keywords ?? [])]}
                          disabled={item.disabled}
                          onSelect={() => selectItem(item)}
                          data-command-id={item.id}
                        >
                          <span className="stage-finder-item-icon"><Icon size={18} aria-hidden="true" /></span>
                          <span className="stage-finder-item-copy">
                            <span className="stage-finder-item-label">{item.label}</span>
                            {item.detail && <span className="stage-finder-item-detail">{item.detail}</span>}
                          </span>
                          {item.disabled
                            ? <span className="stage-finder-unavailable">Unavailable</span>
                            : <ArrowRight className="stage-finder-item-arrow" size={16} aria-hidden="true" />}
                        </Command.Item>
                      );
                    })}
                  </Command.Group>
                );
              })}
            </Command.List>

            <footer className="stage-finder-footer" aria-hidden="true">
              <span className="stage-finder-key-hint"><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
              <span className="stage-finder-key-hint"><kbd>↵</kbd> select</span>
              <span className="stage-finder-key-hint stage-finder-dismiss-hint"><kbd>Esc</kbd> close</span>
              <span className="stage-finder-touch-hint">Tap a result to go there</span>
            </footer>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
