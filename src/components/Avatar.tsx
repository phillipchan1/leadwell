import { avatarColor, initials } from "../lib/derive";

export function Avatar({
  name,
  photo,
  size = 40,
  dimmed = false,
  ring,
}: {
  name: string;
  photo?: string;
  size?: number;
  dimmed?: boolean;
  ring?: string; // ring color when selected
}) {
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: size * 0.38,
    boxShadow: ring ? `0 0 0 2.5px ${ring}` : undefined,
  };
  const cls = `flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white select-none ${
    dimmed ? "opacity-40 grayscale" : ""
  }`;

  if (photo) {
    return (
      <div className={cls} style={style}>
        <img src={photo} alt={name} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className={cls} style={{ ...style, backgroundColor: avatarColor(name) }}>
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
