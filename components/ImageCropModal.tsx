"use client";
import { useState, useCallback } from "react";
import Cropper, { Area, Point } from "react-easy-crop";

async function getCroppedImg(src: string, pixelCrop: Area): Promise<Blob> {
  const img = new Image();
  img.src = src;
  await new Promise<void>((resolve) => { img.onload = () => resolve(); });
  const canvas = document.createElement("canvas");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  canvas.getContext("2d")!.drawImage(
    img,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, pixelCrop.width, pixelCrop.height
  );
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.9));
}

type Props = {
  imageSrc: string;
  onApply: (blob: Blob) => void;
  onCancel: () => void;
};

export default function ImageCropModal({ imageSrc, onApply, onCancel }: Props) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [applying, setApplying] = useState(false);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  async function handleApply() {
    if (!croppedAreaPixels) return;
    setApplying(true);
    const blob = await getCroppedImg(imageSrc, croppedAreaPixels);
    onApply(blob);
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex flex-col items-center justify-center z-[60] px-4">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden shadow-xl">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Crop Photo</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>

        {/* Crop area */}
        <div className="relative w-full bg-black" style={{ height: 300 }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        {/* Zoom slider */}
        <div className="px-5 py-3 flex items-center gap-3">
          <span className="text-xs text-slate-400">−</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-green-600"
          />
          <span className="text-xs text-slate-400">+</span>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={applying}
            className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-60"
          >
            {applying ? "Applying..." : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
