/**
 * Agenda message generator for sharing daily schedule with technicians.
 */
import type { Appointment } from '@/types/appointment';
import { mapsUrl } from '@/lib/contactUtils';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function formatDateForMessage(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekday = WEEKDAYS[date.getDay()];
  return `${weekday} ${d}/${String(m).padStart(2, '0')}`;
}

function formatTime(time: string): string {
  // time is "HH:MM" format
  return time;
}

/**
 * Generate a single appointment message block.
 */
export function generateAppointmentMessage(apt: Appointment, index?: number): string {
  const lines: string[] = [];
  const prefix = index !== undefined ? `${index}. ` : '';

  lines.push(`${prefix}${formatTime(apt.time)} – ${apt.title} (${apt.duration} min)`);

  if (apt.address && apt.address.trim()) {
    lines.push(`📍 ${apt.address}`);
    lines.push(`🗺️ ${mapsUrl(apt.address)}`);
  } else {
    lines.push(`📍 (sin dirección cargada)`);
  }

  lines.push(`👤 ${apt.clientName}${apt.clientPhone ? ` – ${apt.clientPhone}` : ''}`);

  if (apt.notes && apt.notes.trim()) {
    lines.push(`📝 ${apt.notes}`);
  }

  if (apt.productNames && apt.productNames.length > 0 && apt.productNames.some(p => p.trim())) {
    lines.push(`🔩 ${apt.productNames.filter(p => p.trim()).join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Generate the full day agenda message.
 * @param date - Date string in YYYY-MM-DD format
 * @param appointments - All appointments for the day (will be filtered to non-cancelled)
 * @param technicianName - Name of the technician (or "equipo" for all)
 * @param filterTechnicianId - If provided, only include appointments where this technician is assigned
 */
export function generateDayAgendaMessage(
  date: string,
  appointments: Appointment[],
  technicianName: string,
  filterTechnicianId?: string
): string {
  // Filter non-cancelled and optionally by technician
  let filtered = appointments
    .filter(a => a.date === date && a.status !== 'cancelled');

  if (filterTechnicianId) {
    filtered = filtered.filter(a => a.technicianIds.includes(filterTechnicianId));
  }

  // Sort by time
  filtered.sort((a, b) => a.time.localeCompare(b.time));

  const header = `🔧 INGEM – Agenda ${formatDateForMessage(date)}`;
  const greeting = `Hola ${technicianName}!`;

  if (filtered.length === 0) {
    return `${header}\n${greeting}\n\nNo hay turnos programados para este día.`;
  }

  const appointmentBlocks = filtered.map((apt, idx) =>
    generateAppointmentMessage(apt, idx + 1)
  );

  return `${header}\n${greeting}\n\n${appointmentBlocks.join('\n\n')}`;
}
