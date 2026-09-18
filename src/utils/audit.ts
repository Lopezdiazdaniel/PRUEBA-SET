import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { AuditLog } from '../types';

export async function logActivity(
  action: string,
  details: string,
  performedBy: string,
  performedByName: string,
  targetUserEmail?: string
): Promise<void> {
  try {
    const newLog: Omit<AuditLog, 'id'> = {
      action,
      details,
      performedBy,
      performedByName,
      targetUserEmail: targetUserEmail || '',
      timestamp: new Date().toISOString(),
    };
    await addDoc(collection(db, 'audit_logs'), newLog);
  } catch (err) {
    console.error('Error recording audit log:', err);
  }
}
