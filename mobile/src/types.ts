export type UserRole =
  | 'SUPER_ADMIN'
  | 'INSTALLER'
  | 'DEVELOPER'
  | 'DESIGNER'
  | 'LIAISON'
  | 'ADMIN_STAFF'
  | 'SALES_STAFF';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  roles: UserRole[];
  fullName: string;
}

export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export type JobStatus =
  | 'ASSIGNED'
  | 'ON_GOING'
  | 'WAITING_ACTIVATION'
  | 'COMPLETED'
  | 'CANCELLED';

export interface InstallationProof {
  id: string;
  photoUrls: string[];
  capturedAt: string;
}

export interface Job {
  id: string;
  clientId: string;
  installerId: string | null;
  licenseId: string | null;
  scheduleDate: string;
  jobStatus: JobStatus;
  remarks: string | null;
  client?: { businessName: string; ownerName: string; contactNo: string; address: string | null };
  license?: { status: string } | null;
  proof?: InstallationProof | null;
}

export interface Earning {
  id: string;
  amount: string;
  type: string;
  status: string;
  createdAt: string;
}

export interface Withdrawal {
  id: string;
  amount: string;
  method: string;
  status: string;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  eventType: string;
  data?: { route?: string } | null;
  readAt: string | null;
  createdAt: string;
}

// ── Admin entities ──────────────────────────────────────────────────────────

export interface Client {
  id: string;
  clientCode: string;
  businessName: string;
  ownerName: string;
  contactNo: string;
  email?: string | null;
  address?: string | null;
  status: string;
  clientType: string;
}

export interface Product {
  id: string;
  productName: string;
  version: string;
  licenseType: string;
  price: string;
}

export interface License {
  id: string;
  licenseKey: string;
  status: string;
  activationDate?: string | null;
  expirationDate?: string | null;
  client?: { businessName: string };
  product?: { productName: string };
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  phone?: string | null;
}

export interface JobOrder {
  id: string;
  type: string;
  status: string;
  salePrice: string;
  client?: { businessName: string };
  product?: { productName: string } | null;
  createdAt: string;
}

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'GCASH' | 'CHECK';

export interface Payment {
  id: string;
  jobOrderId: string;
  amount: string;
  method: PaymentMethod;
  referenceNo: string | null;
  proofPhotoUrl: string | null;
  paidAt: string;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface JobOrderPaymentsResponse {
  grandTotal: number;
  totalPaid: number;
  balance: number;
  payments: Payment[];
}

export interface AuditLog {
  id: string;
  action: string;
  ipAddress?: string | null;
  createdAt: string;
  user?: { fullName: string; email: string } | null;
}

// ── Dev projects ────────────────────────────────────────────────────────────

export type DevProjectStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'PENDING' | 'COMPLETED';
export type DevReportStatus = 'PENDING' | 'REVIEWED';

export interface ChecklistItem {
  label: string;
  done: boolean;
  /** ISO timestamp of when the item was ticked; null while unticked. */
  doneAt?: string | null;
  /** Full name of whoever ticked it; null while unticked. */
  doneBy?: string | null;
  note?: string | null;
}

export interface DevProjectSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number | null;
}

export interface DevReportFeedbackEntry {
  id: string;
  message: string;
  createdAt: string;
  author?: { fullName: string };
}

export interface DevProjectReport {
  id: string;
  authorId: string;
  title: string;
  comment: string | null;
  checklist: ChecklistItem[];
  status: DevReportStatus;
  createdAt: string;
  author?: { fullName: string };
  taggedAdmin?: { fullName: string } | null;
  feedback?: DevReportFeedbackEntry[];
}

export interface DevProject {
  id: string;
  name: string;
  description: string | null;
  developerId: string;
  status: DevProjectStatus;
  progressPercent: number;
  totalMinutes: number;
  /** Seconds banked by pauses within the current run (resets on start/stop). */
  runSeconds: number;
  targetHours: number | null;
  projectStart: string | null;
  projectDeadline: string | null;
  /** Non-null only while the timer is actively running (null = paused). */
  startedAt: string | null;
  updatedAt: string;
  developer?: { id: string; fullName: string };
  sessions?: DevProjectSession[];
  reports?: DevProjectReport[];
}
