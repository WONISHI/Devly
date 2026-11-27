import { createHash } from 'node:crypto'
import { extname, basename } from 'node:path'
import { redactToolText, ToolFailure } from '../agent/tools'
const textExtensions = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.csv',
  '.log',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.html',
  '.css',
  '.scss',
  '.yaml',
  '.yml',
  '.xml',
  '.sql',
  '.sh',
  '.toml',
  '.ini',
  '.svg',
])
export function attachmentFormat(name: string, bytes: Buffer) {
  if (redactToolText(name) !== name) throw new ToolFailure('SENSITIVE_CONTENT')
  if (!bytes.length || bytes.length > 2 * 1024 * 1024)
    throw new ToolFailure('ATTACHMENT_SIZE_LIMIT')
  const extension = extname(name).toLowerCase()
  if (/^(?:\.env(?:\.|$)|id_(?:rsa|ed25519)|credentials|secrets?\.)/i.test(basename(name)))
    throw new ToolFailure('SENSITIVE_CONTENT')
  let mime: 'image/png' | 'image/jpeg' | 'image/webp' | 'text/plain',
    width = 0,
    height = 0
  if (
    extension === '.png' &&
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    mime = 'image/png'
    width = bytes.readUInt32BE(16)
    height = bytes.readUInt32BE(20)
  } else if (['.jpg', '.jpeg'].includes(extension) && bytes[0] === 255 && bytes[1] === 216) {
    mime = 'image/jpeg'
    let cursor = 2
    while (cursor + 9 < bytes.length && cursor < 65536) {
      if (bytes[cursor] !== 255) break
      const marker = bytes[cursor + 1],
        size = bytes.readUInt16BE(cursor + 2)
      if (size < 2 || cursor + size + 2 > bytes.length) break
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
        height = bytes.readUInt16BE(cursor + 5)
        width = bytes.readUInt16BE(cursor + 7)
        break
      }
      cursor += 2 + size
    }
  } else if (
    extension === '.webp' &&
    bytes.length >= 30 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    mime = 'image/webp'
    const type = bytes.toString('ascii', 12, 16)
    if (type === 'VP8X') {
      width = bytes.readUIntLE(24, 3) + 1
      height = bytes.readUIntLE(27, 3) + 1
    } else if (type === 'VP8L' && bytes[20] === 47) {
      const bits = bytes.readUInt32LE(21)
      width = (bits & 16383) + 1
      height = ((bits >>> 14) & 16383) + 1
    } else if (type === 'VP8 ' && bytes.subarray(23, 26).equals(Buffer.from([157, 1, 42]))) {
      width = bytes.readUInt16LE(26) & 16383
      height = bytes.readUInt16LE(28) & 16383
    }
  } else {
    if (!textExtensions.has(extension) || bytes.length > 128 * 1024 || bytes.includes(0))
      throw new ToolFailure('ATTACHMENT_UNSUPPORTED')
    let text: string
    try {
      text = new TextDecoder('utf8', { fatal: true }).decode(bytes)
    } catch {
      throw new ToolFailure('ATTACHMENT_ENCODING')
    }
    if (redactToolText(text) !== text) throw new ToolFailure('SENSITIVE_CONTENT')
    return { mime: 'text/plain' as const, digest: createHash('sha256').update(bytes).digest('hex') }
  }
  if (!width || !height || width > 8192 || height > 8192 || width * height > 16000000)
    throw new ToolFailure('ATTACHMENT_IMAGE_DIMENSIONS')
  return { mime, digest: createHash('sha256').update(bytes).digest('hex') }
}
