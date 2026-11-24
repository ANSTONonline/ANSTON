"use client";

import { useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";

type EditorText = {
  editPhoto: string;
  crop: string;
  zoom: string;
  rotate: string;
  shapeOriginal: string;
  shapeSquare: string;
  shapeWide: string;
  shapeTall: string;
  cancel: string;
  savePhoto: string;
  saving: string;
  editFailed: string;
};

// Loads an image so it can be drawn on a canvas (photos already on Anston
// come from public storage, which allows this).
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Draws the chosen part of the photo, turned by `rotation` degrees, as a JPEG
// no larger than 1600px on its longest side.
async function renderCrop(src: string, area: Area, rotation: number): Promise<Blob> {
  const img = await loadImage(src);
  const rad = (rotation * Math.PI) / 180;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const turnedW = img.width * cos + img.height * sin;
  const turnedH = img.width * sin + img.height * cos;

  // First draw the whole photo turned, then cut out the crop.
  const turned = document.createElement("canvas");
  turned.width = Math.round(turnedW);
  turned.height = Math.round(turnedH);
  const tctx = turned.getContext("2d")!;
  tctx.translate(turnedW / 2, turnedH / 2);
  tctx.rotate(rad);
  tctx.drawImage(img, -img.width / 2, -img.height / 2);

  const scale = Math.min(1, 1600 / Math.max(area.width, area.height));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(area.width * scale));
  out.height = Math.max(1, Math.round(area.height * scale));
  out.getContext("2d")!.drawImage(turned, area.x, area.y, area.width, area.height, 0, 0, out.width, out.height);
  return new Promise<Blob>((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("crop failed"))), "image/jpeg", 0.88),
  );
}

// A full-screen editor: crop (choose a shape), zoom and rotate a photo.
export default function PhotoEditor({
  src,
  text,
  onCancel,
  onSave,
}: {
  src: string;
  text: EditorText;
  onCancel: () => void;
  onSave: (blob: Blob) => Promise<void> | void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [natural, setNatural] = useState<number | null>(null); // the photo's own shape
  const [aspect, setAspect] = useState<number | "original">("original");
  const [area, setArea] = useState<Area | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  // Close with Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const shapes: [number | "original", string][] = [
    ["original", text.shapeOriginal],
    [1, text.shapeSquare],
    [4 / 3, text.shapeWide],
    [3 / 4, text.shapeTall],
  ];
  const turnedNatural = natural && rotation % 180 !== 0 ? 1 / natural : natural;
  const currentAspect = aspect === "original" ? turnedNatural ?? 1 : aspect;

  async function save() {
    if (!area) return;
    setSaving(true);
    setFailed(false);
    try {
      await onSave(await renderCrop(src, area, rotation));
    } catch {
      setFailed(true);
      setSaving(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={text.editPhoto} className="fixed inset-0 z-50 bg-black/80 flex flex-col">
      <div className="relative flex-1 min-h-0">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={currentAspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={(_, px) => setArea(px)}
          onMediaLoaded={(m) => setNatural(m.naturalWidth / m.naturalHeight)}
          minZoom={1}
          maxZoom={4}
          zoomSpeed={0.2}
        />
      </div>
      <div className="bg-white p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium me-1">{text.crop}</span>
          {shapes.map(([value, name]) => (
            <button
              key={name}
              type="button"
              onClick={() => setAspect(value)}
              aria-pressed={aspect === value}
              className={`rounded-full px-3 py-1 text-sm border ${aspect === value ? "bg-[#7A1E2B] text-white border-[#7A1E2B]" : ""}`}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm flex-1 min-w-48">
            {text.zoom}
            <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-[#7A1E2B]" />
          </label>
          <button type="button" onClick={() => setRotation((r) => (r + 270) % 360)} className="border rounded-lg px-3 py-1.5 text-sm" aria-label={`${text.rotate} ⟲`}>⟲ {text.rotate}</button>
          <button type="button" onClick={() => setRotation((r) => (r + 90) % 360)} className="border rounded-lg px-3 py-1.5 text-sm" aria-label={`${text.rotate} ⟳`}>⟳ {text.rotate}</button>
        </div>
        {failed && <p role="alert" className="text-sm text-red-700">{text.editFailed}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="border rounded-lg px-4 py-2 text-sm">{text.cancel}</button>
          <button type="button" onClick={save} disabled={saving || !area} className="bg-[#7A1E2B] text-white rounded-lg px-4 py-2 text-sm font-medium">
            {saving ? text.saving : text.savePhoto}
          </button>
        </div>
      </div>
    </div>
  );
}
