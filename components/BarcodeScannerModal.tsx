"use client";
import { useState, useEffect, useRef, KeyboardEvent } from "react";
import type { MacroEntry } from "./DayTracker";

// BarcodeDetector is not yet in TS lib types
declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
}

type Phase = "starting" | "scanning" | "loading" | "result" | "fallback";

type FoodProduct = {
  name: string;
  servingSize: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  saturatedFat: number;
};

type Props = {
  onLog: (entry: MacroEntry) => void;
  onClose: () => void;
};

export default function BarcodeScannerModal({ onLog, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [phase, setPhase] = useState<Phase>("starting");
  const [product, setProduct] = useState<FoodProduct | null>(null);
  const [error, setError] = useState("");
  const [servings, setServings] = useState("1");
  const [logged, setLogged] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const [lookingUp, setLookingUp] = useState(false);

  useEffect(() => {
    initCamera();
    return stopCamera;
  }, []);

  async function initCamera() {
    if (!("BarcodeDetector" in window)) {
      setPhase("fallback");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setPhase("scanning");
      startScanning();
    } catch {
      setError("Camera access denied.");
      setPhase("fallback");
    }
  }

  function stopCamera() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  function startScanning() {
    const detector = new BarcodeDetector({
      formats: ["ean_13", "ean_8", "upc_a", "upc_e"],
    });
    intervalRef.current = setInterval(async () => {
      if (!videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes.length > 0) {
          clearInterval(intervalRef.current!);
          stopCamera();
          await lookupBarcode(codes[0].rawValue);
        }
      } catch { /* keep scanning */ }
    }, 400);
  }

  async function lookupBarcode(code: string) {
    setPhase("loading");
    setLookingUp(true);
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,nutriments,serving_size,serving_quantity`
      );
      const data = await res.json();
      if (data.status !== 1 || !data.product) {
        setError("Product not found. Enter the barcode manually below.");
        setPhase("fallback");
        return;
      }
      const p = data.product;
      const n = p.nutriments ?? {};
      const servingG = p.serving_quantity
        ? parseFloat(p.serving_quantity)
        : p.serving_size
        ? parseFloat(p.serving_size)
        : 100;
      const f = (servingG || 100) / 100;
      setProduct({
        name: p.product_name || "Unknown Product",
        servingSize: p.serving_size || "100g",
        calories: Math.round((n["energy-kcal_100g"] ?? 0) * f),
        protein: +((n.proteins_100g ?? 0) * f).toFixed(1),
        carbs: +((n.carbohydrates_100g ?? 0) * f).toFixed(1),
        fat: +((n.fat_100g ?? 0) * f).toFixed(1),
        fiber: +((n.fiber_100g ?? 0) * f).toFixed(1),
        sugar: +((n.sugars_100g ?? 0) * f).toFixed(1),
        sodium: Math.round((n.sodium_100g ?? 0) * f * 1000), // OFF stores sodium in g, convert to mg
        saturatedFat: +((n["saturated-fat_100g"] ?? 0) * f).toFixed(1),
      });
      setPhase("result");
    } catch {
      setError("Network error. Enter barcode manually.");
      setPhase("fallback");
    } finally {
      setLookingUp(false);
    }
  }

  async function handleManualLookup() {
    if (!manualBarcode.trim()) return;
    await lookupBarcode(manualBarcode.trim());
  }

  function handleLog() {
    if (!product) return;
    const mult = parseFloat(servings) || 1;
    onLog({
      name: `${product.name}${mult !== 1 ? ` ×${servings}` : ""}`,
      calories: Math.round(product.calories * mult),
      protein: +((product.protein * mult).toFixed(1)),
      carbs: +((product.carbs * mult).toFixed(1)),
      fat: +((product.fat * mult).toFixed(1)),
      fiber: +((product.fiber * mult).toFixed(1)),
      sugar: +((product.sugar * mult).toFixed(1)),
      sodium: Math.round(product.sodium * mult),
      saturatedFat: +((product.saturatedFat * mult).toFixed(1)),
    });
    setLogged(true);
    setTimeout(onClose, 1200);
  }

  function handleScanAgain() {
    setProduct(null);
    setError("");
    setLogged(false);
    setServings("1");
    setManualBarcode("");
    setPhase("starting");
    initCamera();
  }

  const macroChips = product
    ? [
        { label: "cal", value: product.calories, color: "bg-orange-50 text-orange-700" },
        { label: "protein", value: `${product.protein}g`, color: "bg-green-50 text-green-700" },
        { label: "carbs", value: `${product.carbs}g`, color: "bg-blue-50 text-blue-700" },
        { label: "fat", value: `${product.fat}g`, color: "bg-purple-50 text-purple-700" },
        { label: "fiber", value: `${product.fiber}g`, color: "bg-yellow-50 text-yellow-700" },
        { label: "sugar", value: `${product.sugar}g`, color: "bg-pink-50 text-pink-700" },
        { label: "sodium", value: `${product.sodium}mg`, color: "bg-red-50 text-red-700" },
        { label: "sat. fat", value: `${product.saturatedFat}g`, color: "bg-rose-50 text-rose-700" },
      ]
    : [];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-4 pb-4 sm:pb-0">
      <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Scan Barcode</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>

        {/* Camera view */}
        {(phase === "starting" || phase === "scanning") && (
          <div className="relative bg-black">
            <video ref={videoRef} className="w-full h-56 object-cover" playsInline muted />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-52 h-28 border-2 border-green-400 rounded-xl opacity-90" />
            </div>
            <p className="absolute bottom-3 left-0 right-0 text-center text-white/70 text-xs">
              {phase === "starting" ? "Starting camera..." : "Point camera at barcode"}
            </p>
          </div>
        )}

        {/* Loading */}
        {phase === "loading" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500">Looking up product...</p>
          </div>
        )}

        {/* Result */}
        {phase === "result" && product && (
          <div className="p-5">
            <p className="font-semibold text-slate-900 mb-0.5 leading-tight">{product.name}</p>
            <p className="text-xs text-slate-400 mb-4">Per serving · {product.servingSize}</p>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {macroChips.map(({ label, value, color }) => (
                <div key={label} className={`${color} rounded-xl p-2 text-center`}>
                  <div className="font-semibold text-sm leading-none">{value}</div>
                  <div className="text-xs opacity-70 mt-1">{label}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 mb-4">
              <label className="text-xs text-slate-500 shrink-0">Servings:</label>
              <input
                type="number"
                min="0.25"
                step="0.25"
                value={servings}
                onChange={(e) => setServings(e.target.value)}
                className="w-20 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                onClick={handleScanAgain}
                className="text-xs text-slate-400 hover:text-slate-600 ml-auto transition-colors"
              >
                Scan again
              </button>
            </div>

            <button
              onClick={handleLog}
              disabled={logged}
              className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${
                logged
                  ? "bg-green-100 text-green-700"
                  : "bg-green-600 text-white hover:bg-green-700"
              }`}
            >
              {logged ? "✓ Logged!" : "Log to today"}
            </button>
          </div>
        )}

        {/* Fallback: manual entry */}
        {phase === "fallback" && (
          <div className="p-5">
            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            {!error && (
              <p className="text-sm text-slate-500 mb-3">
                Live scanning isn&apos;t supported in this browser. Enter the barcode number from the product:
              </p>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 0012345678905"
                value={manualBarcode}
                onChange={(e) => setManualBarcode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && handleManualLookup()}
                className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                autoFocus
              />
              <button
                onClick={handleManualLookup}
                disabled={lookingUp || !manualBarcode.trim()}
                className="bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-60"
              >
                {lookingUp ? "..." : "Look up"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
