#!/usr/bin/env node
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

const outputDirectory = resolve(process.argv[2] || 'dist')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const version = packageJson.version
const releaseDate = new Date().toISOString()
const filenames = await readdir(outputDirectory)

async function fileInfo(filename) {
  const path = resolve(outputDirectory, filename)
  const [contents, details] = await Promise.all([readFile(path), stat(path)])
  return {
    url: filename,
    sha512: createHash('sha512').update(contents).digest('base64'),
    size: details.size
  }
}

function quote(value) {
  return JSON.stringify(value)
}

async function writeMetadata(name, matchingFiles) {
  if (matchingFiles.length === 0) {
    throw new Error(
      `No update packages found for ${name}. Available release assets: ${filenames.join(', ') || '(none)'}`
    )
  }
  const files = await Promise.all(matchingFiles.sort().map(fileInfo))
  const primary = files[0]
  const lines = [
    `version: ${quote(version)}`,
    'files:',
    ...files.flatMap((file) => [
      `  - url: ${quote(file.url)}`,
      `    sha512: ${quote(file.sha512)}`,
      `    size: ${file.size}`
    ]),
    `path: ${quote(primary.url)}`,
    `sha512: ${quote(primary.sha512)}`,
    `releaseDate: ${quote(releaseDate)}`,
    ''
  ]
  await writeFile(resolve(outputDirectory, name), lines.join('\n'))
}

const windowsPackages = filenames.filter((name) => /^Lepus-.+-x64-setup\.exe$/i.test(name))
const macPackages = filenames.filter((name) => /^Lepus-.+-(?:arm64|x64)\.zip$/i.test(name))
const linuxPackages = filenames.filter((name) => /^Lepus-.+-x64\.AppImage$/i.test(name))

for (const arch of ['arm64', 'x64']) {
  if (!macPackages.some((name) => name.toLocaleLowerCase().endsWith(`-${arch}.zip`))) {
    throw new Error(
      `Missing macOS ${arch} ZIP update package. Available release assets: ${filenames.join(', ') || '(none)'}`
    )
  }
}

await Promise.all([
  writeMetadata('latest.yml', windowsPackages),
  writeMetadata('latest-mac.yml', macPackages),
  writeMetadata('latest-linux.yml', linuxPackages)
])

console.log(`Generated updater metadata for Lepus ${version}`)
