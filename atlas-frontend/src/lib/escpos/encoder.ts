// ESC/POS command bytes
const ESC = 0x1B;
const GS  = 0x1D;
const LF  = 0x0A;

export interface PrintLine {
  type: 'text' | 'divider' | 'cut';
  content?: string;
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
  double?: boolean;
}

export interface PrintPayload {
  lines: PrintLine[];
  paper_width?: number; // 58 or 80 (mm)
}

function alignText(text: string, align: string, width: number): string {
  if (align === 'center') {
    const pad = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(pad) + text;
  }
  if (align === 'right') {
    return text.padStart(width);
  }
  return text;
}

export function encodePayload(payload: PrintPayload): Uint8Array {
  const width = payload.paper_width === 58 ? 32 : 48;
  const bytes: number[] = [];

  // Initialize printer
  bytes.push(ESC, 0x40);

  for (const line of payload.lines) {
    if (line.type === 'cut') {
      bytes.push(GS, 0x56, 0x42, 0x00); // partial cut
      continue;
    }
    if (line.type === 'divider') {
      bytes.push(...Array.from('-'.repeat(width)).map(c => c.charCodeAt(0)), LF);
      continue;
    }
    // text
    if (line.bold) bytes.push(ESC, 0x45, 0x01);
    if (line.double) bytes.push(ESC, 0x21, 0x30);

    const text = alignText(line.content ?? '', line.align ?? 'left', width);
    bytes.push(...Array.from(text).map(c => {
      const code = c.charCodeAt(0);
      return code > 127 ? 0x3F : code; // replace non-ASCII with '?'
    }), LF);

    if (line.bold) bytes.push(ESC, 0x45, 0x00);
    if (line.double) bytes.push(ESC, 0x21, 0x00);
  }

  // Feed and cut
  bytes.push(ESC, 0x64, 0x03); // feed 3 lines
  bytes.push(GS, 0x56, 0x42, 0x00); // cut

  return new Uint8Array(bytes);
}
