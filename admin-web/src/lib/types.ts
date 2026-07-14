export type UserRole = 'SUPER_ADMIN' | 'INSTALLER' | 'DEVELOPER' | 'DESIGNER' | 'LIAISON' | 'ADMIN_STAFF' | 'SALES_STAFF';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;          // primary role — determines dashboard & nav
  roles: UserRole[];       // all roles (primary + additional) — determines API access
  fullName: string;
}

export interface TeamMember extends AuthenticatedUser {
  phone: string | null;
  isActive: boolean;
  mfaEnabled: boolean;
  baseBonus: string;
  createdAt: string;
  additionalRoles: { role: UserRole }[];
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthenticatedUser;
}

export type ClientStatus = 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';
export type ClientType = 'SOFTWARE' | 'ADVERTISING';

export interface Client {
  id: string;
  clientCode: string;
  businessName: string;
  ownerName: string;
  contactNo: string;
  email: string | null;
  address: string | null;
  status: ClientStatus;
  clientType: ClientType;
  createdAt: string;
}

export type LicenseType = 'SUBSCRIPTION_MONTHLY' | 'SUBSCRIPTION_ANNUAL' | 'LIFETIME';

export interface SoftwareProduct {
  id: string;
  productName: string;
  version: string;
  licenseType: LicenseType;
  price: string;
  maintenanceFee: string | null;
}

export type LicenseStatus = 'PENDING' | 'ACTIVATED' | 'EXPIRED' | 'SUSPENDED';

export interface License {
  id: string;
  licenseKey: string;
  clientId: string;
  productId: string;
  activatedById: string | null;
  status: LicenseStatus;
  activationDate: string | null;
  expirationDate: string | null;
  client?: Client;
  product?: SoftwareProduct;
}

export type JobStatus = 'ASSIGNED' | 'ON_GOING' | 'WAITING_ACTIVATION' | 'COMPLETED' | 'CANCELLED';

export interface InstallationProof {
  id: string;
  jobId: string;
  clientSignature: string | null;
  photoUrls: string[];
  gpsLatitude: string | null;
  gpsLongitude: string | null;
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
  client?: Client;
  installer?: AuthenticatedUser | null;
  license?: License | null;
  proof?: InstallationProof | null;
}

export interface DownloadLead {
  id: string;
  companyName: string;
  contactPerson: string;
  contactNo: string;
  email: string | null;
  emailVerified: boolean;
  platform: 'ANDROID_APK' | 'DESKTOP_PWA';
  createdAt: string;
}

export interface HardwareFingerprint {
  cpu: string;
  disk: string;
  mac: string;
}

export type EarningStatus = 'PENDING' | 'APPROVED' | 'PAID';
export type EarningType = 'INSTALLATION' | 'ACTIVATION' | 'BONUS' | 'COMMISSION';

export interface Earning {
  id: string;
  userId: string;
  amount: string;
  type: EarningType;
  status: EarningStatus;
  createdAt: string;
  user?: Pick<AuthenticatedUser, 'fullName' | 'role'>;
  job?: Job;
}

export type WithdrawalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'RELEASED';
export type WithdrawalMethod = 'GCASH' | 'MAYA' | 'BANK_TRANSFER';

export interface Withdrawal {
  id: string;
  userId: string;
  amount: string;
  method: WithdrawalMethod;
  accountName: string;
  accountNumber: string;
  status: WithdrawalStatus;
  proofUrl?: string | null;
  createdAt?: string;
  user?: AuthenticatedUser;
}

export type DiscountType = 'FIXED' | 'PERCENTAGE';
export type JobOrderStatus = 'DRAFT' | 'FINALIZED' | 'ON_GOING' | 'COMPLETED' | 'CANCELLED';

export interface JobOrderItem {
  id: string;
  jobOrderId: string;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: string;
  inventoryItemId: string | null;
  createdAt: string;
}

export interface JobOrder {
  id: string;
  jobId: string | null;
  clientId: string;
  productId: string | null;
  salePrice: string;
  discount: string;
  discountType: DiscountType;
  remarks: string | null;
  status: JobOrderStatus;
  createdAt: string;
  updatedAt: string;
  job?: Job;
  client?: Client;
  product?: SoftwareProduct;
  items: JobOrderItem[];
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
  recordedById: string;
  voidedAt: string | null;
  voidReason: string | null;
  voidedById: string | null;
  createdAt: string;
}

export interface JobOrderPayments {
  grandTotal: number;
  totalPaid: number;
  balance: number;
  payments: Payment[];
}

export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  ipAddress: string | null;
  device: string | null;
  createdAt: string;
  user?: AuthenticatedUser | null;
}

export interface CompanyProfile {
  id: string | null;
  businessName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  tin: string | null;
  logoUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface BackupFile {
  filename: string;
  size: number;
  createdAt: string;
}

export interface FinancialSummary {
  totalRevenue: number;
  currentMonthRevenue: number;
  prevMonthRevenue: number;
  growth: number;
  revenueByProduct: { label: string; value: number }[];
}

export interface RevenueTrend {
  label: string;
  value: number;
}

export interface KpiDefinitionRow {
  id: string;
  name: string;
  weight: number;
  target: number;
  unit: string;
  auto: boolean;
  isCustom: boolean;
}

export interface KpiMetric {
  name: string;
  actual: number;
  target: number;
  weight: number;
  unit: string;
  score: number;
  isManual: boolean;
}

export interface KpiDashboard {
  kpis: KpiMetric[];
  totalScore: number;
  baseBonus: number;
  incentiveEstimate: number;
  incentiveStatus: 'PENDING' | 'APPROVED' | 'PAID' | null;
  incentiveAmount: number | null;
}

export interface TeamMemberKpi extends KpiDashboard {
  userId: string;
  fullName: string;
  role: UserRole;
}

export type IncentiveStatus = 'PENDING' | 'APPROVED' | 'PAID';

export interface Incentive {
  id: string;
  userId: string;
  month: number;
  year: number;
  totalScore: number;
  baseBonus: string;
  bonusAmount: string;
  status: IncentiveStatus;
  remarks: string | null;
  createdAt: string;
  user?: Pick<AuthenticatedUser, 'fullName' | 'role'>;
}

export interface NenposClient {
  id: string;
  clientId: string;
  clientName: string;
  startDate: string | null;
  expiryDate: string | null;
  license: string | null;
  status: string | null;
  installer: string | null;
  notes: string | null;
  address: string | null;
  uploadedAt: string;
  uploadedBy: string | null;
}

export type DevProjectStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'PENDING' | 'COMPLETED';
export type DevReportStatus = 'PENDING' | 'REVIEWED';

export interface ChecklistItem {
  label: string;
  done: boolean;
}

export interface DevProjectSession {
  id: string;
  projectId: string;
  startedAt: string;
  endedAt: string | null;
  minutes: number | null;
}

export interface DevReportFeedbackEntry {
  id: string;
  reportId: string;
  authorId: string;
  message: string;
  createdAt: string;
  author?: { id: string; fullName: string; role: UserRole };
}

export interface DevProjectReport {
  id: string;
  projectId: string;
  authorId: string;
  title: string;
  comment: string | null;
  checklist: ChecklistItem[];
  taggedAdminId: string | null;
  status: DevReportStatus;
  createdAt: string;
  updatedAt: string;
  author?: { id: string; fullName: string; role: UserRole };
  taggedAdmin?: { id: string; fullName: string } | null;
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
  startedAt: string | null;
  createdAt: string;
  updatedAt: string;
  developer?: { id: string; fullName: string };
  sessions?: DevProjectSession[];
  reports?: DevProjectReport[];
}

export interface ResetModuleInfo {
  id: string;
  label: string;
  description: string;
  count: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  description: string | null;
  barcode: string | null;
  unitPrice: string; // Decimal serialized as string
  stockQty: number;
  lowStockAlert: number;
  sortOrder: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type StockMovementReason = 'MANUAL_ADJUST' | 'JOB_ORDER_DEDUCTION' | 'JOB_ORDER_RESTORE';

export interface StockMovement {
  id: string;
  inventoryItemId: string;
  delta: number;
  balance: number;
  reason: StockMovementReason;
  jobOrderId: string | null;
  note: string | null;
  userId: string | null;
  createdAt: string;
}
