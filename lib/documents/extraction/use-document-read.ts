"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDateInput } from "@/lib/dates";
import { useFormatPreferences, useToday } from "@/lib/format/context";
import type { FileReading } from "./suggest";
import type { ExtractionFailure, ExtractionStage } from "./read-document";

export const READ_STAGE_LABEL: Record<ExtractionStage, string> = {
  opening: "Opening your file…",
  "reading-text": "Reading the document…",
  "loading-ocr": "Getting the text reader ready… (first time only, can take a moment)",
  recognising: "Reading the text… this can take a few seconds",
};

export const READ_FAILURE_MESSAGE: Record<ExtractionFailure, string> = {
  "too-large": "That file is over 10 MB. Try a smaller photo or scan, or fill the details in yourself.",
  "too-many-pixels": "That image is larger than any camera photo (over 60 megapixels), so it wasn't opened.",
  unsupported: "That isn't a PDF, PNG or JPEG file.",
  unreadable: "We couldn't read that file.",
};

export type DocumentRead =
  | { status: "idle" }
  | { status: "reading"; stage: ExtractionStage }
  | { status: "read"; reading: FileReading }
  | { status: "failed"; failure: ExtractionFailure };

/**
 * Reads a picked file on the device (KD-016, ADR-017), for the Upload dialog
 * and the capture box (KD-057) alike. The extraction code loads only when a
 * read starts; a read in progress stops when `cancel` is called, a new read
 * starts, or the component using this unmounts.
 */
export function useDocumentRead() {
  const { locale } = useFormatPreferences();
  const today = formatDateInput(useToday());
  const [state, setState] = useState<DocumentRead>({ status: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: "idle" });
  }, []);

  const read = useCallback(async (file: File) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: "reading", stage: "opening" });
    try {
      const { readDocument } = await import("./read-document");
      const reading = await readDocument(file, {
        locale,
        today,
        signal: controller.signal,
        onStage: (stage) => { if (!controller.signal.aborted) setState({ status: "reading", stage }); },
      });
      if (!controller.signal.aborted) setState({ status: "read", reading });
    } catch (error) {
      if (controller.signal.aborted) return;
      const { ExtractionError } = await import("./read-document");
      setState({ status: "failed", failure: error instanceof ExtractionError ? error.reason : "unreadable" });
    }
  }, [locale, today]);

  return { state, read, cancel };
}
