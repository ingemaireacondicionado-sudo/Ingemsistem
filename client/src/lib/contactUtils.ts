/**
 * Centralized contact utility helpers.
 * Used across Dashboard, Calendar, and sharing features.
 */

/** Remove all non-numeric characters except '+' */
export function cleanPhone(phone: string): string {
  return phone.replace(/[^0-9+]/g, '');
}

/**
 * Generate a WhatsApp URL for an Argentine phone number.
 * Handles the 549 prefix requirement for Argentina.
 * @param phone - Phone number string
 * @param text - Optional message text to pre-fill
 */
export function whatsappUrl(phone: string, text?: string): string {
  let clean = cleanPhone(phone).replace('+', '');
  if (clean.startsWith('0')) clean = clean.slice(1);
  if (clean.startsWith('549')) {
    // Already correct format
  } else if (clean.startsWith('54')) {
    clean = '549' + clean.slice(2);
  } else {
    clean = '549' + clean;
  }
  let url = `https://wa.me/${clean}`;
  if (text) {
    url += `?text=${encodeURIComponent(text)}`;
  }
  return url;
}

/** Generate a Google Maps search URL for an address */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(address)}`;
}
