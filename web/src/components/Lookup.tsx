import { type FormEvent, useId, useState } from "react";
import { useNavigate } from "react-router";

interface Props {
  /** The PDGA number being shown; collapses the form to a one-line summary. */
  current?: string;
  /** Start with the form open even when a number is shown (e.g. after an error). */
  open?: boolean;
  /** Id of a message elsewhere on the page that describes the input, e.g. an error. */
  describedBy?: string;
}

export default function Lookup({ current, open = false, describedBy }: Props) {
  const [editing, setEditing] = useState(!current || open);
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const inputId = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    const pdgaNo = value.trim().replace(/^#/, "");
    if (!/^\d+$/.test(pdgaNo)) {
      setError("Enter a PDGA number, like 167210.");
      return;
    }
    setError(null);
    setEditing(false);
    navigate(`/player/${pdgaNo}`);
  }

  if (!editing && current) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        aria-label={`Change PDGA number, currently ${current}`}
        className="flex min-h-11 w-full items-center border-b border-rule text-left text-ui text-muted"
      >
        PDGA #{current}&nbsp;·&nbsp;
        <span className="text-text underline decoration-highlight underline-offset-[3px]">
          change
        </span>
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="border-b border-rule py-6" noValidate>
      <label htmlFor={inputId} className="label mb-2 block">
        PDGA number
      </label>
      <div className="flex gap-2">
        <input
          id={inputId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          // biome-ignore lint/a11y/noAutofocus: the lookup is the page's only task
          autoFocus
          placeholder="e.g. 167210"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : describedBy}
          className="min-h-11 w-40 rounded-sm border border-rule bg-surface px-3 text-ui text-text placeholder:text-muted focus-visible:outline-2 focus-visible:outline-highlight"
        />
        <button
          type="submit"
          className="min-h-11 rounded-sm bg-text px-4 text-ui font-medium text-bg transition-opacity duration-150 ease-out hover:opacity-90"
        >
          Look up
        </button>
      </div>
      {error && (
        <p id={`${inputId}-error`} className="mt-2 text-ui text-muted">
          {error}
        </p>
      )}
    </form>
  );
}
