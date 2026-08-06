"use client";

export default function PrintButton({ text }: { text: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="btn">
      {text}
    </button>
  );
}
