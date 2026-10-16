# KD-016 — Automated Document Field Extraction

**Status:** In Progress — v1 built on `v1.5.0` for the spike (ADR-017)
**Priority:** High  
**Tags:** Security, Needs Research
**Planned Release:** v1.5.0

## Summary

Add optional automated document-field extraction to the Kinesis Documents module.

When a user uploads a document, Kinesis may use OCR, deterministic parsing, AI-assisted extraction, or a combination of these techniques to identify useful document metadata and suggest values for existing document fields.

Initial extraction should focus only on information necessary for document administration, such as:

- Document type
- Document ID / reference number
- Issue date
- Expiry date
- Issuing organisation / authority
- Document holder name, where required for identification
- Other explicitly supported document-management metadata

The extraction system must be designed around **data minimisation, user control, and verification**.

Automated results must never be treated as authoritative.

The user must review and confirm suggested values before they are persisted to the document.

---

## Product Principle

> Automation should remove typing, not remove user control.

Kinesis should help users populate a document quickly but design around the fact that both OCR and AI are not perfectly reliable.

The desired flow is:

```text
Upload document
      ↓
Extract relevant metadata
      ↓
Show suggestions
      ↓
User verifies / edits
      ↓
User confirms
      ↓
Save verified values
```

User should have the ability to turn off AI features as well if wanted. 

---

## Analysis

The first version is built: no AI and no file storage, with deterministic OCR and parsing run entirely in the browser, pre-filling the existing create form. How it was implemented, what testing on specimen documents changed, the security review and the known limits are in [ADR-017](../decisions/ADR-017-Client-Side-Document-Field-Extraction.md). Remaining: testing with the owner's own documents.
