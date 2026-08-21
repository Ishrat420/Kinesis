export const DEFAULT_DOCUMENT_TYPES = [
  "Passport",
  "ID Card",
  "License",
  "Resume",
  "Birth Certificate",
  "Visa",
  "Contract",
  "Lease",
] as const;

export function formatDocumentType(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const defaultType = DEFAULT_DOCUMENT_TYPES.find(
    (type) => type.toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
  );

  return defaultType ?? `${trimmed.charAt(0).toLocaleUpperCase()}${trimmed.slice(1)}`;
}

export function isDefaultDocumentType(value: string) {
  return DEFAULT_DOCUMENT_TYPES.some(
    (type) => type.toLocaleLowerCase() === value.toLocaleLowerCase(),
  );
}
