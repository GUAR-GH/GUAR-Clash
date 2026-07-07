import yaml from 'yaml'
import { readFileSync, writeFileSync } from 'fs'
import { extractVersionSection } from './changelog.mjs'

const pkg = readFileSync('package.json', 'utf-8')
const rawChangelog = readFileSync('changelog.md', 'utf-8')
const { version } = JSON.parse(pkg)
const releaseRepo = process.env.RELEASE_REPO || 'GUAR-GH/GUAR-Clash'
const productName = 'GUAR Clash'
const linuxProductName = 'GUAR.Clash'

let changelog = extractVersionSection(rawChangelog, version)
const downloadUrl = `https://github.com/${releaseRepo}/releases/download/${version}`
const latest = {
  version,
  changelog
}

const badge = (format, label, logo) =>
  `https://img.shields.io/badge/${format}-default?style=flat&logo=${logo}&label=${encodeURIComponent(label)}`

const link = (url, format, label, logo) =>
  `<a href="${url}"><img src="${badge(format, label, logo)}"></a>`

const assetUrl = (name) => encodeURI(`${downloadUrl}/${name}`)

if (process.env.SKIP_CHANGELOG !== '1') {
  changelog += '\n### Download link：\n\n#### Windows 10/11：\n\n'
  changelog += link(assetUrl(`${productName}_x64-setup.exe`), 'EXE', '64-bit', 'windows') + ' '
  changelog += link(assetUrl(`${productName}_arm64-setup.exe`), 'EXE', 'ARM64', 'windows') + '\n\n'
  changelog += '\n#### macOS 11+：\n\n'
  changelog += link(assetUrl(`${productName}_x64.pkg`), 'PKG', 'Intel', 'apple') + ' '
  changelog += link(assetUrl(`${productName}_arm64.pkg`), 'PKG', 'Apple Silicon', 'apple') + '\n\n'
  changelog += '\n#### Linux：\n\n'
  changelog += link(assetUrl(`${linuxProductName}_amd64.deb`), 'DEB', '64-bit', 'linux') + ' '
  changelog += link(assetUrl(`${linuxProductName}_arm64.deb`), 'DEB', 'ARM64', 'linux') + '\n\n'
  changelog += link(assetUrl(`${linuxProductName}_x86_64.rpm`), 'RPM', '64-bit', 'linux') + ' '
  changelog += link(assetUrl(`${linuxProductName}_aarch64.rpm`), 'RPM', 'ARM64', 'linux') + '\n\n'
  changelog += link(assetUrl(`${linuxProductName}_x64.pkg.tar.xz`), 'PACMAN', '64-bit', 'archlinux') + ' '
  changelog += link(assetUrl(`${linuxProductName}_aarch64.pkg.tar.xz`), 'PACMAN', 'ARM64', 'archlinux')
}
writeFileSync('latest.yml', yaml.stringify(latest))
writeFileSync('changelog.md', changelog)
writeFileSync('rawChangelog.md', rawChangelog)
