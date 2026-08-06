"use client";

import { useState, type ReactNode } from "react";

/** Earlier legs of the route folded away behind a toggle; the history stays one click from view. */
export default function CollapsedRows({
  showLabel,
  hideLabel,
  columns,
  children,
}: {
  showLabel: string;
  hideLabel: string;
  columns: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr className="bg-surface-muted">
        <td colSpan={columns} className="py-1.5 text-center">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="text-accent text-xs font-medium hover:underline"
          >
            {open ? hideLabel : showLabel}
          </button>
        </td>
      </tr>
      {open && children}
    </>
  );
}
