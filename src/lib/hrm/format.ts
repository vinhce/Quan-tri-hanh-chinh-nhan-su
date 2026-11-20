export function formatCurrencyVN(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return '0 đ';
  const rounded = Math.round(amount);
  return `${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} đ`;
}

export function formatDateVN(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function formatDateTimeVN(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${hours}:${mins} ${day}/${month}/${year}`;
}

export function sanitizeText(text: string, minLength = 10, maxLength = 300): { valid: boolean; value: string; error?: string } {
  if (!text) {
    return { valid: false, value: '', error: 'Nội dung không được để trống.' };
  }
  const cleaned = text.replace(/<[^>]*>?/gm, '').trim();
  if (cleaned.length < minLength) {
    return {
      valid: false,
      value: cleaned,
      error: `Nội dung quá ngắn (tối thiểu ${minLength} ký tự).`,
    };
  }
  if (cleaned.length > maxLength) {
    return {
      valid: false,
      value: cleaned.slice(0, maxLength),
      error: `Nội dung vượt quá giới hạn cho phép (${maxLength} ký tự).`,
    };
  }
  return { valid: true, value: cleaned };
}
