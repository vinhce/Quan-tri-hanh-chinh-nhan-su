export function padZero(num: number, size = 2): string {
  let s = num.toString();
  while (s.length < size) s = '0' + s;
  return s;
}

export function formatProposalCode(year: number, deptPrefix: string, sequence: number): string {
  const cleanPrefix = deptPrefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `YC-${year}-${cleanPrefix}${padZero(sequence, 2)}`;
}

export function formatJobCode(year: number, deptPrefix: string, sequence: number): string {
  const cleanPrefix = deptPrefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `JD-${year}-${cleanPrefix}${padZero(sequence, 2)}`;
}

export function formatCandidateCode(year: number, sequence: number): string {
  return `UV-${year}-${padZero(sequence, 3)}`;
}

export function formatEventId(prefix = 'evt'): string {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0');
  return `${prefix}-${ts}-${rand}`;
}
