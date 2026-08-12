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
  if (matchingFiles.length === 0) throw new Error(`No update packages found for ${name}`)
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

await Promise.all([
  writeMetadata(
    'latest.yml',
    filenames.filter((name) => /^Lepus-.+-setup\.exe$/i.test(name))
  ),
  writeMetadata(
    'latest-mac.yml',
    filenames.filter((name) => /^Lepus-.+-(?:arm64|x64)\.zip$/i.test(name))
  ),
  writeMetadata(
    'latest-linux.yml',
    filenames.filter((name) => /^Lepus-.+\.AppImage$/i.test(name))
  )
])

console.log(`Generated updater metadata for Lepus ${version}`)
