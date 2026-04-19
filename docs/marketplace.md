# Prompt Marketplace — Design Notes

## Why this, not peer routing

The original MeshMind proposed routing prompts to friends' GPUs over an encrypted relay. That doesn't solve a real user problem — my local Ollama is already fine. What the network *can* give me is **other people's past answers**, semantically indexed, with attribution.

This is the moat. It gets stronger the more users publish. Peer routing doesn't — a busy peer is worse than a free local model.

## Three-mode `/api/ask`

```
prompt
  │
  ▼ local embed (nomic-embed-text, 768 dims)
  │
  ▼ POST /api/market/search {embedding, k=3}
  │
  ┌──────────────┬──────────────┬────────────┐
  ▼              ▼              ▼            ▼
sim ≥ 0.90     0.70–0.90     < 0.70       cloud offline
verbatim       repackage      miss         fallback to miss
  │              │              │
  ▼              ▼              ▼
return          local chat     local chat
cached          with cached    fresh
response        as context     response
  │              │              │
  ▼              ▼              ▼
/consume        /consume       (offer publish)
(pay author)    (pay author)   (earn bonus)
```

### Repackage prompt template

```
A user asks: {prompt}

A similar question was previously answered as follows:
---
{cached_response}
---

Rewrite this answer to address the user's exact question.
Be concise — do not repeat information the user didn't ask for.
```

This typically runs in ~50–100 output tokens versus 300–800 for a fresh answer on the same topic, because the model is adapting, not generating from scratch.

## Credits economy

Kept deliberately simple — no blockchain, no token, just a Postgres `users.credits` column plus an immutable `credit_events` ledger.

| Event | Delta | Who |
|---|---|---|
| Register | +100 | new user |
| Publish an entry | +5 | author |
| Entry consumed | +1 | author |
| Search | 0 | (free for now) |
| Fresh inference | 0 | (you ran it locally, no cost to the network) |

Room to tighten later: rate-limited free searches, paid search above quota, upvote/downvote effects on search ranking.

## Privacy contract

- Embeddings: leave the machine for search, but they're not reversible to plaintext for practical purposes with a 768-dim float vector.
- Plaintext prompts + responses: **only** sent to the cloud when the user clicks Publish.
- Everything else stays in local SQLite (planned — current demo is stateless for simplicity).

## pgvector choices

- **IVFFlat** index with `lists=100`. Fine up to ~100k entries. Revisit HNSW if it grows.
- **Cosine distance** (`<=>` operator), converted to similarity as `1 - distance`.
- Index is created in `schema.sql` and loaded at container init.

## Open questions

- **Embedding drift**: if we ever swap embedding models, old entries become un-searchable. Mitigation: store `embedding_model` per entry, allow filtered search.
- **Response quality decay**: an answer that was right in 2026 may be wrong in 2028. Add freshness weights to ranking.
- **Trolling/garbage**: add `flag` action, threshold for auto-hide, staked moderation later.
- **Exact-match vs. semantic**: currently only vector search. Could add lexical (Postgres FTS) as a second-pass filter.
