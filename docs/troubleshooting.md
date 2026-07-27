# Troubleshooting

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| Live Glassdoor 403 / captcha | Cloudflare block | Use fixtures; do not solve CAPTCHA |
| Zero questions from HTML | Block page or parser miss | Check `access_state`; compare to synthetic fixtures |
| Comment count > 0, zero responses | Collapsed/gated UI or parse gap | Diagnostics emitted; archive HTML; extend parser |
| Duplicate growth on re-run | Missing hash remap | Ensure pipeline remaps by `normalised_hash` |
| Import network failure | Egress / repo missing | Offline seed + staged `data/staging/github/` |
| Answer labelled source_provided but templated | Bug | Fail test; synthesised must use `synthesised_*` |

## Replay without network

```bash
ibpe replay-fixture fixtures/glassdoor/html/synthetic-occupation-search-ib.html
ibpe replay-fixture fixtures/glassdoor/html/occupation-investment-banking-analyst-httpx.html
```

Blocked fixtures should report `captcha`/`blocked` and zero exact questions.
