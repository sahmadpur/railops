"use client";

import { useId, useState } from "react";

export type SearchOption = { id: number | string; text: string };

/**
 * A select you can type into: the browser's own datalist popup does the searching and shows
 * only what matches, and the picked label is mapped back to its id in a hidden input.
 * Same pattern as the train picker in NewTurnaroundForm.
 */
export default function SearchSelect({
  name,
  options,
  defaultId = null,
  placeholder,
  ariaLabel,
  disabled = false,
  required = false,
  noMatchText,
  className = "field w-auto min-w-[130px]",
}: {
  name: string;
  options: SearchOption[];
  defaultId?: number | string | null;
  placeholder: string;
  ariaLabel?: string;
  disabled?: boolean;
  required?: boolean;
  /** Shown when the typed text matches no option. */
  noMatchText?: string;
  className?: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState(
    () => options.find((o) => String(o.id) === String(defaultId ?? ""))?.text ?? "",
  );
  const idByText = new Map(options.map((o) => [o.text, o.id]));
  const trimmed = query.trim();
  const selectedId = idByText.get(trimmed) ?? "";
  // Only search results are offered: an empty box shows no popup wall, typing narrows the list.
  // ponytail: capped at 10 matches; raise if a registry ever needs deeper scanning by eye.
  const matches =
    trimmed === ""
      ? []
      : options.filter((o) => o.text.toLowerCase().includes(trimmed.toLowerCase())).slice(0, 10);

  return (
    <>
      <input
        list={listId}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        disabled={disabled}
        required={required}
        className={className}
      />
      <datalist id={listId}>
        {matches.map((o) => (
          <option key={o.id} value={o.text} />
        ))}
      </datalist>
      <input type="hidden" name={name} value={selectedId} />
      {noMatchText && trimmed !== "" && selectedId === "" && (
        <span role="alert" className="text-danger mt-1 block text-xs">
          {noMatchText}
        </span>
      )}
    </>
  );
}
