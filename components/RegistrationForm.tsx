"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { processPhoto, MAX_FILE_BYTES } from "@/lib/photo";
import { strings } from "@/lib/strings";
import type { RegistrationInsert } from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A Supabase storage "Duplicate" error means the object already landed. */
function isDuplicate(err: unknown): boolean {
  const msg = (err as { message?: string })?.message?.toLowerCase() ?? "";
  return msg.includes("already exists") || msg.includes("duplicate");
}

export default function RegistrationForm() {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneName, setDoneName] = useState<string | null>(null);

  // Guards against a double-fire of the submit handler (fast double-tap on
  // mobile, where setSubmitting hasn't disabled the button yet).
  const submitLock = useRef(false);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      // Some HEIC files report an empty type — allow those through, reject the rest.
      if (file.type !== "") {
        setError(strings.form.errorPhotoNotImage);
        return;
      }
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(strings.form.errorPhotoTooLarge);
      return;
    }

    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!photoFile) {
      setError(strings.form.errorRequiredPhoto);
      return;
    }
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !phone.trim()) {
      setError(strings.form.errorRequiredFields);
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError(strings.form.errorEmail);
      return;
    }

    // Ignore re-entrant calls (double-tap / resend) so the same photo isn't
    // uploaded to the same path twice (which would 400 as a duplicate).
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      // 1. Process + upload the photo, retrying on transient failures so a
      //    flaky venue connection self-heals. The insert must NOT run unless
      //    the photo actually landed. A fresh key per attempt means a retry can
      //    never collide with a previous (possibly half-completed) attempt.
      const processed = await processPhoto(photoFile);

      let uploadedPath: string | null = null;
      let lastUploadError: unknown = null;
      const UPLOAD_ATTEMPTS = 4;

      for (let attempt = 0; attempt < UPLOAD_ATTEMPTS; attempt++) {
        const path = `${Date.now()}-${crypto.randomUUID()}.${processed.ext}`;
        try {
          const { error: uploadError } = await supabase.storage
            .from("photos")
            .upload(path, processed.blob, {
              contentType: processed.contentType,
              upsert: true,
            });

          if (!uploadError || isDuplicate(uploadError)) {
            uploadedPath = path;
            break;
          }
          lastUploadError = uploadError;
        } catch (e) {
          lastUploadError = e;
        }
        // Back off before the next try: 0.4s, 0.8s, 1.6s.
        if (attempt < UPLOAD_ATTEMPTS - 1) await sleep(400 * 2 ** attempt);
      }

      if (!uploadedPath) {
        void lastUploadError;
        setError(strings.form.errorUpload);
        setSubmitting(false);
        submitLock.current = false;
        return;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("photos").getPublicUrl(uploadedPath);

      // 2. Insert the registration row, also with a couple of retries.
      const row: RegistrationInsert = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        phone: phone.replace(/\s+/g, ""),
        photo_url: publicUrl,
      };

      let inserted = false;
      const INSERT_ATTEMPTS = 3;
      for (let attempt = 0; attempt < INSERT_ATTEMPTS; attempt++) {
        try {
          const { error: insertError } = await supabase
            .from("registrations")
            .insert(row);
          if (!insertError) {
            inserted = true;
            break;
          }
        } catch {
          // fall through to retry
        }
        if (attempt < INSERT_ATTEMPTS - 1) await sleep(400 * 2 ** attempt);
      }

      if (!inserted) {
        setError(strings.form.errorSubmit);
        setSubmitting(false);
        submitLock.current = false;
        return;
      }

      // Success — preserve nothing to reset; we swap to the confirmation view.
      setDoneName(firstName.trim());
    } catch {
      // Network or unexpected error — keep every entered value for retry.
      setError(strings.form.errorSubmit);
      setSubmitting(false);
      submitLock.current = false;
    }
  }

  if (doneName) {
    return (
      <div className="text-center py-6">
        <div className="mx-auto mb-6 h-14 w-14 rounded-full border border-gold flex items-center justify-center">
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7 text-gold"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="font-serif text-3xl text-cream mb-3">
          {strings.form.successTitle}
        </h2>
        <p className="text-cream-dim">
          {strings.form.successBody.replace("{name}", doneName)}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {/* Circular photo upload */}
      <div className="flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="group relative h-32 w-32 rounded-full border border-gold/60 overflow-hidden bg-charcoal-soft flex items-center justify-center transition hover:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          aria-label={strings.form.photoLabel}
        >
          {photoPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoPreview}
              alt="Selected"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex flex-col items-center text-cream-dim px-3 text-center">
              <svg
                viewBox="0 0 24 24"
                className="h-7 w-7 mb-1 text-gold"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 9a2 2 0 012-2h1.5l1-1.5h5l1 1.5H19a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <circle cx="12" cy="13" r="3.2" />
              </svg>
              <span className="text-xs leading-tight">
                {strings.form.photoHint}
              </span>
            </span>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handlePhotoChange}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-cream-dim mb-1.5">
            {strings.form.firstName}
          </label>
          <input
            className="field"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
            disabled={submitting}
          />
        </div>
        <div>
          <label className="block text-sm text-cream-dim mb-1.5">
            {strings.form.lastName}
          </label>
          <input
            className="field"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
            disabled={submitting}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm text-cream-dim mb-1.5">
          {strings.form.email}
        </label>
        <input
          className="field"
          type="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          disabled={submitting}
        />
      </div>

      <div>
        <label className="block text-sm text-cream-dim mb-1.5">
          {strings.form.phone}
        </label>
        <input
          className="field"
          type="tel"
          inputMode="tel"
          placeholder={strings.form.phonePlaceholder}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="tel"
          disabled={submitting}
        />
      </div>

      {error && (
        <p className="text-sm text-danger text-center" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-gold text-charcoal font-medium py-3 transition hover:bg-gold-soft disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting && (
          <svg
            className="h-4 w-4 animate-spin text-charcoal"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z"
            />
          </svg>
        )}
        {submitting ? strings.form.submitting : strings.form.submit}
      </button>
    </form>
  );
}
