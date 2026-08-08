import { notifyOwner } from "./_core/notification";

const NOTIFICATION_EMAIL = "ingemaireacondicionado@gmail.com";

export type NotificationType =
  | "job_created"
  | "job_status_changed"
  | "appointment_created"
  | "appointment_reminder"
  | "appointment_status_changed"
  | "note_urgent"
  | "customer_created";

interface NotificationData {
  type: NotificationType;
  title: string;
  details: Record<string, string>;
}

function formatNotificationContent(data: NotificationData): string {
  const lines: string[] = [];
  lines.push(`📋 ${data.title}`);
  lines.push("");
  lines.push(`Tipo: ${getTypeLabel(data.type)}`);
  lines.push(`Fecha: ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`);
  lines.push(`Email de destino: ${NOTIFICATION_EMAIL}`);
  lines.push("");
  lines.push("--- Detalles ---");
  for (const [key, value] of Object.entries(data.details)) {
    if (value) {
      lines.push(`${key}: ${value}`);
    }
  }
  return lines.join("\n");
}

function getTypeLabel(type: NotificationType): string {
  const labels: Record<NotificationType, string> = {
    job_created: "Nuevo Trabajo Creado",
    job_status_changed: "Cambio de Estado de Trabajo",
    appointment_created: "Nuevo Turno Agendado",
    appointment_reminder: "Recordatorio de Turno",
    appointment_status_changed: "Cambio de Estado de Turno",
    note_urgent: "Nota Urgente Creada",
    customer_created: "Nuevo Cliente Registrado",
  };
  return labels[type] || type;
}

/**
 * Send a notification to the INGEM owner via the Manus notification system.
 * This sends a push notification to the project owner's Manus dashboard.
 */
export async function sendIngemNotification(data: NotificationData): Promise<boolean> {
  try {
    const content = formatNotificationContent(data);
    const result = await notifyOwner({
      title: `INGEM: ${data.title}`,
      content,
    });
    if (result) {
      console.log(`[Notification] Sent: ${data.title}`);
    } else {
      console.warn(`[Notification] Failed to send: ${data.title}`);
    }
    return result;
  } catch (error) {
    console.error(`[Notification] Error sending notification:`, error);
    return false;
  }
}

// ========== Specific notification helpers ==========

export async function notifyJobCreated(job: {
  jobNumber: string;
  title: string;
  customerName?: string;
  status: string;
}): Promise<boolean> {
  return sendIngemNotification({
    type: "job_created",
    title: `Nuevo Trabajo #${job.jobNumber}`,
    details: {
      "Número de Trabajo": job.jobNumber,
      "Título": job.title,
      "Cliente": job.customerName || "Sin asignar",
      "Estado": job.status,
    },
  });
}

export async function notifyJobStatusChanged(job: {
  jobNumber: string;
  title: string;
  customerName?: string;
  oldStatus?: string;
  newStatus: string;
}): Promise<boolean> {
  return sendIngemNotification({
    type: "job_status_changed",
    title: `Trabajo #${job.jobNumber} cambió de estado`,
    details: {
      "Número de Trabajo": job.jobNumber,
      "Título": job.title,
      "Cliente": job.customerName || "Sin asignar",
      "Estado Anterior": job.oldStatus || "N/A",
      "Nuevo Estado": job.newStatus,
    },
  });
}

export async function notifyAppointmentCreated(appointment: {
  title: string;
  date: string;
  time?: string;
  clientName?: string;
  address?: string;
}): Promise<boolean> {
  return sendIngemNotification({
    type: "appointment_created",
    title: `Nuevo Turno: ${appointment.title}`,
    details: {
      "Título": appointment.title,
      "Fecha": appointment.date,
      "Hora": appointment.time || "Sin definir",
      "Cliente": appointment.clientName || "Sin asignar",
      "Dirección": appointment.address || "Sin dirección",
    },
  });
}

export async function notifyAppointmentStatusChanged(appointment: {
  title: string;
  date: string;
  oldStatus?: string;
  newStatus: string;
}): Promise<boolean> {
  return sendIngemNotification({
    type: "appointment_status_changed",
    title: `Turno "${appointment.title}" cambió de estado`,
    details: {
      "Título": appointment.title,
      "Fecha": appointment.date,
      "Estado Anterior": appointment.oldStatus || "N/A",
      "Nuevo Estado": appointment.newStatus,
    },
  });
}

export async function notifyUrgentNote(note: {
  title: string;
  content?: string;
  assignedTo?: string;
}): Promise<boolean> {
  return sendIngemNotification({
    type: "note_urgent",
    title: `Nota Urgente: ${note.title}`,
    details: {
      "Título": note.title,
      "Contenido": note.content?.substring(0, 200) || "Sin contenido",
      "Asignado a": note.assignedTo || "Sin asignar",
    },
  });
}

export async function notifyCustomerCreated(customer: {
  firstName: string;
  lastName: string;
  company?: string;
  email?: string;
  phone?: string;
}): Promise<boolean> {
  return sendIngemNotification({
    type: "customer_created",
    title: `Nuevo Cliente: ${customer.firstName} ${customer.lastName}`,
    details: {
      "Nombre": `${customer.firstName} ${customer.lastName}`,
      "Empresa": customer.company || "N/A",
      "Email": customer.email || "N/A",
      "Teléfono": customer.phone || "N/A",
    },
  });
}
