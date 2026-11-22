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

export function formatEmployeeCode(year: number, sequence: number): string {
  return `NV-${year}-${padZero(sequence, 3)}`;
}

export function formatContractCode(
  year: number,
  sequence: number,
  contractType: string = 'FIXED_TERM'
): string {
  const normalized = (contractType || '').trim().toUpperCase();
  let prefix = 'HDLD';
  if (normalized.startsWith('PROBATION')) {
    prefix = 'HDTV';
  } else if (normalized === 'ADDENDUM' || normalized.startsWith('PL')) {
    prefix = 'PLHD';
  }
  return `${prefix}-${year}-${padZero(sequence, 3)}`;
}

export function formatDecisionNo(
  year: number,
  sequence: number,
  categoryPrefix: string = ''
): string {
  const cleanPrefix = categoryPrefix.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const seqPart = padZero(sequence, 3);
  return cleanPrefix ? `QD-${year}-${cleanPrefix}${seqPart}` : `QD-${year}-${seqPart}`;
}

export function formatResignationCode(year: number, sequence: number): string {
  return `TV-${year}-${padZero(sequence, 3)}`;
}

export function formatPayrollCode(
  periodOrYear: string | number,
  sequence: number,
  isFinalSettlement = false
): string {
  const cleanPeriod = String(periodOrYear).trim().replace(/[^0-9]/g, '');
  const prefix = isFinalSettlement ? 'QT' : 'BL';
  return `${prefix}-${cleanPeriod}-${padZero(sequence, 3)}`;
}

export function formatLeaveRequestCode(year: number, sequence: number): string {
  return `NP-${year}-${padZero(sequence, 3)}`;
}

export function formatReviewCode(year: number, sequence: number): string {
  return `DG-${year}-${padZero(sequence, 3)}`;
}

export function formatEventId(prefix = 'evt'): string {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0');
  return `${prefix}-${ts}-${rand}`;
}
