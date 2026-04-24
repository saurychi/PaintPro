"use client";

import { X, Plus, Loader2 } from "lucide-react";
import { PhoneCountryPicker } from "@/components/PhoneCountryPicker";

const ACCENT = "#00c065";
const ACCENT_HOVER = "#00a054";
const BORDER = "border border-gray-200";

type CountryCallingCodeOption = {
  country: string;
  calling_code: string;
};

type CreateClientModalProps = {
  open: boolean;
  creatingClient: boolean;
  fullName: string;
  email: string;
  phone: string;
  phoneCountry: string;
  address: string;
  notes: string;
  phoneCountryOptions: CountryCallingCodeOption[];
  onClose: () => void;
  onSubmit: () => void;
  onFullNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onPhoneCountryChange: (value: string) => void;
  onAddressChange: (value: string) => void;
  onNotesChange: (value: string) => void;
};

export default function CreateClientModal({
  open,
  creatingClient,
  fullName,
  email,
  phone,
  phoneCountry,
  address,
  notes,
  phoneCountryOptions,
  onClose,
  onSubmit,
  onFullNameChange,
  onEmailChange,
  onPhoneChange,
  onPhoneCountryChange,
  onAddressChange,
  onNotesChange,
}: CreateClientModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Create New Client
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Add a new client record, then auto-fill it into this project.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-[11px] font-medium text-gray-600">
              Client Name
            </label>
            <input
              value={fullName}
              onChange={(e) => onFullNameChange(e.target.value)}
              placeholder="Enter client name"
              className={`mt-2 w-full rounded-md border ${BORDER} bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2`}
              style={{ ["--tw-ring-color" as any]: ACCENT }}
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-gray-600">
              Client Email
            </label>
            <input
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="Enter client email"
              className={`mt-2 w-full rounded-md border ${BORDER} bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2`}
              style={{ ["--tw-ring-color" as any]: ACCENT }}
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-gray-600">
              Client Phone
            </label>

            <div className="mt-2 grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                <div className="min-w-0">
                    <PhoneCountryPicker
                    value={phoneCountry}
                    options={phoneCountryOptions}
                    onChange={onPhoneCountryChange}
                    />
                </div>

                <div
                    className={`flex h-[42px] min-w-0 w-full items-center overflow-hidden rounded-md border ${BORDER} bg-white focus-within:ring-2`}
                    style={{ ["--tw-ring-color" as any]: ACCENT }}
                >
                    <span className="shrink-0 px-3 text-sm text-gray-500">
                    {phoneCountry}
                    </span>

                    <span className="h-5 w-px shrink-0 bg-gray-200" />

                    <input
                    value={phone.startsWith(phoneCountry) ? phone.slice(phoneCountry.length) : phone}
                    onChange={(e) =>
                        onPhoneChange(`${phoneCountry}${e.target.value.replace(/^\+/, "")}`)
                    }
                    placeholder="000-000-0000"
                    className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none"
                    />
                </div>
                </div>
          </div>

          <div className="sm:col-span-2">
            <label className="text-[11px] font-medium text-gray-600">
              Address
            </label>
            <textarea
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder="Enter client address"
              className={`mt-2 min-h-[96px] w-full resize-none rounded-md border ${BORDER} bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2`}
              style={{ ["--tw-ring-color" as any]: ACCENT }}
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-[11px] font-medium text-gray-600">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Optional notes"
              className={`mt-2 min-h-[90px] w-full resize-none rounded-md border ${BORDER} bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2`}
              style={{ ["--tw-ring-color" as any]: ACCENT }}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={creatingClient}
            className={`inline-flex items-center gap-2 rounded-lg ${BORDER} bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60`}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={creatingClient}
            className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: ACCENT }}
            onMouseEnter={(e) => {
              if (!creatingClient) {
                e.currentTarget.style.backgroundColor = ACCENT_HOVER;
              }
            }}
            onMouseLeave={(e) => {
              if (!creatingClient) {
                e.currentTarget.style.backgroundColor = ACCENT;
              }
            }}
          >
            {creatingClient ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            <span>{creatingClient ? "Creating..." : "Create Client"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
