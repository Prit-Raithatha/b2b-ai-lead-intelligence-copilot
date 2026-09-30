
const $ = s => document.querySelector(s);
const enquiry = $("#enquiry");
const btn = $("#analyzeBtn");
const error = $("#error");
const copyBtn = $("#copyBtn");

document.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => enquiry.value = c.dataset.text));

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}
function prettyKey(k){return k.replaceAll("_"," ").replace(/\b\w/g,m=>m.toUpperCase())}

btn.addEventListener("click", async () => {
  error.textContent = "";
  btn.disabled = true;
  btn.textContent = "Analyzing...";
  $("#modeBadge").textContent = "Working";

  try {
    const r = await fetch("/api/analyze", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({enquiry:enquiry.value})
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Analysis failed");

    $("#modeBadge").textContent = data.mode === "AI_RAG" ? "AI + RAG active" : "Demo fallback";
    $("#score").textContent = data.lead.score;
    $("#priority").textContent = `${data.lead.priority} PRIORITY`;
    $("#priority").style.color = data.lead.priority === "HIGH" ? "#157347" : data.lead.priority === "MEDIUM" ? "#9a6700" : "#b42318";
    $("#reasons").innerHTML = data.lead.reasons.map(x => `<li>${esc(x)}</li>`).join("");

    const req = data.requirements;
    const fields = ["category","product_type","quantity","unit","colors","buyer_type","location","delivery_timeline","budget","use_case","missing_information"];
    $("#requirements").classList.remove("empty");
    $("#requirements").innerHTML = fields.map(k => {
      let v = req[k];
      if (Array.isArray(v)) v = v.length ? v.join(", ") : "—";
      if (v === null || v === undefined || v === "") v = "—";
      return `<div class="kv"><div class="k">${esc(prettyKey(k))}</div><div class="v">${esc(v)}</div></div>`;
    }).join("");

    $("#products").classList.remove("empty");
    $("#products").innerHTML = data.products.map(p => `
      <div class="product">
        <div class="product-top">
          <h3>${esc(p.name)}</h3>
          <div class="match">${Math.round((p.similarity||0)*100)}% semantic match</div>
        </div>
        <div class="meta">${esc(p.type)} • ${esc(p.opacity)} opacity • MOQ ${esc(p.moq_m)}m • ₹${esc(p.price_per_m)}/m<br/>Colors: ${esc(p.colors.join(", "))}</div>
      </div>
    `).join("");

    $("#reply").classList.remove("empty");
    $("#reply").textContent = data.response;
    copyBtn.disabled = false;
    copyBtn.dataset.copy = data.response;

    if (data.note) error.textContent = data.note;
  } catch (e) {
    error.textContent = e.message;
    $("#modeBadge").textContent = "Error";
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze lead";
  }
});

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(copyBtn.dataset.copy || "");
  copyBtn.textContent = "Copied";
  setTimeout(()=>copyBtn.textContent="Copy response",1200);
});
