const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-2.5-flash-lite";
const GEMINI_EMBED_MODEL = process.env.GEMINI_EMBED_MODEL || "gemini-embedding-001";

const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, "data", "catalog.json"), "utf8"));

function send(res, status, body, type = "application/json") {
  res.writeHead(status, {
    "Content-Type": `${type}; charset=utf-8`,
    "Access-Control-Allow-Origin": "*"
  });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function productText(p) {
  return [
    p.name, p.category, p.type, p.material,
    `colors ${p.colors.join(", ")}`,
    `opacity ${p.opacity}`,
    `width ${p.width}`,
    `price INR ${p.price_per_m} per metre`,
    `MOQ ${p.moq_m} metres`,
    `use cases ${p.use_cases.join(", ")}`,
    p.description
  ].join(". ");
}

async function geminiRequest(endpoint, payload) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify(payload)
  });

  const raw = await response.text();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = { raw }; }

  if (!response.ok) {
    const msg = parsed?.error?.message || raw || `Gemini HTTP ${response.status}`;
    throw new Error(`Gemini ${response.status}: ${msg}`);
  }
  return parsed;
}

function candidateText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map(p => p.text || "").join("").trim();
  if (!text) throw new Error("Gemini returned no text.");
  return text;
}

async function extractRequirements(enquiry) {
  const schema = {
    type: "OBJECT",
    properties: {
      category: { type: "STRING", nullable: true },
      product_type: { type: "STRING", nullable: true },
      quantity: { type: "NUMBER", nullable: true },
      unit: { type: "STRING", nullable: true },
      colors: { type: "ARRAY", items: { type: "STRING" } },
      buyer_type: { type: "STRING", nullable: true },
      location: { type: "STRING", nullable: true },
      delivery_timeline: { type: "STRING", nullable: true },
      budget: { type: "STRING", nullable: true },
      use_case: { type: "STRING", nullable: true },
      missing_information: { type: "ARRAY", items: { type: "STRING" } }
    },
    required: [
      "category","product_type","quantity","unit","colors","buyer_type",
      "location","delivery_timeline","budget","use_case","missing_information"
    ]
  };

  const prompt = `You are a precise B2B requirement extraction engine.
Extract only facts explicitly present in the buyer enquiry.
Never invent unknown values. Use null for unknown scalar fields.
colors and missing_information must always be arrays.
For missing_information, include important commercial details that are absent.

Buyer enquiry:
${enquiry}`;

  const data = await geminiRequest(`models/${GEMINI_CHAT_MODEL}:generateContent`, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: schema
    }
  });

  return JSON.parse(candidateText(data));
}

function scoreLead(r) {
  let score = 0;
  const reasons = [];
  if (r.category || r.product_type) { score += 15; reasons.push("Product requirement identified"); }
  if (r.quantity) { score += 20; reasons.push("Quantity specified"); }
  if (r.location) { score += 10; reasons.push("Location available"); }
  if (r.delivery_timeline) { score += 15; reasons.push("Delivery timeline specified"); }
  if (r.buyer_type) { score += 15; reasons.push("Buyer type identified"); }
  if (r.budget) { score += 10; reasons.push("Budget available"); }
  if (r.use_case) { score += 10; reasons.push("Use case identified"); }
  if (Array.isArray(r.colors) && r.colors.length) { score += 5; reasons.push("Product preference specified"); }
  const priority = score >= 75 ? "HIGH" : score >= 50 ? "MEDIUM" : "LOW";
  return { score, priority, reasons };
}

async function batchEmbeddings(texts) {
  const model = `models/${GEMINI_EMBED_MODEL}`;
  const requests = texts.map(text => ({
    model,
    content: { parts: [{ text }] },
    outputDimensionality: 768
  }));

  const data = await geminiRequest(`models/${GEMINI_EMBED_MODEL}:batchEmbedContents`, { requests });

  if (!Array.isArray(data.embeddings) || data.embeddings.length !== texts.length) {
    throw new Error("Gemini embeddings response was incomplete.");
  }
  return data.embeddings.map(e => e.values || []);
}

async function retrieveProducts(requirements) {
  const query = [
    requirements.category,
    requirements.product_type,
    requirements.quantity && `${requirements.quantity} ${requirements.unit || ""}`,
    Array.isArray(requirements.colors) ? requirements.colors.join(" ") : "",
    requirements.buyer_type,
    requirements.use_case,
    requirements.budget
  ].filter(Boolean).join(" | ");

  const texts = [query, ...catalog.map(productText)];
  const vectors = await batchEmbeddings(texts);
  const q = vectors[0];

  return catalog.map((p, i) => ({
    ...p,
    similarity: cosine(q, vectors[i + 1])
  }))
  .sort((a, b) => b.similarity - a.similarity)
  .slice(0, 3);
}

async function generateReply(enquiry, requirements, products) {
  const grounded = products.map(p => ({
    name: p.name,
    type: p.type,
    colors: p.colors,
    opacity: p.opacity,
    price_per_m: p.price_per_m,
    moq_m: p.moq_m,
    use_cases: p.use_cases
  }));

  const prompt = `You write concise professional B2B supplier replies.

Rules:
- Use ONLY catalogue facts provided below.
- Never invent stock availability, delivery commitment, discounts, certifications, product specifications or prices.
- Do not claim that a product is definitely suitable; say it \"appears relevant\" or \"may suit the requirement.\"
- If buyer information is missing, ask at most 2 useful follow-up questions.
- Keep the reply under 140 words.

Buyer enquiry:
${enquiry}

Extracted requirement:
${JSON.stringify(requirements)}

Retrieved catalogue products:
${JSON.stringify(grounded)}

Write the final supplier response only.`;

  const data = await geminiRequest(`models/${GEMINI_CHAT_MODEL}:generateContent`, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 350
    }
  });

  return candidateText(data);
}

function heuristicExtract(enquiry) {
  const e = enquiry.toLowerCase();
  const quantityMatch = e.match(/(\d{2,6})\s*(m|meter|metre|meters|metres)/i);
  const colors = ["beige","cream","grey","gray","blue","ivory","white","green","navy","maroon"]
    .filter(c => e.includes(c));
  let product_type = null;
  ["blackout","sheer","dimout","velvet","privacy"].forEach(t => {
    if (e.includes(t)) product_type = t;
  });
  let buyer_type = e.includes("hotel") ? "Hotel" : e.includes("hospital") ? "Hospital" : e.includes("office") ? "Office/Commercial" : null;

  const locationMatch = enquiry.match(/\b(?:in|at|to)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\b/);
  const timelineMatch = enquiry.match(/within\s+(\d+\s*(?:day|days|week|weeks))/i);

  const r = {
    category: e.includes("curtain") ? "Curtain Fabric" : null,
    product_type,
    quantity: quantityMatch ? Number(quantityMatch[1]) : null,
    unit: quantityMatch ? "metres" : null,
    colors,
    buyer_type,
    location: locationMatch ? locationMatch[1] : null,
    delivery_timeline: timelineMatch ? timelineMatch[1] : null,
    budget: null,
    use_case: buyer_type,
    missing_information: []
  };

  ["quantity","location","budget"].forEach(k => {
    if (!r[k]) r.missing_information.push(k);
  });
  return r;
}

function heuristicRetrieve(r) {
  const terms = [r.product_type, ...(r.colors || []), r.buyer_type, r.use_case]
    .filter(Boolean).map(x => String(x).toLowerCase());

  return catalog.map(p => {
    const txt = productText(p).toLowerCase();
    const hits = terms.reduce((n, t) => n + (txt.includes(t) ? 1 : 0), 0);
    return { ...p, similarity: terms.length ? hits / terms.length : 0.1 };
  }).sort((a,b) => b.similarity - a.similarity).slice(0,3);
}

function demoReply(r, products) {
  const p = products[0];
  const missing = (r.missing_information || []).filter(x => x !== "budget").slice(0,2);
  return `Thank you for your enquiry. Based on the requirement shared, ${p.name} appears relevant from our catalogue. It is a ${p.type.toLowerCase()} option available in ${p.colors.slice(0,3).join(", ")} with ${p.opacity} opacity and an MOQ of ${p.moq_m} metres. Indicative catalogue price is ₹${p.price_per_m}/metre. ${missing.length ? `Could you also confirm ${missing.join(" and ")}?` : "Please confirm the final specification and quantity so we can proceed with the next step."}`;
}

async function analyze(enquiry) {
  if (!GEMINI_API_KEY) {
    const requirements = heuristicExtract(enquiry);
    const lead = scoreLead(requirements);
    const products = heuristicRetrieve(requirements);
    return {
      mode: "DEMO_FALLBACK",
      requirements,
      lead,
      products,
      response: demoReply(requirements, products),
      note: "No GEMINI_API_KEY configured. Add one to enable Gemini extraction + embeddings-based RAG."
    };
  }

  const requirements = await extractRequirements(enquiry);
  const lead = scoreLead(requirements);
  const products = await retrieveProducts(requirements);
  const response = await generateReply(enquiry, requirements, products);

  return {
    mode: "AI_RAG",
    provider: "Google Gemini",
    models: { generation: GEMINI_CHAT_MODEL, embeddings: GEMINI_EMBED_MODEL },
    requirements,
    lead,
    products,
    response
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  if (req.method === "GET" && req.url === "/api/health") {
    return send(res, 200, {
      ok: true,
      provider: GEMINI_API_KEY ? "Google Gemini" : "Offline demo fallback",
      chatModel: GEMINI_CHAT_MODEL,
      embeddingModel: GEMINI_EMBED_MODEL
    });
  }

  if (req.method === "POST" && req.url === "/api/analyze") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        if (!parsed.enquiry || parsed.enquiry.trim().length < 8) {
          return send(res, 400, { error: "Please enter a meaningful buyer enquiry." });
        }
        const result = await analyze(parsed.enquiry.trim());
        send(res, 200, result);
      } catch (err) {
        console.error(err);
        send(res, 500, { error: err.message || "Analysis failed." });
      }
    });
    return;
  }

  let requested = req.url === "/" ? "/index.html" : req.url;
  requested = requested.split("?")[0];
  const filePath = path.join(__dirname, "public", requested);
  const safeRoot = path.join(__dirname, "public");

  if (!filePath.startsWith(safeRoot)) return send(res, 403, "Forbidden", "text/plain");

  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "Not found", "text/plain");
    const ext = path.extname(filePath);
    const types = {
      ".html":"text/html",
      ".css":"text/css",
      ".js":"application/javascript",
      ".svg":"image/svg+xml"
    };
    send(res, 200, data, types[ext] || "text/plain");
  });
});

server.listen(PORT, () => {
  console.log(`AI Lead Copilot running at http://localhost:${PORT}`);
  console.log(
    GEMINI_API_KEY
      ? `AI_RAG mode enabled with ${GEMINI_CHAT_MODEL} + ${GEMINI_EMBED_MODEL}.`
      : "DEMO_FALLBACK mode enabled (set GEMINI_API_KEY for real Gemini AI + embeddings)."
  );
});
