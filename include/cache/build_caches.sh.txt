#!/usr/bin/env bash
set -euo pipefail

# ====== EDIT THESE VALUES ======
PGURL="postgresql://USERNAME:PASSWORD@HOST:PORT/DBNAME?sslmode=require"
REPO_URL="https://github.com/bankmaps/bankmaps-dashboard.git"
REPO_DIR="$(pwd)/bankmaps-dashboard"
# =================================

echo "[1/6] Clone or pull repo..."
if [ ! -d "$REPO_DIR/.git" ]; then
  git clone "$REPO_URL" "$REPO_DIR"
else
  git -C "$REPO_DIR" pull --rebase
fi

echo "[2/6] Ensure target folder..."
mkdir -p "$REPO_DIR/include/cache"

echo "[3/6] Build loan_volume_cache.json..."
psql "$PGURL" -v ON_ERROR_STOP=1 -t -A -c "
WITH y AS (SELECT max(year) AS year FROM hmda_test),
base AS (
  SELECT lenderid, lendername, COUNT(*) AS record_count
  FROM hmda_test, y
  WHERE hmda_test.year = y.year
  GROUP BY lenderid, lendername
),
r AS (
  SELECT b.*,
         DENSE_RANK() OVER (ORDER BY record_count DESC) AS rnk,
         COUNT(*) OVER () AS total
  FROM base b
)
SELECT COALESCE(json_agg(json_build_object(
  'lenderid', lenderid,
  'lendername', lendername,
  'record_count', record_count,
  'percentile', ROUND((rnk::numeric / total::numeric)*100, 2)
) ORDER BY record_count DESC, lenderid), '[]'::json);
" > "$REPO_DIR/include/cache/loan_volume_cache.json.tmp"

[ -s "$REPO_DIR/include/cache/loan_volume_cache.json.tmp" ]
mv "$REPO_DIR/include/cache/loan_volume_cache.json.tmp" "$REPO_DIR/include/cache/loan_volume_cache.json"

echo "[4/6] Build peer_geo_cache.json..."
psql "$PGURL" -v ON_ERROR_STOP=1 -t -A -c "
WITH y AS (SELECT max(year) AS year FROM hmda_test),
base AS (
  SELECT statename, countyname, COUNT(*) AS record_count
  FROM hmda_test, y
  WHERE hmda_test.year = y.year
  GROUP BY statename, countyname
),
r AS (
  SELECT b.*,
         DENSE_RANK() OVER (ORDER BY record_count DESC) AS rnk,
         COUNT(*) OVER () AS total
  FROM base b
)
SELECT COALESCE(json_agg(json_build_object(
  'statename', statename,
  'countyname', countyname,
  'record_count', record_count,
  'percentile', ROUND((rnk::numeric / total::numeric)*100, 2)
) ORDER BY record_count DESC, statename, countyname), '[]'::json);
" > "$REPO_DIR/include/cache/peer_geo_cache.json.tmp"

[ -s "$REPO_DIR/include/cache/peer_geo_cache.json.tmp" ]
mv "$REPO_DIR/include/cache/peer_geo_cache.json.tmp" "$REPO_DIR/include/cache/peer_geo_cache.json"

echo "[5/6] Write manifest..."
cat > "$REPO_DIR/include/cache/cache_manifest.json" <<EOF
{
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "source_table": "hmda_test",
  "percentile_method": "dense_rank/total * 100",
  "files": [
    "loan_volume_cache.json",
    "peer_geo_cache.json"
  ]
}
EOF

echo "[6/6] Commit & push to trigger Vercel deploy..."
git -C "$REPO_DIR" add include/cache/loan_volume_cache.json include/cache/peer_geo_cache.json include/cache/cache_manifest.json
git -C "$REPO_DIR" commit -m "build: refresh cached rankings from hmda_test" || true
git -C "$REPO_DIR" push

echo "Done. After Vercel redeploy, verify at:
  https://reports.bankmaps.com/include/cache/loan_volume_cache.json
  https://reports.bankmaps.com/include/cache/peer_geo_cache.json"
