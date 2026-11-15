import type { ClauseWithFacts } from "@/lib/risk/types";

/**
 * Hand-written test fixture mirroring a high-risk contract.
 * Should trigger PAY-1, PAY-2, LIAB-1, IP-1, TERM-1, TERM-2, SCOPE-1, LAW-1, IND-1, and DEF-1.
 */
export const riskyContractClauses: ClauseWithFacts[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    document_id: "00000000-0000-4000-8000-000000000000",
    run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    clause_type: "payment",
    verbatim_text:
      "Client shall pay Contractor fees of 10,000 USD within ninety (90) calendar days following client's formal written acceptance of the deliverables. Client reserves the right to withhold any payment at its sole discretion.",
    page_number: 1,
    char_start: 0,
    char_end: 220,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {
      total_fee_amount: 10000,
      currency: "USD",
      days_to_pay: 90,
      payment_trigger: "acceptance",
      client_may_withhold: "yes",
    },
    facts_evidence:
      "Client shall pay Contractor fees of 10,000 USD within ninety (90) calendar days following client's formal written acceptance",
    facts_verified: true,
    facts_prompt_version: "v1",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    document_id: "00000000-0000-4000-8000-000000000000",
    run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    clause_type: "liability",
    verbatim_text:
      "Contractor's liability arising out of or related to this Agreement shall be unlimited and Contractor shall bear all damages.",
    page_number: 1,
    char_start: 230,
    char_end: 355,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {
      contractor_liability: "unlimited",
      cap_multiple_of_fees: null,
    },
    facts_evidence:
      "Contractor's liability arising out of or related to this Agreement shall be unlimited",
    facts_verified: true,
    facts_prompt_version: "v1",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    document_id: "00000000-0000-4000-8000-000000000000",
    run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    clause_type: "ip_ownership",
    verbatim_text:
      "All intellectual property rights in deliverables shall vest in Client immediately upon creation, irrespective of whether fees have been paid.",
    page_number: 2,
    char_start: 0,
    char_end: 142,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {
      transfer_timing: "on_creation",
      conditional_on_payment: "no",
    },
    facts_evidence:
      "rights in deliverables shall vest in Client immediately upon creation, irrespective of whether fees have been paid",
    facts_verified: true,
    facts_prompt_version: "v1",
  },
  {
    id: "44444444-4444-4444-8444-444444444444",
    document_id: "00000000-0000-4000-8000-000000000000",
    run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    clause_type: "termination",
    verbatim_text:
      "Client may terminate this Agreement for convenience immediately at any time with zero days notice. Upon termination, Contractor shall receive no payment for incomplete milestones.",
    page_number: 2,
    char_start: 150,
    char_end: 330,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {
      client_convenience_termination: "yes",
      notice_days: 0,
      payment_for_work_done: "none",
      handover_required: "yes",
    },
    facts_evidence:
      "Client may terminate this Agreement for convenience immediately at any time with zero days notice. Upon termination, Contractor shall receive no payment",
    facts_verified: true,
    facts_prompt_version: "v1",
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    document_id: "00000000-0000-4000-8000-000000000000",
    run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    clause_type: "scope_change",
    verbatim_text:
      "Client may request scope changes verbally without written change order, and Contractor agrees to perform all extra work without additional fee.",
    page_number: 3,
    char_start: 0,
    char_end: 145,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {
      written_change_order_required: "no",
      extra_work_without_additional_fee: "yes",
    },
    facts_evidence:
      "request scope changes verbally without written change order, and Contractor agrees to perform all extra work without additional fee",
    facts_verified: true,
    facts_prompt_version: "v1",
  },
  {
    id: "66666666-6666-4666-8666-666666666666",
    document_id: "00000000-0000-4000-8000-000000000000",
    run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    clause_type: "governing_law",
    verbatim_text:
      "This Agreement is governed by the laws of California, USA. Any dispute shall be settled by binding arbitration seated in San Francisco, California.",
    page_number: 3,
    char_start: 150,
    char_end: 298,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {
      governing_law_name: "California, USA",
      foreign_to_bangladesh: "yes",
      dispute_forum: "arbitration",
      seat: "San Francisco",
    },
    facts_evidence:
      "governed by the laws of California, USA. Any dispute shall be settled by binding arbitration seated in San Francisco",
    facts_verified: true,
    facts_prompt_version: "v1",
  },
  {
    id: "77777777-7777-4777-8777-777777777777",
    document_id: "00000000-0000-4000-8000-000000000000",
    run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    clause_type: "indemnity",
    verbatim_text:
      "Contractor shall indemnify, defend, and hold harmless Client against any and all claims, liabilities, and losses whatsoever.",
    page_number: 3,
    char_start: 310,
    char_end: 435,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {
      indemnifying_party: "contractor",
      scope: "broad",
      references_defined_losses: "yes",
    },
    facts_evidence:
      "Contractor shall indemnify, defend, and hold harmless Client against any and all claims, liabilities, and losses whatsoever",
    facts_verified: true,
    facts_prompt_version: "v1",
  },
  {
    id: "88888888-8888-4888-8888-888888888888",
    document_id: "00000000-0000-4000-8000-000000000000",
    run_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    clause_type: "definition",
    verbatim_text:
      "Losses means all direct, indirect, special, incidental, punitive, or consequential damages of every kind.",
    page_number: 3,
    char_start: 440,
    char_end: 545,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {
      defined_term: "Losses",
      includes_indirect_or_consequential_losses: "yes",
      client_sole_discretion_acceptance: "unspecified",
    },
    facts_evidence:
      "Losses means all direct, indirect, special, incidental, punitive, or consequential damages",
    facts_verified: true,
    facts_prompt_version: "v1",
  },
];

/**
 * Hand-written test fixture mirroring a balanced, freelancer-friendly contract.
 * Under DEFAULT_PLAYBOOK, this should produce ZERO findings.
 */
export const balancedContractClauses: ClauseWithFacts[] = [
  {
    id: "91111111-1111-4111-8111-111111111111",
    document_id: "00000000-0000-4000-8000-000000000000",
    run_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    clause_type: "payment",
    verbatim_text:
      "Client shall pay Contractor fees within fifteen (15) calendar days following receipt of Contractor's invoice.",
    page_number: 1,
    char_start: 0,
    char_end: 110,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {
      total_fee_amount: 5000,
      currency: "BDT",
      days_to_pay: 15,
      payment_trigger: "invoice_receipt",
      client_may_withhold: "no",
    },
    facts_evidence:
      "Client shall pay Contractor fees within fifteen (15) calendar days following receipt of Contractor's invoice",
    facts_verified: true,
    facts_prompt_version: "v1",
  },
  {
    id: "92222222-2222-4222-8222-222222222222",
    document_id: "00000000-0000-4000-8000-000000000000",
    run_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    clause_type: "liability",
    verbatim_text:
      "Each party's aggregate liability under this Agreement shall be capped at 1.0 times total fees paid.",
    page_number: 1,
    char_start: 120,
    char_end: 220,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {
      contractor_liability: "capped",
      cap_multiple_of_fees: 1.0,
    },
    facts_evidence:
      "aggregate liability under this Agreement shall be capped at 1.0 times total fees paid",
    facts_verified: true,
    facts_prompt_version: "v1",
  },
  {
    id: "93333333-3333-4333-8333-333333333333",
    document_id: "00000000-0000-4000-8000-000000000000",
    run_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    clause_type: "ip_ownership",
    verbatim_text:
      "Ownership of deliverables shall transfer to Client only upon receipt of full payment of all agreed fees.",
    page_number: 2,
    char_start: 0,
    char_end: 105,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {
      transfer_timing: "on_full_payment",
      conditional_on_payment: "yes",
    },
    facts_evidence:
      "Ownership of deliverables shall transfer to Client only upon receipt of full payment",
    facts_verified: true,
    facts_prompt_version: "v1",
  },
  {
    id: "94444444-4444-4444-8444-444444444444",
    document_id: "00000000-0000-4000-8000-000000000000",
    run_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    clause_type: "termination",
    verbatim_text:
      "Either party may terminate this Agreement for convenience upon thirty (30) days written notice. In the event of termination, Contractor shall receive full payment for all work performed up to the termination date.",
    page_number: 2,
    char_start: 110,
    char_end: 330,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {
      client_convenience_termination: "yes",
      notice_days: 30,
      payment_for_work_done: "full",
      handover_required: "yes",
    },
    facts_evidence:
      "convenience upon thirty (30) days written notice. In the event of termination, Contractor shall receive full payment",
    facts_verified: true,
    facts_prompt_version: "v1",
  },
  {
    id: "95555555-5555-4555-8555-555555555555",
    document_id: "00000000-0000-4000-8000-000000000000",
    run_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    clause_type: "scope_change",
    verbatim_text:
      "Any change to the scope of work must be agreed in a written change order signed by both parties specifying additional fees.",
    page_number: 3,
    char_start: 0,
    char_end: 125,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {
      written_change_order_required: "yes",
      extra_work_without_additional_fee: "no",
    },
    facts_evidence:
      "change to the scope of work must be agreed in a written change order signed by both parties",
    facts_verified: true,
    facts_prompt_version: "v1",
  },
  {
    id: "96666666-6666-4666-8666-666666666666",
    document_id: "00000000-0000-4000-8000-000000000000",
    run_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    clause_type: "governing_law",
    verbatim_text:
      "This Agreement shall be governed by and construed in accordance with the laws of Bangladesh, and disputes shall be heard in the courts of Dhaka.",
    page_number: 3,
    char_start: 130,
    char_end: 275,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {
      governing_law_name: "Laws of Bangladesh",
      foreign_to_bangladesh: "no",
      dispute_forum: "courts",
      seat: "Dhaka",
    },
    facts_evidence:
      "governed by and construed in accordance with the laws of Bangladesh, and disputes shall be heard in the courts of Dhaka",
    facts_verified: true,
    facts_prompt_version: "v1",
  },
  {
    id: "97777777-7777-4777-8777-777777777777",
    document_id: "00000000-0000-4000-8000-000000000000",
    run_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    clause_type: "indemnity",
    verbatim_text:
      "The parties agree to mutual indemnification strictly limited to direct damages arising from gross negligence.",
    page_number: 3,
    char_start: 280,
    char_end: 390,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {
      indemnifying_party: "mutual",
      scope: "limited",
      references_defined_losses: "no",
    },
    facts_evidence:
      "mutual indemnification strictly limited to direct damages arising from gross negligence",
    facts_verified: true,
    facts_prompt_version: "v1",
  },
  {
    id: "98888888-8888-4888-8888-888888888888",
    document_id: "00000000-0000-4000-8000-000000000000",
    run_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    clause_type: "definition",
    verbatim_text:
      "Losses shall include only direct verified out-of-pocket costs and explicitly excludes indirect and consequential losses.",
    page_number: 3,
    char_start: 400,
    char_end: 520,
    verbatim_verified: true,
    extraction_confidence: "high",
    page_mismatch: false,
    facts: {
      defined_term: "Losses",
      includes_indirect_or_consequential_losses: "no",
      client_sole_discretion_acceptance: "no",
    },
    facts_evidence:
      "include only direct verified out-of-pocket costs and explicitly excludes indirect and consequential losses",
    facts_verified: true,
    facts_prompt_version: "v1",
  },
];
