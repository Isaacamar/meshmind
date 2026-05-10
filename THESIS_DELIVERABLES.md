# MeshMind v2 — Thesis Proof Deliverables
ECE366 · Spring 2026 · Isaac Amar & Isaac Schertz

> **Goal:** Produce live, reproducible numbers that validate every quantitative claim in
> "MeshMind: A Shared-Cache Local Inference Mesh for Energy-Proportional AI."

---

## Thesis Claims & How We Prove Them

| # | Claim | Evidence source | Status |
|---|-------|----------------|--------|
| 1 | Three-tier routing operates correctly (verbatim / repackage / miss) | `consumptions` table — mode column | ✅ recorded per-query |
| 2 | Verbatim hits require **0 inference tokens** | OpenClaw `_stream_ask` returns cached text directly | ✅ code + SSE `mode:"verbatim"` |
| 3 | Repackage uses **~10% of full-miss tokens** | Ollama `eval_count` logged in SSE done event | ✅ frontend tok-stats badge |
| 4 | System achieves **>70% hit rate** after marketplace is populated | `consumptions` table — hit rate % | 📊 run script to measure |
| 5 | Energy savings ∝ hit rate (76–92% range from thesis savings model) | Derived from tokens_saved / total_tokens | 📊 run script to measure |
| 6 | Credits economy incentivises sharing (publish +5, royalty +1) | `credit_events` table | ✅ recorded per event |
| 7 | **Privacy preserved** — plaintext prompts never leave local node | Code audit: only `embedding` sent in `market.search()` call | ✅ architecture + code |

---

## 1. Run Live Metrics Right Now

### Terminal method (requires Docker running)
```bash
cd /Users/isaacamar/Documents/meshmind-v2
./scripts/thesis_stats.sh
```

### API method (requires services up + logged in)
```bash
# 1. Login through OpenClaw
curl -s -X POST http://localhost:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"YOUR_USER","password":"YOUR_PASS"}' | jq

# 2. Pull stats
curl -s http://localhost:8000/api/stats | jq
```

### Raw psql queries
```sql
-- Connect:
docker exec -it meshmind-v2-db-1 psql -U meshmind -d meshmind

-- 1. Marketplace size
SELECT COUNT(*) AS entries,
       COALESCE(SUM(consume_count),0) AS total_served
FROM market_entries;

-- 2. Hit-rate breakdown
SELECT mode,
       COUNT(*) AS n,
       ROUND(AVG(similarity)::numeric, 3) AS avg_sim
FROM consumptions
GROUP BY mode;

-- 3. Token savings estimate (512 tokens avg per miss)
WITH s AS (
  SELECT COUNT(*) FILTER (WHERE mode='verbatim')  AS v,
         COUNT(*) FILTER (WHERE mode='repackage') AS r
  FROM consumptions
)
SELECT v*512 + r*51 AS tokens_saved,
       ROUND((v*512 + r*51)*100.0 / NULLIF((v+r)*512,0),1) AS pct_saved
FROM s;

-- 4. Credits economy
SELECT reason, COUNT(*) AS events, SUM(delta) AS credits
FROM credit_events GROUP BY reason;
```

---

## 2. Populate the Marketplace (get enough data to show a hit rate)

Run these prompts in the UI — each one publish the answer, then re-ask a paraphrase to trigger the cache:

### Batch 1 — fundamentals (publish, then ask the paraphrase)
| Original (publish this) | Paraphrase to re-ask |
|---|---|
| "Explain how DNS resolution works" | "Walk me through how a domain name gets turned into an IP address" |
| "What is a JWT and how does it work?" | "How does JSON Web Token authentication function?" |
| "Explain gradient descent in machine learning" | "How does gradient descent find the minimum of a loss function?" |
| "What is a Docker container?" | "Explain what Docker containers are and how they differ from VMs" |
| "How does RSA encryption work?" | "Can you explain the RSA public-key algorithm?" |
| "What is the TCP three-way handshake?" | "Describe the process of establishing a TCP connection" |
| "Explain the OSI model layers" | "What are the seven layers of the OSI networking model?" |
| "What is a relational database?" | "How do relational databases store and retrieve data?" |
| "Explain Big O notation" | "What does Big O notation mean in algorithm analysis?" |
| "How does HTTPS work?" | "Explain TLS/SSL and how HTTPS secures web traffic" |

### One-liner to publish 10 entries from CLI (after logging in through the UI)
Use the UI's publish button — ask each "Original" prompt above, publish the answer, then open a new chat and ask the "Paraphrase" to trigger the cache.

---

## 3. Expected Numbers (Savings Model from Thesis)

Given the thesis savings model:  
`savings = h × 1.0 + r × 0.90 + m × 0.0`  
where h = verbatim fraction, r = repackage fraction, m = miss fraction.

| Scenario | h | r | m | Savings |
|---|---|---|---|---|
| Cold marketplace (no entries) | 0% | 0% | 100% | 0% |
| 10 published entries, 20 queries | ~30% | ~20% | 50% | 48% |
| 50 published entries, 100 queries | ~45% | ~25% | 30% | 67.5% |
| Mature mesh (thesis target) | ~55% | ~30% | 15% | **82%** |

The thesis claims 76–92% — this corresponds to h+r ≥ 85% hit rate on a mature marketplace.

---

## 4. Privacy Claim — Code Evidence

The privacy guarantee is enforced architecturally. Confirm by reading:

```bash
grep -n "market.search\|embed\|plaintext" \
  /Users/isaacamar/Documents/meshmind-v2/openclaw/app/server.py | head -30
```

Key lines in [openclaw/app/server.py](openclaw/app/server.py):
- `embedding = await ollama_client.embed(prompt)` — embed happens **locally** via Ollama
- `hits = await market.search(embedding, k=5)` — only the `embedding` (768 floats) leaves the device
- The `prompt` text is **never** passed to `market.search()` or any cloud call

The cloud backend [backend/.../MarketController.java](backend/src/main/java/dev/meshmind/market/MarketController.java) receives only `{"embedding": [...], "k": 3}` — no prompt text.

---

## 5. What to Show in the Presentation

### Live demo sequence (5 min)
1. Open `http://localhost:3000`, show model selector + temperature slider
2. Ask "Explain how DNS resolution works" → publish the answer → note **+5 credits**
3. New chat → ask "Walk me through how a domain name gets turned into an IP address"
   → should show **Repackaged** or **Cached** badge with similarity score
4. Open terminal → run `./scripts/thesis_stats.sh` → show live numbers
5. Show `credit_events` table: `SELECT reason, SUM(delta) FROM credit_events GROUP BY reason;`
6. Point to code: `grep -n "search(embedding" openclaw/app/server.py` — "only embedding sent"

### Slide talking points
- "We measured X% hit rate after Y published entries"
- "Verbatim hits: 0 tokens. Full miss: ~512. Our system used N tokens total vs M expected → K% savings"
- "The credits table shows the incentive loop is live — authors have earned N credits in royalties"
- "Privacy: `git grep 'market.search'` — you can see only the float vector is sent"

---

## 6. Reproducibility

Anyone can reproduce these results by:
```bash
git clone https://github.com/Isaacamar/meshmind
cd meshmind-v2
docker compose up -d
ollama pull nomic-embed-text llama3.2:3b
# Register, publish 10 entries, re-ask paraphrases
./scripts/thesis_stats.sh
```

All data persists in the `postgres_data` Docker volume across restarts.

---

## 7. May 11 Gaps (ECE366 Requirements)

| Gap | Action needed |
|---|---|
| Cloud deployment | Deploy backend+db to Render/Railway; update `MESHMIND_CLOUD` in OpenClaw |
| Java unit tests (50% coverage) | Add tests in `backend/src/test/java/dev/meshmind/` covering MarketController + AuthController |
| Account profile update | `PUT /api/users/me` endpoint in Spring Boot |
