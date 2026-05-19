import { sanitizeSpreadsheetFormulaText, serializeExportCell } from './export-serialization';

const textEncoder = new TextEncoder();

export type WorkbookSheet = {
  name: string;
  rows: Array<Record<string, unknown>>;
};

const INVALID_SHEET_NAME_PATTERN = /[:\\/?*\[\]]/g;
const MAX_SHEET_NAME_LENGTH = 31;

function encodeText(value: string) {
  return textEncoder.encode(value);
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripInvalidXmlText(value: string) {
  let result = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint == null || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      continue;
    }
    result += character;
  }
  return result.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

function xmlText(value: unknown) {
  return xmlEscape(
    stripInvalidXmlText(sanitizeSpreadsheetFormulaText(serializeCellValue(value)))
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n'),
  );
}

function serializeCellValue(value: unknown) {
  return serializeExportCell(value);
}

function columnName(index: number) {
  let current = index + 1;
  let result = '';
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function sheetHeaders(rows: Array<Record<string, unknown>>) {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

function buildCellXml(cellRef: string, value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `<c r="${cellRef}"><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${cellRef}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${cellRef}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
}

function buildSheetXml(rows: Array<Record<string, unknown>>) {
  const headers = sheetHeaders(rows);
  const allRows = headers.length === 0 ? rows : [{ ...Object.fromEntries(headers.map((header) => [header, header])) }, ...rows];
  const rowXml = allRows.map((row, rowIndex) => {
    const headersForRow = headers.length === 0 ? Object.keys(row) : headers;
    const cells = headersForRow.map((header, columnIndex) =>
      buildCellXml(`${columnName(columnIndex)}${rowIndex + 1}`, row[header]),
    );
    return `<row r="${rowIndex + 1}">${cells.join('')}</row>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetData>',
    ...rowXml,
    '</sheetData>',
    '</worksheet>',
  ].join('');
}

function sanitizeSheetName(name: string) {
  const trimmed = name.replace(INVALID_SHEET_NAME_PATTERN, ' ').trim();
  return (trimmed || 'Sheet').slice(0, MAX_SHEET_NAME_LENGTH);
}

function uniqueSheetNames(names: string[]) {
  const seen = new Map<string, number>();
  const usedNames = new Set<string>();
  return names.map((name) => {
    const baseName = sanitizeSheetName(name);
    const count = seen.get(baseName) ?? 0;
    seen.set(baseName, count + 1);
    let candidate = count === 0
      ? baseName
      : `${baseName.slice(0, MAX_SHEET_NAME_LENGTH - ` (${count + 1})`.length)} (${count + 1})`;
    let nextCount = count + 1;
    while (usedNames.has(candidate.toLocaleLowerCase('en-US'))) {
      nextCount += 1;
      const suffix = ` (${nextCount})`;
      candidate = `${baseName.slice(0, MAX_SHEET_NAME_LENGTH - suffix.length)}${suffix}`;
    }
    usedNames.add(candidate.toLocaleLowerCase('en-US'));
    return candidate;
  });
}

function buildWorkbookXml(sheetNames: string[]) {
  const sheetsXml = sheetNames
    .map(
      (name, index) =>
        `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join('');
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    `<sheets>${sheetsXml}</sheets>`,
    '</workbook>',
  ].join('');
}

function buildWorkbookRelsXml(sheetCount: number) {
  const relationships = Array.from({ length: sheetCount }, (_, index) => {
    const worksheetIndex = index + 1;
    return `<Relationship Id="rId${worksheetIndex}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${worksheetIndex}.xml"/>`;
  }).join('');
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    relationships,
    '</Relationships>',
  ].join('');
}

function buildRootRelsXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    '</Relationships>',
  ].join('');
}

function buildContentTypesXml(sheetCount: number) {
  const worksheetOverrides = Array.from({ length: sheetCount }, (_, index) => {
    const worksheetIndex = index + 1;
    return `<Override PartName="/xl/worksheets/sheet${worksheetIndex}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
  }).join('');
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    worksheetOverrides,
    '</Types>',
  ].join('');
}

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function dosDateTime(date: Date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { dosDate, dosTime };
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

type ZipEntry = {
  name: string;
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
  dosDate: number;
  dosTime: number;
};

function createZip(entries: Array<{ name: string; data: Uint8Array }>) {
  const now = dosDateTime(new Date());
  const normalizedEntries: ZipEntry[] = [];
  let localSize = 0;

  for (const entry of entries) {
    const nameBytes = encodeText(entry.name);
    const normalizedEntry: ZipEntry = {
      name: entry.name,
      nameBytes,
      data: entry.data,
      crc: crc32(entry.data),
      offset: localSize,
      dosDate: now.dosDate,
      dosTime: now.dosTime,
    };
    normalizedEntries.push(normalizedEntry);
    localSize += 30 + nameBytes.length + entry.data.length;
  }

  const centralDirectorySize = normalizedEntries.reduce(
    (total, entry) => total + 46 + entry.nameBytes.length,
    0,
  );
  const endSize = 22;
  const output = new Uint8Array(localSize + centralDirectorySize + endSize);
  const view = new DataView(output.buffer);
  let offset = 0;

  for (const entry of normalizedEntries) {
    writeUint32(view, offset, 0x04034b50);
    writeUint16(view, offset + 4, 20);
    writeUint16(view, offset + 6, 0);
    writeUint16(view, offset + 8, 0);
    writeUint16(view, offset + 10, entry.dosTime);
    writeUint16(view, offset + 12, entry.dosDate);
    writeUint32(view, offset + 14, entry.crc);
    writeUint32(view, offset + 18, entry.data.length);
    writeUint32(view, offset + 22, entry.data.length);
    writeUint16(view, offset + 26, entry.nameBytes.length);
    writeUint16(view, offset + 28, 0);
    output.set(entry.nameBytes, offset + 30);
    output.set(entry.data, offset + 30 + entry.nameBytes.length);
    offset += 30 + entry.nameBytes.length + entry.data.length;
  }

  const centralDirectoryOffset = offset;
  for (const entry of normalizedEntries) {
    writeUint32(view, offset, 0x02014b50);
    writeUint16(view, offset + 4, 20);
    writeUint16(view, offset + 6, 20);
    writeUint16(view, offset + 8, 0);
    writeUint16(view, offset + 10, 0);
    writeUint16(view, offset + 12, entry.dosTime);
    writeUint16(view, offset + 14, entry.dosDate);
    writeUint32(view, offset + 16, entry.crc);
    writeUint32(view, offset + 20, entry.data.length);
    writeUint32(view, offset + 24, entry.data.length);
    writeUint16(view, offset + 28, entry.nameBytes.length);
    writeUint16(view, offset + 30, 0);
    writeUint16(view, offset + 32, 0);
    writeUint16(view, offset + 34, 0);
    writeUint16(view, offset + 36, 0);
    writeUint32(view, offset + 38, 0);
    writeUint32(view, offset + 42, entry.offset);
    output.set(entry.nameBytes, offset + 46);
    offset += 46 + entry.nameBytes.length;
  }

  writeUint32(view, offset, 0x06054b50);
  writeUint16(view, offset + 4, 0);
  writeUint16(view, offset + 6, 0);
  writeUint16(view, offset + 8, normalizedEntries.length);
  writeUint16(view, offset + 10, normalizedEntries.length);
  writeUint32(view, offset + 12, centralDirectorySize);
  writeUint32(view, offset + 16, centralDirectoryOffset);
  writeUint16(view, offset + 20, 0);

  return output;
}

export function createWorkbook(sheets: WorkbookSheet[]) {
  const sanitizedSheetNames = uniqueSheetNames(sheets.map((sheet) => sheet.name));
  const entries = [
    {
      name: '[Content_Types].xml',
      data: encodeText(buildContentTypesXml(sheets.length)),
    },
    {
      name: '_rels/.rels',
      data: encodeText(buildRootRelsXml()),
    },
    {
      name: 'xl/workbook.xml',
      data: encodeText(buildWorkbookXml(sanitizedSheetNames)),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: encodeText(buildWorkbookRelsXml(sheets.length)),
    },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: encodeText(buildSheetXml(sheet.rows)),
    })),
  ];

  return createZip(entries);
}
