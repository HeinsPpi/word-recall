import { existsSync, readFileSync } from 'node:fs'
const path = new URL('../public/dictionary/manifest.json', import.meta.url)
if (!existsSync(path))
  console.warn(
    '\n[WordRecall] WARNING: production dictionary is not present. The app will build, but first-run setup requires `python3 scripts/build_dictionary.py`. No fixture data is included.\n'
  )
else {
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  if (!manifest.wordCount)
    throw new Error('Production dictionary manifest has no words.')
  const reportPath = new URL('../data_build_report.json', import.meta.url)
  if (existsSync(reportPath)) {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'))
    if (report['words without Japanese meaning'] !== 0)
      throw new Error(
        'Production dictionary contains detailed words without Japanese meanings.'
      )
  }
  console.log(
    `[WordRecall] Dictionary ${manifest.dictionaryVersion}: ${manifest.wordCount} words, ${(manifest.totalBytes / 1024 / 1024).toFixed(1)} MB`
  )
}
