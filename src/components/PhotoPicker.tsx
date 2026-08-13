import { useRef, useState, type DragEvent } from "react";
import { AVATAR_THEMES } from "../data/avatars";
import { Avatar, fileToDataUrl } from "./Avatar";
import { Button } from "@/components/base/buttons/button";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";

type Props = {
  name: string;
  photo?: string;
  onChange: (photo: string | undefined) => void;
};

export function PhotoPicker({ name, photo, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const coarse = useCoarsePointer();
  const [dragging, setDragging] = useState(false);
  const [themeId, setThemeId] = useState(AVATAR_THEMES[0].id);
  const [showAvatars, setShowAvatars] = useState(!photo);
  const [error, setError] = useState<string | null>(null);

  const theme = AVATAR_THEMES.find((t) => t.id === themeId) ?? AVATAR_THEMES[0];

  const applyFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Drop an image file (PNG, JPG, WEBP…).");
      return;
    }
    setError(null);
    try {
      onChange(await fileToDataUrl(file));
      setShowAvatars(false);
    } catch {
      setError("Couldn't read that image. Try another file.");
    }
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    await applyFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div className="space-y-3">
      <div
        className={`relative flex items-center gap-3 rounded-xl border border-dashed p-3 transition-colors ${
          dragging
            ? "border-teal-500 bg-teal-50/80 dark:border-teal-400 dark:bg-teal-950/40"
            : "border-primary bg-stone-50/60 dark:bg-stone-900/40"
        }`}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragging(false);
        }}
        onDrop={onDrop}
      >
        <button
          type="button"
          className="group relative shrink-0 rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-teal-500"
          onClick={() => inputRef.current?.click()}
          aria-label="Upload photo"
        >
          <Avatar name={name || "?"} photo={photo} size={64} />
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-stone-900/0 text-[10px] font-medium text-white opacity-0 transition touch:bg-stone-900/45 touch:opacity-100 group-hover:bg-stone-900/45 group-hover:opacity-100">
            Change
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-stone-800 dark:text-stone-100">
            {dragging ? "Drop to set photo" : "Photo or avatar"}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-xs text-quaternary">
            {coarse ? "Tap to choose a photo" : "Drag an image here, or"}{" "}
            <Button
              size="sm"
              color="link-color"
              onClick={() => inputRef.current?.click()}
            >
              {coarse ? "browse" : "browse"}
            </Button>
            {coarse && (
              <>
                {" · "}
                <Button
                  size="sm"
                  color="link-color"
                  onClick={() => cameraRef.current?.click()}
                >
                  take a photo
                </Button>
              </>
            )}
            {" · "}
            <Button
              size="sm"
              color="link-gray"
              onClick={() => setShowAvatars((v) => !v)}
            >
              {showAvatars ? "hide avatars" : "pick an avatar"}
            </Button>
          </p>
          {photo && (
            <Button
              size="sm"
              color="link-destructive"
              className="mt-1"
              onClick={() => {
                onChange(undefined);
                setShowAvatars(true);
              }}
            >
              Remove
            </Button>
          )}
          {error && (
            <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            await applyFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={async (e) => {
            await applyFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {showAvatars && (
        <div className="space-y-2.5 rounded-xl border border-secondary bg-white p-3 dark:bg-stone-950/40">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                Avatar themes
              </div>
              <p className="text-[11px] text-quaternary">{theme.blurb}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-1 touch:gap-2">
            {AVATAR_THEMES.map((t) => {
              const active = t.id === themeId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setThemeId(t.id)}
                  className={`rounded-md px-2 py-1 text-xs transition-colors touch:min-h-11 touch:min-w-11 touch:px-3 ${
                    active
                      ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900"
                      : "bg-tertiary text-tertiary hover:bg-stone-200 dark:hover:bg-stone-700"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-4 gap-2 sm:grid-cols-4">
            {theme.avatars.map((a) => {
              const selected = photo === a.src;
              return (
                <button
                  key={a.id}
                  type="button"
                  title={a.label}
                  onClick={() => {
                    onChange(a.src);
                    setError(null);
                  }}
                  className={`group relative aspect-square overflow-hidden rounded-xl border-2 transition ${
                    selected
                      ? "border-teal-500 shadow-[0_0_0_2px_rgba(20,184,166,0.25)]"
                      : "border-transparent hover:border-stone-300 dark:hover:border-stone-600"
                  }`}
                >
                  <img
                    src={a.src}
                    alt={a.label}
                    className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                    draggable={false}
                  />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-stone-900/55 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] font-medium text-white opacity-0 touch:opacity-100 transition group-hover:opacity-100">
                    {a.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
