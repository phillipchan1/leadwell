import { initials } from "../lib/derive";
import { avatarClass } from "../lib/pigments";
import { cx } from "@/utils/cx";

export function Avatar({
  name,
  photo,
  size = 40,
  dimmed = false,
  ring,
  className = "",
}: {
  name: string;
  photo?: string;
  size?: number;
  dimmed?: boolean;
  ring?: string; // ring color when selected
  /** Hook for context-specific sizing (e.g. landscape compaction). */
  className?: string;
}) {
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: size * 0.4,
    boxShadow: ring ? `0 0 0 2.5px ${ring}` : undefined,
  };
  // Initials are a name, so they're set in the serif like every name.
  const cls = cx(
    "flex shrink-0 items-center justify-center overflow-hidden rounded-full font-serif font-medium select-none",
    dimmed && "opacity-40 grayscale",
    className
  );

  if (photo) {
    return (
      <div className={cls} style={style}>
        <img src={photo} alt={name} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className={cx(cls, avatarClass(name))} style={style}>
      {initials(name)}
    </div>
  );
}

/** Read a file input into a downscaled base64 data URL (keeps localStorage small). */
export function fileToDataUrl(file: File, maxSize = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}
