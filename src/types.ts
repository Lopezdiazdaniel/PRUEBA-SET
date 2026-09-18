export type UserRole = 'ADMIN' | 'RH' | 'OPERATIVO';

export type UserStatus = 'ACTIVO' | 'INACTIVO' | 'SUSPENDIDO';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  employeeCode?: string;
  phone?: string;
  assignedPost?: string;
  status: UserStatus;
  createdAt: string;
  createdBy?: string;
}

export type TaskPriority = 'URGENTE' | 'NORMAL' | 'RUTINA';
export type TaskStatus = 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADA';

export interface OperativeTask {
  id: string;
  title: string;
  description: string;
  assignedTo: string; // User UID
  assignedToName: string;
  postLocation?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  createdAt: string;
  completedAt?: string;
  completionNotes?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  details: string;
  performedBy: string; // UID or email
  performedByName: string;
  targetUserEmail?: string;
  timestamp: string;
}

export interface AppSettings {
  id: string;
  companyName: string;
  emergencyHotline: string;
  shiftToleranceMinutes: number;
  securityLevel: string;
  alertBroadcast: string;
  requirePhotoCheckin: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export type IncidentSeverity = 'BAJA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type IncidentStatus = 'ABIERTO' | 'EN_REVISION' | 'RESUELTO';

export interface IncidentReport {
  id: string;
  reportedBy: string;
  reportedByName: string;
  guardCode?: string;
  postLocation: string;
  severity: IncidentSeverity;
  category: string;
  title: string;
  description: string;
  status: IncidentStatus;
  timestamp: string;
  resolutionNotes?: string;
}

export type ShiftType = 'MATUTINO_12H' | 'NOCTURNO_12H' | '24X24' | 'JORNADA_8H';
export type AttendanceStatus = 'EN_TURNO' | 'FINALIZADO' | 'RETARDO';

export interface AttendanceRecord {
  id: string;
  guardUid: string;
  guardName: string;
  guardCode?: string;
  postLocation: string;
  checkInTime: string;
  checkOutTime?: string;
  shift: ShiftType;
  status: AttendanceStatus;
  notes?: string;
}

export interface RHRecord {
  id: string;
  employeeUid: string;
  employeeName: string;
  curp: string;
  nss: string;
  contractType: string;
  antidopingStatus: 'APROBADO' | 'PENDIENTE' | 'RECHAZADO';
  antidopingDate?: string;
  psicometricoStatus: 'APTO' | 'NO_APTO' | 'EN_EVALUACION';
  licenciaArmas?: string;
  emergencyContact: string;
  salaryBase: string;
  observations?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface SecurityPost {
  id: string;
  name: string;
  client: string;
  address: string;
  requiredGuards: number;
  contactPhone: string;
  active: boolean;
}
