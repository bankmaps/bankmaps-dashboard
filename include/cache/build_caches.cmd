@echo off
setlocal enabledelayedexpansion
rem ====== EDIT THESE VALUES ======
set PGURL=postgresql://USERNAME:PASSWORD@HOST:PORT/DBNAME?sslmode=require
set REPO_URL=https://github.com/bankmaps/bankmaps-dashboard.git
set REPO_DIR=%CD%\bankmaps-dashboard
rem =================================

echo [1/6] Cloning or updating repo...
if not exist "%REPO_DIR%\.git" (
  git clone "%REPO_URL%" "%REPO_DIR%" || (echo ERROR: git clone failed & exit /b 1)
) else (
  pushd "%REPO_DIR%" && git pull --rebase && popd
)

echo [2/6] Ensuring target folder exists...
mkdir "%REPO_DIR%\include\cache" 2>nul

echo [3/6] Building loan_volume_cache.json (latest year, lender ranking)...
psql "%PGURL%" -v ON_ERROR_STOP=1 -t -A -c ^
"WITH y AS (SELECT max(year) AS year FROM hmda_test),
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
) ORDER BY record_count DESC, lenderid), '[]'::json);" > "%REPO_DIR%\include\cache\loan_volume_cache.json.tmp" || (echo ERROR: SQL failed & exit /b 1)

for %%F in ("%REPO_DIR%\include\cache\loan_volume_cache.json.tmp") do if %%~zF lss 3 (echo ERROR: loan_volume_cache empty & exit /b 1)
move /Y "%REPO_DIR%\include\cache\loan_volume_cache.json.tmp" "%REPO_DIR%\include\cache\loan_volume_cache.json" >nul

echo [4/6] Building peer_geo_cache.json (latest year, state/county ranking)...
psql "%PGURL%" -v ON_ERROR_STOP=1 -t -A -c ^
"WITH y AS (SELECT max(year) AS year FROM hmda_test),
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
) ORDER BY record_count DESC, statename, countyname), '[]'::json);" > "%REPO_DIR%\include\cache\peer_geo_cache.json.tmp" || (echo ERROR: SQL failed & exit /b 1)

for %%F in ("%REPO_DIR%\include\cache\peer_geo_cache.json.tmp") do if %%~zF lss 3 (echo ERROR: peer_geo_cache empty & exit /b 1)
move /Y "%REPO_DIR%\include\cache\peer_geo_cache.json.tmp" "%REPO_DIR%\include\cache\peer_geo_cache.json" >nul

echo [5/6] Write manifest (for audits & cache-busting)...
> "%REPO_DIR%\include\cache\cache_manifest.json" (
  echo { 
  echo   "generated_at": "%DATE% %TIME%",
  echo   "source_table": "hmda_test",
  echo   "percentile_method": "dense_rank/total * 100",
  echo   "files": [
  echo     "loan_volume_cache.json",
  echo     "peer_geo_cache.json"
  echo   ]
  echo }
)

echo [6/6] Commit & push to trigger Vercel deploy...
pushd "%REPO_DIR%"
git add include\cache\loan_volume_cache.json include\cache\peer_geo_cache.json include\cache\cache_manifest.json
git commit -m "build: refresh cached rankings from hmda_test" || echo (nothing to commit)
git push || (echo ERROR: git push failed & popd & exit /b 1)
popd

echo Done. Your cache JSONs are live under /include/cache/ after Vercel redeploys.
exit /b 0
