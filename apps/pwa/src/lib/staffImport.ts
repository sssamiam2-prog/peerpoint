/**
 * Parse CSV or Excel staff invite spreadsheets into invite rows.
 * Expected columns (header names are flexible): firstName, lastName, bureau, jobTitle, email, cellPhone, role
 */

export type StaffImportRow = {
  firstName: string;
  lastName: string;
  bureau: string;
  jobTitle: string;
  email: string;
  cellPhone: string;
  role: 'staff' | 'admin';
  line: number;
};

export type StaffImportParseResult = {
  rows: StaffImportRow[];
  errors: string[];
};

function normHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function mapHeader(h: string): keyof StaffImportRow | null {
  const n = normHeader(h);
  if (['firstname', 'first', 'fname', 'givenname'].includes(n)) return 'firstName';
  if (['lastname', 'last', 'lname', 'surname', 'familyname'].includes(n)) return 'lastName';
  if (['bureau', 'division', 'unit', 'department', 'dept'].includes(n)) return 'bureau';
  if (['jobtitle', 'title', 'position', 'rank'].includes(n)) return 'jobTitle';
  if (['email', 'emailaddress', 'workemail', 'mail'].includes(n)) return 'email';
  if (['cellphone', 'cell', 'mobile', 'phone', 'phonenumber', 'mobilephone'].includes(n)) return 'cellPhone';
  if (['role', 'access', 'type'].includes(n)) return 'role';
  return null;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ',') {
      row.push(cur);
      cur = '';
      continue;
    }
    if (ch === '\n' || (ch === '\r' && next === '\n')) {
      if (ch === '\r') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      continue;
    }
    if (ch === '\r') {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  return rows.filter(r => r.some(c => c.trim().length > 0));
}

function rowsFromMatrix(matrix: string[][]): StaffImportParseResult {
  const errors: string[] = [];
  if (matrix.length < 2) {
    return { rows: [], errors: ['File needs a header row and at least one data row.'] };
  }
  const header = matrix[0]!.map(mapHeader);
  const required: (keyof StaffImportRow)[] = [
    'firstName',
    'lastName',
    'bureau',
    'jobTitle',
    'email',
    'cellPhone'
  ];
  for (const key of required) {
    if (!header.includes(key)) {
      errors.push(`Missing required column: ${key}`);
    }
  }
  if (errors.length) return { rows: [], errors };

  const rows: StaffImportRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const line = i + 1;
    const cells = matrix[i]!;
    const get = (key: keyof StaffImportRow): string => {
      const idx = header.indexOf(key);
      return idx >= 0 ? String(cells[idx] ?? '').trim() : '';
    };
    const roleRaw = get('role').toLowerCase();
    const role: 'staff' | 'admin' = roleRaw === 'admin' ? 'admin' : 'staff';
    const row: StaffImportRow = {
      firstName: get('firstName'),
      lastName: get('lastName'),
      bureau: get('bureau'),
      jobTitle: get('jobTitle'),
      email: get('email'),
      cellPhone: get('cellPhone'),
      role,
      line
    };
    if (!row.firstName && !row.lastName && !row.email) continue;
    const missing = required.filter(k => !String(row[k] ?? '').trim());
    if (missing.length) {
      errors.push(`Row ${line}: missing ${missing.join(', ')}`);
      continue;
    }
    rows.push(row);
  }
  return { rows, errors };
}

async function matrixFromXlsx(file: File): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false }) as string[][];
}

export async function parseStaffImportFile(file: File): Promise<StaffImportParseResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    const text = await file.text();
    return rowsFromMatrix(parseCsv(text));
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    try {
      const matrix = await matrixFromXlsx(file);
      return rowsFromMatrix(matrix.map(r => r.map(c => String(c ?? ''))));
    } catch {
      return {
        rows: [],
        errors: ['Could not read that Excel file. Save as .xlsx or export CSV and try again.']
      };
    }
  }
  return {
    rows: [],
    errors: ['Use a .csv or .xlsx file.']
  };
}

/** Downloadable CSV template for Admins. */
export function staffImportTemplateCsv(): string {
  return [
    'firstName,lastName,bureau,jobTitle,email,cellPhone,role',
    'Sam,Example,Corrections,Peer Support,sam.example@slco.org,8015550100,staff'
  ].join('\n');
}
