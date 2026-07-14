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
