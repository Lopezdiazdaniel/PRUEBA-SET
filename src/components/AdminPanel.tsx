import React, { useState, useEffect } from 'react';
import { 
  Building2, Users, ShieldAlert, Clock, MapPin, 
  Plus, Edit, Trash2, Search, AlertCircle, CheckCircle, Lock, Shield,
  Activity, Sliders, CheckSquare, AlertTriangle, RefreshCw, Send,
  UserCheck, ShieldCheck, HelpCircle
} from 'lucide-react';
import { 
  collection, query, doc, setDoc, updateDoc, 
  deleteDoc, onSnapshot, getDoc, orderBy, limit 
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  UserProfile, UserRole, UserStatus, SecurityPost, AuditLog, AppSettings, OperativeTask 
} from '../types';
import { logActivity } from '../utils/audit';

interface AdminPanelProps {
  currentUser: UserProfile;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'tasks' | 'audit' | 'settings' | 'posts'>('users');
  
  // Data lists
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [posts, setPosts] = useState<SecurityPost[]>([]);
  const [tasks, setTasks] = useState<OperativeTask[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    id: 'general',
    companyName: 'SegurControl Pro - Seguridad Privada Integral',
    emergencyHotline: '800-911-7348',
    shiftToleranceMinutes: 15,
    securityLevel: 'NORMAL',
    alertBroadcast: 'Servicios operando bajo condiciones normales en todos los puestos.',
    requirePhotoCheckin: true,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states for creating/editing users
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [userFormData, setUserFormData] = useState({
    email: '',
    displayName: '',
    role: 'OPERATIVO' as UserRole,
    employeeCode: '',
    phone: '',
    assignedPost: '',
    status: 'ACTIVO' as UserStatus,
  });

  // Form states for tasks (consignas operativas)
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskFormData, setTaskFormData] = useState({
    title: '',
    description: '',
    assignedTo: '',
    postLocation: '',
    priority: 'NORMAL' as const,
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  });

  // Form states for creating/editing security posts
  const [showPostModal, setShowPostModal] = useState(false);
  const [postFormData, setPostFormData] = useState({
    id: '',
    name: '',
    client: '',
    address: '',
    requiredGuards: 2,
    contactPhone: '',
    active: true,
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [auditFilter, setAuditFilter] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    // 1. Real-time listener for users
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const uList: UserProfile[] = [];
      snapshot.forEach((docSnap) => {
        uList.push(docSnap.data() as UserProfile);
      });
      setUsers(uList);
      setLoading(false);
    }, (err) => {
      console.error('Error fetching users:', err);
      setError('No se pudieron sincronizar los usuarios.');
      setLoading(false);
    });

    // 2. Real-time listener for posts
    const unsubPosts = onSnapshot(collection(db, 'posts'), (snapshot) => {
      const pList: SecurityPost[] = [];
      snapshot.forEach((docSnap) => {
        pList.push({ id: docSnap.id, ...docSnap.data() } as SecurityPost);
      });
      setPosts(pList);
    });

    // 3. Real-time listener for tasks
    const unsubTasks = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      const tList: OperativeTask[] = [];
      snapshot.forEach((docSnap) => {
        tList.push({ id: docSnap.id, ...docSnap.data() } as OperativeTask);
      });
      tList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setTasks(tList);
    });

    // 4. Real-time listener for audit logs
    const unsubAudit = onSnapshot(collection(db, 'audit_logs'), (snapshot) => {
      const aList: AuditLog[] = [];
      snapshot.forEach((docSnap) => {
        aList.push({ id: docSnap.id, ...docSnap.data() } as AuditLog);
      });
      aList.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setAuditLogs(aList);
    });

    // 5. Load settings
    const loadSettings = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'general'));
        if (snap.exists()) {
          setSettings(snap.data() as AppSettings);
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      }
    };
    loadSettings();

    return () => {
      unsubUsers();
      unsubPosts();
      unsubTasks();
      unsubAudit();
    };
  }, []);

  // 1. CREATE OR UPDATE USER
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const emailTrimmed = userFormData.email.trim().toLowerCase();
    if (!emailTrimmed) {
      setError('El correo electrónico es obligatorio.');
      return;
    }

    try {
      if (editingUser) {
        // Update user
        const ref = doc(db, 'users', editingUser.uid);
        const oldRole = editingUser.role;
        const newRole = userFormData.role;

        await updateDoc(ref, {
          role: newRole,
          displayName: userFormData.displayName,
          employeeCode: userFormData.employeeCode,
          phone: userFormData.phone,
          assignedPost: userFormData.assignedPost,
          status: userFormData.status,
        });

        // Audit Log
        let details = `Modificación de perfil del usuario: ${userFormData.displayName} (${emailTrimmed}). Estado: ${userFormData.status}.`;
        if (oldRole !== newRole) {
          details += ` Cambio de rol: de ${oldRole} a ${newRole}.`;
        }
        await logActivity(
          'USUARIO_ACTUALIZADO',
          details,
          currentUser.uid,
          currentUser.displayName,
          emailTrimmed
        );

        setSuccess(`Perfil de ${userFormData.displayName} actualizado con éxito.`);
      } else {
        // Create new user profile authorization
        const pseudoUid = 'usr_' + emailTrimmed.replace(/[^a-zA-Z0-9]/g, '_');
        const ref = doc(db, 'users', pseudoUid);

        const newProfile: UserProfile = {
          uid: pseudoUid,
          email: emailTrimmed,
          displayName: userFormData.displayName,
          role: userFormData.role,
          employeeCode: userFormData.employeeCode || `SEG-${Math.floor(1000 + Math.random() * 9000)}`,
          phone: userFormData.phone,
          assignedPost: userFormData.assignedPost,
          status: userFormData.status,
          createdAt: new Date().toISOString(),
          createdBy: currentUser.email,
        };

        await setDoc(ref, newProfile);

        // Audit Log
        await logActivity(
          'USUARIO_CREADO',
          `Alta de nuevo elemento autorizado: ${newProfile.displayName} con rol [${newProfile.role}] y código [${newProfile.employeeCode}].`,
          currentUser.uid,
          currentUser.displayName,
          emailTrimmed
        );

        setSuccess(`Perfil autorizado creado para ${emailTrimmed}. Cuando inicie sesión con su cuenta Google, el sistema validará sus permisos.`);
      }

      setShowUserModal(false);
      setEditingUser(null);
      setUserFormData({
        email: '',
        displayName: '',
        role: 'OPERATIVO',
        employeeCode: '',
        phone: '',
        assignedPost: '',
        status: 'ACTIVO',
      });
    } catch (err: any) {
      console.error('Error saving user:', err);
      setError(err.message || 'Error al guardar el perfil.');
    }
  };

  // 2. DELETE USER
  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      if (userToDelete.email === currentUser.email) {
        setError('No puedes eliminar tu propia cuenta de administrador.');
        setUserToDelete(null);
        return;
      }

      await deleteDoc(doc(db, 'users', userToDelete.uid));

      // Audit Log
      await logActivity(
        'USUARIO_ELIMINADO',
        `Eliminación definitiva de cuenta y revocación de accesos para: ${userToDelete.displayName} (${userToDelete.email}), Rol: ${userToDelete.role}.`,
        currentUser.uid,
        currentUser.displayName,
        userToDelete.email
      );

      setSuccess(`La cuenta de ${userToDelete.displayName} fue eliminada del sistema.`);
      setUserToDelete(null);
    } catch (err: any) {
      console.error('Error deleting user:', err);
      setError('Error al eliminar la cuenta de usuario.');
    }
  };

  // 3. CREATE OPERATIVE TASK (CONSIGNA)
  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskFormData.title || !taskFormData.assignedTo) {
      setError('Debes especificar un título y seleccionar el elemento operativo asignado.');
      return;
    }

    const assignedUser = users.find(u => u.uid === taskFormData.assignedTo);
    const assignedName = assignedUser ? assignedUser.displayName : 'Guardia Operativo';

    try {
      const taskId = 'task_' + Date.now();
      const newTask: OperativeTask = {
        id: taskId,
        title: taskFormData.title,
        description: taskFormData.description,
        assignedTo: taskFormData.assignedTo,
        assignedToName: assignedName,
        postLocation: taskFormData.postLocation || assignedUser?.assignedPost || 'Puesto Central',
        priority: taskFormData.priority,
        status: 'PENDIENTE',
        dueDate: taskFormData.dueDate,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'tasks', taskId), newTask);

      // Audit Log
      await logActivity(
        'CONSIGNA_ASIGNADA',
        `Nueva consigna/tarea asignada a ${assignedName}: "${newTask.title}" con prioridad ${newTask.priority}.`,
        currentUser.uid,
        currentUser.displayName,
        assignedUser?.email
      );

      setSuccess(`Consigna asignada correctamente a ${assignedName}.`);
      setShowTaskModal(false);
      setTaskFormData({
        title: '',
        description: '',
        assignedTo: '',
        postLocation: '',
        priority: 'NORMAL',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });
    } catch (err: any) {
      console.error('Error saving task:', err);
      setError('Error al asignar la consigna.');
    }
  };

  // 4. SAVE GENERAL SETTINGS
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setError(null);
    try {
      const updated: AppSettings = {
        ...settings,
        id: 'general',
        updatedAt: new Date().toISOString(),
        updatedBy: currentUser.displayName,
      };
      await setDoc(doc(db, 'settings', 'general'), updated);

      // Audit Log
      await logActivity(
        'CONFIGURACION_ACTUALIZADA',
        `Ajustes generales actualizados: Nivel de seguridad [${settings.securityLevel}], Tolerancia [${settings.shiftToleranceMinutes} min].`,
        currentUser.uid,
        currentUser.displayName
      );

      setSuccess('Ajustes generales de la aplicación guardados correctamente.');
    } catch (err: any) {
      console.error('Error updating settings:', err);
      setError('Error al actualizar la configuración general.');
    } finally {
      setSavingSettings(false);
    }
  };

  // 5. SAVE POST
  const handleSavePost = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const postId = postFormData.id || 'post_' + Date.now();
      const ref = doc(db, 'posts', postId);
      await setDoc(ref, {
        name: postFormData.name,
        client: postFormData.client,
        address: postFormData.address,
        requiredGuards: Number(postFormData.requiredGuards),
        contactPhone: postFormData.contactPhone,
        active: postFormData.active,
      });

      await logActivity(
        'PUESTO_REGISTRADO',
        `Puesto de seguridad configurado: "${postFormData.name}" para cliente "${postFormData.client}".`,
        currentUser.uid,
        currentUser.displayName
      );

      setShowPostModal(false);
      setPostFormData({
        id: '',
        name: '',
        client: '',
        address: '',
        requiredGuards: 2,
        contactPhone: '',
        active: true,
      });
      setSuccess('Puesto operativo guardado correctamente.');
    } catch (err: any) {
      setError(err.message || 'Error al guardar puesto.');
    }
  };

  const filteredUsers = users.filter((u) => 
    u.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.employeeCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.assignedPost?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredAudit = auditLogs.filter((log) => 
    !auditFilter || 
    log.action.toLowerCase().includes(auditFilter.toLowerCase()) ||
    log.performedByName?.toLowerCase().includes(auditFilter.toLowerCase()) ||
    log.details.toLowerCase().includes(auditFilter.toLowerCase())
  );

  return (
    <div className="space-y-6" id="admin-panel-container">
      {/* Header section with Centralized Admin Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-950/80 text-red-400 border border-red-800/50">
              <Lock className="w-3 h-3" /> Panel Central de Administración PWA
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
            Gestión Centralizada y Control Maestro
          </h1>
          <p className="text-sm text-slate-400">
            Control integral de usuarios, asignación estricta de roles, auditoría operativa y ajustes de la plataforma.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            id="btn-add-user"
            onClick={() => {
              setEditingUser(null);
              setUserFormData({
                email: '',
                displayName: '',
                role: 'OPERATIVO',
                employeeCode: `SEG-${Math.floor(1000 + Math.random() * 9000)}`,
                phone: '',
                assignedPost: posts[0]?.name || '',
                status: 'ACTIVO',
              });
              setShowUserModal(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium shadow-md transition"
          >
            <Plus className="w-4 h-4" /> Crear Cuenta de Usuario
          </button>

          <button
            id="btn-add-task"
            onClick={() => {
              setShowTaskModal(true);
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-sm font-medium transition"
          >
            <CheckSquare className="w-4 h-4 text-emerald-400" /> Asignar Consigna
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-red-950/50 border border-red-800/60 rounded-lg text-red-300 text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs text-red-400 hover:underline">Cerrar</button>
        </div>
      )}
      {success && (
        <div className="p-4 bg-emerald-950/50 border border-emerald-800/60 rounded-lg text-emerald-300 text-sm flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-xs text-emerald-400 hover:underline">Cerrar</button>
        </div>
      )}

      {/* KPI Overview Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>TOTAL CUENTAS</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-1.5">{users.length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Perfiles registrados</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>OPERATIVOS</span>
            <Shield className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-emerald-400 mt-1.5">
            {users.filter(u => u.role === 'OPERATIVO').length}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Elementos de campo</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>EQUIPO RH</span>
            <UserCheck className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-amber-300 mt-1.5">
            {users.filter(u => u.role === 'RH').length}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Recursos Humanos</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>CONSIGNAS ACTIVAS</span>
            <CheckSquare className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-purple-300 mt-1.5">
            {tasks.filter(t => t.status !== 'COMPLETADA').length}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Tareas en curso</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>ESTADO ALERTA</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-lg font-bold text-white mt-2 flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${
              settings.securityLevel === 'NORMAL' ? 'bg-emerald-400' :
              settings.securityLevel === 'PREVENTIVO' ? 'bg-amber-400' : 'bg-red-500 animate-pulse'
            }`}></span>
            {settings.securityLevel || 'NORMAL'}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">{posts.length} Puestos</p>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-1 sm:gap-2 border-b border-slate-800 overflow-x-auto">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition ${
            activeTab === 'users'
              ? 'border-blue-500 text-blue-400 bg-blue-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          Gestión de Usuarios y Roles ({users.length})
        </button>

        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition ${
            activeTab === 'tasks'
              ? 'border-blue-500 text-blue-400 bg-blue-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          Consignas y Tareas Asignadas ({tasks.length})
        </button>

        <button
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition ${
            activeTab === 'audit'
              ? 'border-blue-500 text-blue-400 bg-blue-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          Registro de Actividad ({auditLogs.length})
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition ${
            activeTab === 'settings'
              ? 'border-blue-500 text-blue-400 bg-blue-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" />
          Ajustes Generales
        </button>

        <button
          onClick={() => setActiveTab('posts')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition ${
            activeTab === 'posts'
              ? 'border-blue-500 text-blue-400 bg-blue-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="w-4 h-4" />
          Puestos y Casetas ({posts.length})
        </button>
      </div>

      {/* ================= TAB 1: USERS & ROLES ================= */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, correo, código, rol..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>
              Segregación estricta de accesos activada.
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3.5">Elemento / Usuario</th>
                  <th className="px-4 py-3.5">Código</th>
                  <th className="px-4 py-3.5">Rol de Acceso</th>
                  <th className="px-4 py-3.5">Puesto Asignado</th>
                  <th className="px-4 py-3.5">Estado</th>
                  <th className="px-4 py-3.5 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No se encontraron cuentas que coincidan con la búsqueda. Haz clic en "Crear Cuenta de Usuario".
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => (
                    <tr key={u.uid} className="hover:bg-slate-800/40 transition">
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-white">{u.displayName || 'Sin nombre'}</div>
                        <div className="text-xs text-slate-400">{u.email}</div>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-blue-300">
                        {u.employeeCode || 'PENDIENTE'}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            u.role === 'ADMIN'
                              ? 'bg-red-950/80 text-red-400 border border-red-800/60'
                              : u.role === 'RH'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                              : 'bg-blue-950/80 text-blue-300 border border-blue-800/60'
                          }`}
                        >
                          {u.role === 'ADMIN' ? 'ADMINISTRADOR' : u.role === 'RH' ? 'RECURSOS HUMANOS' : 'OPERATIVO'}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-300">
                        {u.assignedPost || 'Sin asignar'}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                            u.status === 'ACTIVO'
                              ? 'text-emerald-400 bg-emerald-950/60'
                              : 'text-rose-400 bg-rose-950/60'
                          }`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            title="Editar usuario o modificar rol"
                            onClick={() => {
                              setEditingUser(u);
                              setUserFormData({
                                email: u.email,
                                displayName: u.displayName || '',
                                role: u.role,
                                employeeCode: u.employeeCode || '',
                                phone: u.phone || '',
                                assignedPost: u.assignedPost || '',
                                status: u.status || 'ACTIVO',
                              });
                              setShowUserModal(true);
                            }}
                            className="p-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          <button
                            title="Eliminar cuenta de usuario"
                            disabled={u.email === currentUser.email}
                            onClick={() => setUserToDelete(u)}
                            className="p-1.5 text-xs font-medium text-rose-400 hover:text-white bg-rose-950/30 hover:bg-rose-900 border border-rose-800/40 rounded transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= TAB 2: TASKS & CONSIGNA MANAGEMENT ================= */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-base font-bold text-white">Consignas y Órdenes de Servicio</h3>
              <p className="text-xs text-slate-400">
                Tareas directas para los guardias operativos. Los operativos solo pueden ver y gestionar sus tareas asignadas.
              </p>
            </div>
            <button
              onClick={() => setShowTaskModal(true)}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition shadow"
            >
              <Plus className="w-3.5 h-3.5" /> Nueva Consigna
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tasks.map((t) => (
              <div key={t.id} className="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      t.priority === 'URGENTE' ? 'bg-rose-950 text-rose-300 border border-rose-800/60' :
                      t.priority === 'NORMAL' ? 'bg-blue-950 text-blue-300 border border-blue-800/60' :
                      'bg-slate-800 text-slate-300'
                    }`}>
                      {t.priority}
                    </span>
                    <h4 className="font-bold text-white text-sm mt-1.5">{t.title}</h4>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    t.status === 'COMPLETADA' ? 'bg-emerald-950 text-emerald-300' :
                    t.status === 'EN_PROGRESO' ? 'bg-amber-950 text-amber-300' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {t.status}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/60">
                  {t.description || 'Sin descripción adicional.'}
                </p>

                <div className="text-xs text-slate-400 space-y-1 pt-1 border-t border-slate-800/80">
                  <div className="flex items-center justify-between">
                    <span>Asignado a:</span>
                    <strong className="text-slate-200">{t.assignedToName}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Puesto:</span>
                    <span className="text-slate-300">{t.postLocation || 'Puesto Central'}</span>
                  </div>
                  {t.dueDate && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span>Fecha límite:</span>
                      <span className="text-amber-400 font-mono">{t.dueDate}</span>
                    </div>
                  )}
                  {t.completionNotes && (
                    <div className="mt-2 p-2 bg-emerald-950/30 border border-emerald-800/40 rounded text-[11px] text-emerald-300">
                      <strong>Reporte de cumplimiento:</strong> {t.completionNotes}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {tasks.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                No hay consignas asignadas aún. Da clic en "Nueva Consigna" para comisionar una tarea a un guardia operativo.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 3: AUDIT LOGS ================= */}
      {activeTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white">Registro de Actividad Básica de Usuarios</h3>
              <p className="text-xs text-slate-400">
                Pista de auditoría inmutable de accesos, altas, cambios de rol, incidencias y eventos del sistema.
              </p>
            </div>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={auditFilter}
                onChange={(e) => setAuditFilter(e.target.value)}
                placeholder="Filtrar por acción o usuario..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-[11px] uppercase tracking-wider text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3">Fecha y Hora</th>
                  <th className="px-4 py-3">Acción Registrada</th>
                  <th className="px-4 py-3">Realizado Por</th>
                  <th className="px-4 py-3">Detalles de Operación</th>
                  <th className="px-4 py-3">Usuario Afectado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredAudit.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No hay registros de actividad que coincidan con el filtro.
                    </td>
                  </tr>
                ) : (
                  filteredAudit.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString('es-MX', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded font-mono font-bold text-[10px] bg-slate-800 text-blue-300 border border-slate-700">
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-white whitespace-nowrap">
                        {log.performedByName}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {log.details}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400 whitespace-nowrap">
                        {log.targetUserEmail || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= TAB 4: GENERAL SETTINGS ================= */}
      {activeTab === 'settings' && (
        <div className="max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
          <div>
            <h3 className="text-lg font-bold text-white">Ajustes Generales de la Aplicación</h3>
            <p className="text-xs text-slate-400 mt-1">
              Configuraciones maestras de seguridad, líneas directas y políticas operativas aplicadas en tiempo real.
            </p>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Nombre Oficial de la Empresa de Seguridad
              </label>
              <input
                type="text"
                required
                value={settings.companyName}
                onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Línea de Emergencia 24/7 (Hotline)
                </label>
                <input
                  type="text"
                  required
                  value={settings.emergencyHotline}
                  onChange={(e) => setSettings({ ...settings, emergencyHotline: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Nivel de Alerta General
                </label>
                <select
                  value={settings.securityLevel}
                  onChange={(e) => setSettings({ ...settings, securityLevel: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="NORMAL">NORMAL (Verde - Operación Regular)</option>
                  <option value="PREVENTIVO">PREVENTIVO (Amarillo - Supervisión Reforzada)</option>
                  <option value="ALERTA_MAXIMA">ALERTA MÁXIMA (Rojo - Protocolo de Emergencia)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Tolerancia de Pase de Lista (Minutos)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={settings.shiftToleranceMinutes}
                  onChange={(e) => setSettings({ ...settings, shiftToleranceMinutes: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.requirePhotoCheckin}
                    onChange={(e) => setSettings({ ...settings, requirePhotoCheckin: e.target.checked })}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-950 border-slate-800 focus:ring-blue-500"
                  />
                  <span className="text-xs text-slate-300 font-medium">
                    Exigir verificación de geolocalización en pase de lista
                  </span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                Comunicado / Difusión de Alerta a Casetas
              </label>
              <textarea
                rows={3}
                value={settings.alertBroadcast}
                onChange={(e) => setSettings({ ...settings, alertBroadcast: e.target.value })}
                placeholder="Mensaje difundido a todos los guardias en servicio..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="submit"
                disabled={savingSettings}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
              >
                {savingSettings ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sliders className="w-4 h-4" />}
                Guardar Ajustes Generales
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ================= TAB 5: SECURITY POSTS ================= */}
      {activeTab === 'posts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">Puestos y Objetivos de Seguridad</h3>
              <p className="text-xs text-slate-400">Instalaciones, casetas y clientes resguardados.</p>
            </div>
            <button
              onClick={() => {
                setPostFormData({
                  id: '',
                  name: '',
                  client: '',
                  address: '',
                  requiredGuards: 2,
                  contactPhone: '',
                  active: true,
                });
                setShowPostModal(true);
              }}
              className="flex items-center gap-2 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" /> Nuevo Puesto
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {posts.map((p) => (
              <div key={p.id} className="bg-slate-900 border border-slate-800 p-5 rounded-xl space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-white text-base">{p.name}</h3>
                    <p className="text-xs text-blue-400 font-medium">{p.client}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs ${p.active ? 'bg-emerald-950 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                    {p.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                  {p.address || 'Ubicación sin especificar'}
                </p>
                <div className="flex items-center justify-between text-xs text-slate-300 pt-3 border-t border-slate-800/80">
                  <span>Guardias requeridos: <strong>{p.requiredGuards}</strong></span>
                  <span>Tel: {p.contactPhone || 'N/A'}</span>
                </div>
              </div>
            ))}
            {posts.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                No hay puestos de seguridad creados. Da de alta objetivos para asignarlos a los operativos.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: CREATE / EDIT USER & ASSIGN ROLE */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {editingUser ? 'Editar Cuenta y Modificar Rol' : 'Crear Cuenta de Usuario Autorizada'}
                </h3>
                <p className="text-xs text-slate-400">
                  Solo los correos registrados podrán ingresar con sus permisos respectivos.
                </p>
              </div>
              <button 
                onClick={() => setShowUserModal(false)}
                className="text-slate-400 hover:text-white text-sm p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Correo Electrónico (Acceso Google / Auth) *
                </label>
                <input
                  type="email"
                  required
                  disabled={!!editingUser}
                  value={userFormData.email}
                  onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                  placeholder="ejemplo@seguridadempresa.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-60"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={userFormData.displayName}
                    onChange={(e) => setUserFormData({ ...userFormData, displayName: e.target.value })}
                    placeholder="Oficial Juan Pérez"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Código de Empleado
                  </label>
                  <input
                    type="text"
                    value={userFormData.employeeCode}
                    onChange={(e) => setUserFormData({ ...userFormData, employeeCode: e.target.value })}
                    placeholder="SEG-4029"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Rol Asignado *
                  </label>
                  <select
                    value={userFormData.role}
                    onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value as UserRole })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 font-semibold"
                  >
                    <option value="OPERATIVO">OPERATIVO (Solo tareas y turnos propios)</option>
                    <option value="RH">RECURSOS HUMANOS (Expedientes y exámenes)</option>
                    <option value="ADMIN">ADMINISTRADOR (Acceso Total y usuarios)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Estado de Cuenta
                  </label>
                  <select
                    value={userFormData.status}
                    onChange={(e) => setUserFormData({ ...userFormData, status: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="ACTIVO">ACTIVO (Permitir Ingreso)</option>
                    <option value="SUSPENDIDO">SUSPENDIDO (Bloqueo Temporal)</option>
                    <option value="INACTIVO">INACTIVO (Baja Definitiva)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Puesto Asignado
                  </label>
                  <input
                    type="text"
                    value={userFormData.assignedPost}
                    onChange={(e) => setUserFormData({ ...userFormData, assignedPost: e.target.value })}
                    placeholder="Planta Norte / Caseta 1"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={userFormData.phone}
                    onChange={(e) => setUserFormData({ ...userFormData, phone: e.target.value })}
                    placeholder="55-1234-5678"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition"
                >
                  {editingUser ? 'Guardar Cambios' : 'Crear y Autorizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRM DELETE USER */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-red-900/60 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-lg font-bold text-white">¿Eliminar Cuenta de Usuario?</h3>
            </div>
            <p className="text-sm text-slate-300">
              Estás a punto de eliminar definitivamente el perfil y revocar todos los permisos de acceso a:
            </p>
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 space-y-1">
              <p className="text-white font-bold">{userToDelete.displayName}</p>
              <p className="text-xs text-slate-400 font-mono">{userToDelete.email}</p>
              <p className="text-xs text-blue-400">Rol: {userToDelete.role}</p>
            </div>
            <p className="text-xs text-slate-400">
              Esta acción quedará registrada en el Registro de Actividad (Auditoría) y el usuario ya no podrá iniciar sesión.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setUserToDelete(null)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteUser}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-semibold transition"
              >
                Confirmar Eliminación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ASSIGN OPERATIVE TASK (CONSIGNA) */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Asignar Consigna / Tarea Operativa</h3>
              <button onClick={() => setShowTaskModal(false)} className="text-slate-400 hover:text-white text-sm p-1">✕</button>
            </div>

            <form onSubmit={handleSaveTask} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Elemento Operativo Asignado *
                </label>
                <select
                  required
                  value={taskFormData.assignedTo}
                  onChange={(e) => setTaskFormData({ ...taskFormData, assignedTo: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- Seleccionar Guardia Operativo --</option>
                  {users.filter(u => u.role === 'OPERATIVO' || u.role === 'ADMIN').map((u) => (
                    <option key={u.uid} value={u.uid}>
                      {u.displayName} ({u.employeeCode || u.email}) - {u.assignedPost || 'Sin puesto'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Título de la Consigna *
                </label>
                <input
                  type="text"
                  required
                  value={taskFormData.title}
                  onChange={(e) => setTaskFormData({ ...taskFormData, title: e.target.value })}
                  placeholder="Ej: Rondín Perimetral Nocturno Sector B"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Instrucciones Detalladas
                </label>
                <textarea
                  rows={3}
                  value={taskFormData.description}
                  onChange={(e) => setTaskFormData({ ...taskFormData, description: e.target.value })}
                  placeholder="Verificar sellos de candados en portón 4 y registrar lectura de medidores..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Prioridad
                  </label>
                  <select
                    value={taskFormData.priority}
                    onChange={(e) => setTaskFormData({ ...taskFormData, priority: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="RUTINA">RUTINA</option>
                    <option value="NORMAL">NORMAL</option>
                    <option value="URGENTE">URGENTE</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Fecha de Cumplimiento
                  </label>
                  <input
                    type="date"
                    value={taskFormData.dueDate}
                    onChange={(e) => setTaskFormData({ ...taskFormData, dueDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowTaskModal(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition"
                >
                  Asignar Consigna
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: CREATE POST */}
      {showPostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Nuevo Puesto de Seguridad</h3>
              <button onClick={() => setShowPostModal(false)} className="text-slate-400 hover:text-white text-sm p-1">✕</button>
            </div>

            <form onSubmit={handleSavePost} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Nombre del Puesto / Caseta *
                </label>
                <input
                  type="text"
                  required
                  value={postFormData.name}
                  onChange={(e) => setPostFormData({ ...postFormData, name: e.target.value })}
                  placeholder="Caseta Principal - Acceso 1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Cliente o Empresa Asignada *
                </label>
                <input
                  type="text"
                  required
                  value={postFormData.client}
                  onChange={(e) => setPostFormData({ ...postFormData, client: e.target.value })}
                  placeholder="Parque Industrial Logix"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Dirección
                </label>
                <input
                  type="text"
                  value={postFormData.address}
                  onChange={(e) => setPostFormData({ ...postFormData, address: e.target.value })}
                  placeholder="Av. Central #500"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Guardias Requeridos
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={postFormData.requiredGuards}
                    onChange={(e) => setPostFormData({ ...postFormData, requiredGuards: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Teléfono Caseta
                  </label>
                  <input
                    type="text"
                    value={postFormData.contactPhone}
                    onChange={(e) => setPostFormData({ ...postFormData, contactPhone: e.target.value })}
                    placeholder="Ext. 104"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowPostModal(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition"
                >
                  Registrar Puesto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
