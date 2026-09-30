# AI Lead Intelligence & Supplier Copilot — Gemini Edition

A B2B AI prototype that converts unstructured buyer enquiries into structured requirements, scores lead quality, retrieves relevant catalogue products using embeddings/vector similarity, and generates a grounded supplier reply.

## AI stack
- Google Gemini 2.5 Flash-Lite — structured extraction + grounded response generation
- Gemini Embedding 001 — text embeddings
- Cosine similarity — vector retrieval over the local product catalogue
- Deterministic business rules — explainable lead score
- Node.js — backend/API
- HTML/CSS/JavaScript — frontend
- n8n (next layer) — workflow automation

## Run locally on Windows PowerShell

```powershell
$env:GEMINI_API_KEY="YOUR_KEY"
npm start
```

Open `http://localhost:3000`.

The terminal should show:

`AI_RAG mode enabled with gemini-2.5-flash-lite + gemini-embedding-001.`

## What happens when Analyze Lead is clicked
1. Gemini extracts structured buyer requirements as JSON.
2. Business rules calculate a transparent lead-priority score.
3. Buyer requirement + catalogue records are converted into embeddings.
4. Cosine similarity retrieves the top 3 semantic product matches.
5. Gemini receives only the buyer requirement + retrieved catalogue facts.
6. The model produces a grounded supplier reply.

## Hallucination controls
- Extraction prompt says not to infer missing facts.
- Unknown fields remain null.
- Lead score is deterministic rather than LLM-generated.
- Reply generation is restricted to retrieved catalogue facts.
- The model is instructed not to invent stock, commitments, certifications, prices or specs.

## Health check
Open `http://localhost:3000/api/health`.

## Suggested IndiaMART application description
**AI Lead Intelligence & Supplier Copilot for B2B Marketplaces** — Built an AI-powered prototype that converts unstructured buyer enquiries into structured requirements, calculates explainable lead-priority scores, retrieves relevant catalogue products using Gemini embeddings and semantic vector similarity, and generates grounded supplier responses. Used Google Gemini for structured extraction/response generation, embeddings-based RAG, deterministic scoring, and a Node.js workflow; designed an n8n automation layer for high-priority lead routing.

## Next: n8n
Webhook → AI Lead Copilot API → IF priority=HIGH → priority workflow / normal queue.
