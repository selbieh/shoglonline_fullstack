"use client";

import { useEffect, useState } from "react";
import { COUNTRIES, DEFAULT_DIAL, joinPhone, splitPhone } from "@/lib/countries";
import { digitsOnly } from "@/lib/arabic";

/* Shared phone input: a country-code dropdown (Israel excluded — see lib/countries) + the local
   number. Fully controlled — `value` is the canonical "+<cc><digits>" string the backend stores,
   and `onChange` emits the same. Used everywhere the platform takes a phone or WhatsApp number
   (OTP verification, the private contact channel, Instapay payout). The dial code is kept in local
   state so clearing the number never loses the chosen country. */
export default function PhoneField({
  value,
  onChange,
  placeholder = "5XXXXXXXX",
  ariaLabel = "رقم الهاتف",
  defaultDial = DEFAULT_DIAL,
  disabled,
  className = "flex-1",
}: {
  value: string;
  onChange: (full: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  defaultDial?: string;
  disabled?: boolean;
  className?: string;
}) {
  const incoming = splitPhone(value, defaultDial);
  const [dial, setDial] = useState(incoming.dial);
  const number = incoming.number;

  // Re-sync the dial when an externally-supplied value carries an explicit (different) country code
  // — e.g. an async profile load. A cleared value ("") leaves the chosen dial in place.
  useEffect(() => {
    if (value && String(value).startsWith("+") && incoming.dial !== dial) {
      setDial(incoming.dial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={`flex flex-wrap gap-2 ${className}`} dir="ltr">
      <select
        className="field w-40 shrink-0"
        value={dial}
        disabled={disabled}
        aria-label="رمز الدولة"
        onChange={(e) => {
          setDial(e.target.value);
          onChange(joinPhone(e.target.value, number));
        }}
      >
        {COUNTRIES.map((c) => (
          <option key={c.iso} value={c.dial}>
            {c.ar} ({c.dial})
          </option>
        ))}
      </select>
      <input
        className="field min-w-[8rem] flex-1"
        inputMode="tel"
        dir="ltr"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={number}
        disabled={disabled}
        onChange={(e) => onChange(joinPhone(dial, digitsOnly(e.target.value)))}
      />
    </div>
  );
}
