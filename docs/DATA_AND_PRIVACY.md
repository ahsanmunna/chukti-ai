# Data & Privacy Specification

> **Status:** Active (Production / MVP).

This document outlines the data lifecycle, security boundaries, and privacy model for Chukti AI.

---

## 1. Current Data Flow & Third-Party Processing

* **PDF Text Extraction:** Contract PDFs uploaded by users are processed in-memory via `unpdf` to extract page-by-page text.
* **LLM Analysis:** Extracted contract text is sent directly to the **Google Gemini API (`gemini-3.6-flash`)** for two-stage extraction:
  1. Clause extraction (Stage 1)
  2. Structured fact extraction (Stage 2)
* **Free Tier Notice:** The current prototype operates on Google Gemini's free tier, where Google may use submitted prompt text to improve its products. The application surfaces an explicit in-app warning informing users **not to upload confidential contracts or agreements subject to active Non-Disclosure Agreements (NDAs)**.
* **Synthetic Demo Data:** All development, testing, and demo contracts in this repository (`tests/contracts/`) are **synthetic agreements** created strictly for evaluation and research. No real client contracts were used.

---

## 2. Storage & Database Security

* **Database:** Document metadata, extracted page text, verbatim clauses, extraction runs, and playbook preferences are stored in a **Supabase PostgreSQL** database.
* **Row-Level Security (RLS):** All database tables have Row-Level Security enabled with a deny-by-default policy.
* **Credential Isolation:** The Supabase `service_role` key and the `GEMINI_API_KEY` are strictly server-side environment variables and are never exposed to the client or browser bundle.

---

## 3. Privacy Roadmap (Planned — NOT Implemented)

To support confidential commercial contracts and NDA-governed client work without cloud exposure, the following privacy features are planned for future releases:

1. **Local / On-Device LLM Inference:** Running open-weight models (such as Llama 3.1 or Qwen 2.5 via local runtimes like Ollama or llama.cpp) directly on the user's machine so that zero bytes of contract text leave the workstation.
2. **Paid Enterprise API Tier:** Transitioning commercial cloud users to an enterprise zero-data-retention tier where model training on submitted customer payloads is legally barred.
3. **Local Data Residence:** Configurable local data persistence options tailored to Bangladeshi legal and compliance frameworks.
