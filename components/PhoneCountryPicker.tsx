"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronDown } from "lucide-react";

type CountryCallingCodeOption = {
  country: string;
  calling_code: string;
};

type PhoneCountryPickerProps = {
  value: string;
  options: CountryCallingCodeOption[];
  onChange: (callingCode: string) => void;
};

export function PhoneCountryPicker({
  value,
  options,
  onChange,
}: PhoneCountryPickerProps) {
  const [open, setOpen] = useState(false);
  const [typedBuffer, setTypedBuffer] = useState("");
  const clearBufferTimeoutRef = useRef<number | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const selected =
    options.find((item) => item.calling_code === value) ?? null;

  const normalizedOptions = useMemo(() => {
    return options.map((item) => ({
      ...item,
      searchableLabel: `${item.country} ${item.calling_code}`.toLowerCase(),
    }));
  }, [options]);

  useEffect(() => {
    if (!open) {
      setTypedBuffer("");
      if (clearBufferTimeoutRef.current) {
        window.clearTimeout(clearBufferTimeoutRef.current);
        clearBufferTimeoutRef.current = null;
      }
    }
  }, [open]);

  function resetBufferTimer(nextValue: string) {
    setTypedBuffer(nextValue);

    if (clearBufferTimeoutRef.current) {
      window.clearTimeout(clearBufferTimeoutRef.current);
    }

    clearBufferTimeoutRef.current = window.setTimeout(() => {
      setTypedBuffer("");
      clearBufferTimeoutRef.current = null;
    }, 700);
  }

  function scrollToOption(callingCode: string) {
    const node = itemRefs.current[callingCode];
    if (!node) return;

    node.scrollIntoView({
      block: "nearest",
    });
  }

  function handleTypeaheadSearch(rawKey: string) {
    if (!rawKey || rawKey.length !== 1) return;

    const nextBuffer = `${typedBuffer}${rawKey.toLowerCase()}`;
    resetBufferTimer(nextBuffer);

    const match =
      normalizedOptions.find((item) =>
        item.searchableLabel.startsWith(nextBuffer)
      ) ??
      normalizedOptions.find((item) =>
        item.country.toLowerCase().startsWith(nextBuffer)
      );

    if (!match) return;

    scrollToOption(match.calling_code);
  }

  function handleListKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      return;
    }

    if (e.key === "Enter" || e.key === "Escape" || e.key === "Tab") {
      return;
    }

    if (e.key === "Backspace") {
      e.preventDefault();
      const nextBuffer = typedBuffer.slice(0, -1);
      resetBufferTimer(nextBuffer);
      return;
    }

    if (e.key.length === 1 && /[a-zA-Z+\s]/.test(e.key)) {
      e.preventDefault();
      handleTypeaheadSearch(e.key);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-[42px] w-[92px] justify-between rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-gray-900 shadow-none hover:bg-white"
        >
          <span className="truncate">{selected?.calling_code ?? value}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="z-[70] w-[200px] rounded-md border border-gray-200 bg-white p-1 shadow-md"
        >
        <div
          ref={listContainerRef}
          tabIndex={0}
          onKeyDown={handleListKeyDown}
          className="max-h-64 overflow-y-auto outline-none"
        >
          {normalizedOptions.map((country) => {
            const isSelected = country.calling_code === value;

            return (
              <button
                key={`${country.country}-${country.calling_code}`}
                ref={(node) => {
                  itemRefs.current[country.calling_code] = node;
                }}
                type="button"
                onClick={() => {
                  onChange(country.calling_code);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
              >
                <span>
                  {country.country} ({country.calling_code})
                </span>

                {isSelected ? <Check className="h-4 w-4" /> : null}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
