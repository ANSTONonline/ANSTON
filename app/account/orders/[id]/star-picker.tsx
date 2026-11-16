"use client";

import { useState } from "react";

// 1–5 star rating input. Uses real radio buttons, so it works with the
// keyboard and screen readers.
export default function StarPicker({ label, starsLabel }: { label: string; starsLabel: string }) {
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset>
      <legend className="text-sm mb-1">{label}</legend>
      <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className="cursor-pointer" onMouseEnter={() => setHover(n)}>
            <input
              type="radio"
              name="rating"
              value={n}
              required
              className="sr-only peer"
              checked={value === n}
              onChange={() => setValue(n)}
            />
            <span
              aria-hidden
              className={`text-3xl leading-none peer-focus-visible:outline peer-focus-visible:outline-2 rounded ${n <= shown ? "text-amber-500" : "text-gray-300"}`}
            >
              ★
            </span>
            <span className="sr-only">{starsLabel.replace("{n}", String(n))}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
