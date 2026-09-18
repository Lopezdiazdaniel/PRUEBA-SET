import React, { useState, useEffect } from 'react';
import { 
  Radio, AlertOctagon, CheckSquare, Clock, MapPin, 
  Send, AlertTriangle, Shield, CheckCircle, ShieldCheck,
  CheckCircle2, PlayCircle, Phone, Megaphone
} from 'lucide-react';
import { 
  collection, query, where, onSnapshot, addDoc, 
  updateDoc, doc, getDoc, getDocs, orderBy 
} from 'firebase/firestore';
import { db } from '../firebase';
import { 
  IncidentReport, AttendanceRecord, UserProfile, 
  IncidentSeverity, ShiftType, SecurityPost, OperativeTask, AppSettings 
} from '../types';
import { logActivity } from '../utils/audit';

interface OperativoPanelProps {
  currentUser: UserProfile;
}

export const OperativoPanel: React.FC<OperativoPanelProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'tasks' | 'turn' | 'incidents'>('tasks');
  const [myTasks, setMyTasks] = useState<OperativeTask[]>([]);
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [posts, setPosts] = useState<SecurityPost[]>([]);
  const [currentAttendance, setCurrentAttendance] = useState<AttendanceRecord | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Complete task modal
  const [completingTask, setCompletingTask] = useState<OperativeTask | null>(null);
  const [completionNotes, setCompletionNotes] = useState('');

  // New incident form
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [incidentForm, setIncidentForm] = useState({
    title: '',
    category: 'Rondín / Novedad General',
    severity: 'BAJA' as IncidentSeverity,
    postLocation: currentUser.assignedPost || 'Puesto Central',
    description: '',
  });

  // Check-in form
  const [checkInPost, setCheckInPost] = useState(currentUser.assignedPost || '');
  const [shiftType, setShiftType] = useState<ShiftType>('MATUTINO_12H');
  const [checkInNotes, setCheckInNotes] = useState('');
  const [submittingCheckIn, setSubmittingCheckIn] = useState(false);

  useEffect(() => {
    // 1. Fetch operative's ASSIGNED TASKS strictly
    // User requested: "Los usuarios Operativos solo podrán ver y gestionar sus tareas asignadas."
    const qTasks = query(
      collection(db, 'tasks'),
      where('assignedTo', '==', currentUser.uid)
    );

    const unsubTasks = onSnapshot(qTasks, (snapshot) => {
      const list: OperativeTask[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as OperativeTask));
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setMyTasks(list);
    }, (err) => {
      console.error('Error fetching assigned tasks:', err);
    });

    // 2. Fetch security posts for select dropdowns
    const unsubPosts = onSnapshot(collection(db, 'posts'), (snapshot) => {
      const pList: SecurityPost[] = [];
      snapshot.forEach((d) => pList.push({ id: d.id, ...d.data() } as SecurityPost));
      setPosts(pList);
      if (!checkInPost && pList.length > 0) {
        setCheckInPost(pList[0].name);
      }
    });

    // 3. Fetch incidents
    const unsubIncidents = onSnapshot(collection(db, 'incidents'), (snapshot) => {
      const list: IncidentReport[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as IncidentReport));
      list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setIncidents(list);
    });

    // 4. Fetch attendance for this user
    const unsubAttendance = onSnapshot(collection(db, 'attendances'), (snapshot) => {
      const list: AttendanceRecord[] = [];
      let activeForMe: AttendanceRecord | null = null;

      snapshot.forEach((d) => {
        const item = { id: d.id, ...d.data() } as AttendanceRecord;
        if (item.guardUid === currentUser.uid) {
          list.push(item);
          if (item.status === 'EN_TURNO') {
            activeForMe = item;
          }
        }
      });

      list.sort((a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime());
      setAttendances(list);
      setCurrentAttendance(activeForMe);
    });

    // 5. Load general settings (broadcast & emergency hotline)
    const unsubSettings = onSnapshot(doc(db, 'settings', 'general'), (snap) => {
      if (snap.exists()) {
        setSettings(snap.data() as AppSettings);
      }
    });

    return () => {
      unsubTasks();
      unsubPosts();
      unsubIncidents();
      unsubAttendance();
      unsubSettings();
    };
  }, [currentUser.uid, currentUser.assignedPost]);

  // Handle task status progression
  const handleStartTask = async (task: OperativeTask) => {
    try {
      const ref = doc(db, 'tasks', task.id);
      await updateDoc(ref, {
        status: 'EN_PROGRESO',
      });

      await logActivity(
        'CONSIGNA_EN_PROGRESO',
        `El elemento operativo ${currentUser.displayName} inició la consigna: "${task.title}".`,
        currentUser.uid,
        currentUser.displayName
      );
    } catch (err) {
      console.error('Error starting task:', err);
    }
  };

  const handleFinishTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completingTask) return;

    try {
      const ref = doc(db, 'tasks', completingTask.id);
      await updateDoc(ref, {
        status: 'COMPLETADA',
        completedAt: new Date().toISOString(),
        completionNotes: completionNotes || 'Consigna completada a cabalidad por el elemento.',
      });

      await logActivity(
        'CONSIGNA_COMPLETADA',
        `Consigna completada por ${currentUser.displayName}: "${completingTask.title}". Observaciones: ${completionNotes || 'Sin novedades'}.`,
        currentUser.uid,
        currentUser.displayName
      );

      setCompletingTask(null);
      setCompletionNotes('');
    } catch (err) {
      console.error('Error completing task:', err);
    }
  };

  const handleStartShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingCheckIn(true);
    try {
      const postName = checkInPost || currentUser.assignedPost || 'Puesto Central';
      const newAttendance: Omit<AttendanceRecord, 'id'> = {
        guardUid: currentUser.uid,
        guardName: currentUser.displayName,
        guardCode: currentUser.employeeCode,
        postLocation: postName,
        checkInTime: new Date().toISOString(),
        shift: shiftType,
        status: 'EN_TURNO',
        notes: checkInNotes,
      };

      await addDoc(collection(db, 'attendances'), newAttendance);

      await logActivity(
        'INICIO_TURNO',
        `Entrada de guardia registrada por ${currentUser.displayName} (${currentUser.employeeCode || 'N/A'}) en puesto [${postName}]. Turno: ${shiftType}.`,
        currentUser.uid,
        currentUser.displayName
      );

      setCheckInNotes('');
    } catch (err) {
      console.error('Error starting shift:', err);
    } finally {
      setSubmittingCheckIn(false);
    }
  };

  const handleEndShift = async () => {
    if (!currentAttendance) return;
    try {
      const ref = doc(db, 'attendances', currentAttendance.id);
      await updateDoc(ref, {
        checkOutTime: new Date().toISOString(),
        status: 'FINALIZADO',
      });

      await logActivity(
        'FIN_TURNO',
        `Cierre de turno (Check-Out) de ${currentUser.displayName} en puesto [${currentAttendance.postLocation}].`,
        currentUser.uid,
        currentUser.displayName
      );
    } catch (err) {
      console.error('Error ending shift:', err);
    }
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Omit<IncidentReport, 'id'> = {
        reportedBy: currentUser.uid,
        reportedByName: currentUser.displayName,
        guardCode: currentUser.employeeCode,
        postLocation: incidentForm.postLocation,
        severity: incidentForm.severity,
        category: incidentForm.category,
        title: incidentForm.title,
        description: incidentForm.description,
        status: 'ABIERTO',
        timestamp: new Date().toISOString(),
      };

      await addDoc(collection(db, 'incidents'), payload);

      await logActivity(
        'INCIDENTE_REPORTADO',
        `Novedad [Severidad: ${incidentForm.severity}] reportada por ${currentUser.displayName}: "${incidentForm.title}" en [${incidentForm.postLocation}].`,
        currentUser.uid,
        currentUser.displayName
      );

      setShowIncidentModal(false);
      setIncidentForm({
        title: '',
        category: 'Rondín / Novedad General',
        severity: 'BAJA',
        postLocation: currentUser.assignedPost || 'Puesto Central',
        description: '',
      });
    } catch (err) {
      console.error('Error reporting incident:', err);
    }
  };

  return (
    <div className="space-y-6" id="operativo-panel-container">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950/80 text-blue-400 border border-blue-800/50">
              <Radio className="w-3 h-3 text-blue-400 animate-pulse" /> Módulo Operativo de Campo
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
            Gestión Operativa y Consignas Asignadas
          </h1>
          <p className="text-sm text-slate-400">
            Control personal de tareas comisionadas, pase de lista de guardia y bitácora de novedades.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            id="btn-new-incident"
            onClick={() => setShowIncidentModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-semibold shadow-md transition"
          >
            <AlertOctagon className="w-4 h-4" /> Reportar Novedad / Incidente
          </button>
        </div>
      </div>

      {/* Broadcast Alert Banner if set by Admin */}
      {settings?.alertBroadcast && (
        <div className="p-4 bg-blue-950/40 border border-blue-800/50 rounded-xl flex items-start gap-3 text-xs text-blue-200">
          <Megaphone className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <strong className="text-blue-300 uppercase tracking-wider text-[11px] block">
              Comunicado General de Comandancia:
            </strong>
            <p className="leading-relaxed">{settings.alertBroadcast}</p>
          </div>
        </div>
      )}

      {/* Guard Status Banner */}
      <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
        currentAttendance 
          ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-200' 
          : 'bg-slate-800/50 border-slate-700/60 text-slate-300'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${currentAttendance ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider font-bold opacity-80">
              {currentAttendance ? 'TURNO ACTIVO EN CURSO' : 'ELEMENTO FUERA DE TURNO'}
            </div>
            <div className="text-base font-bold text-white">
              {currentAttendance 
                ? `En servicio en: ${currentAttendance.postLocation} (${currentAttendance.shift})` 
                : 'No has marcado entrada para este turno.'}
            </div>
            {currentAttendance && (
              <div className="text-xs opacity-75 mt-0.5">
                Hora de inicio: {new Date(currentAttendance.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {settings?.emergencyHotline && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-300">
              <Phone className="w-3.5 h-3.5 text-rose-400" />
              <span>Central: <strong>{settings.emergencyHotline}</strong></span>
            </div>
          )}

          {currentAttendance ? (
            <button
              onClick={handleEndShift}
              className="w-full sm:w-auto px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-semibold transition shadow-md"
            >
              Cerrar Turno (Check-Out)
            </button>
          ) : (
            <button
              onClick={() => setActiveTab('turn')}
              className="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-semibold transition shadow-md"
            >
              Iniciar Turno
            </button>
          )}
        </div>
      </div>

      {/* Navigation tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === 'tasks'
              ? 'border-blue-500 text-blue-400 bg-blue-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          Mis Tareas Asignadas ({myTasks.filter(t => t.status !== 'COMPLETADA').length} pendientes)
        </button>
        <button
          onClick={() => setActiveTab('turn')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === 'turn'
              ? 'border-blue-500 text-blue-400 bg-blue-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          Control de Asistencia y Turnos
        </button>
        <button
          onClick={() => setActiveTab('incidents')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === 'incidents'
              ? 'border-blue-500 text-blue-400 bg-blue-950/20'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <AlertOctagon className="w-4 h-4" />
          Bitácora de Novedades ({incidents.length})
        </button>
      </div>

      {/* TAB 1: ASSIGNED TASKS (CONSIGNAS) */}
      {activeTab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">Consignas y Rondas Asignadas a Mí</h3>
              <p className="text-xs text-slate-400">
                Solo tienes visibilidad y gestión de las órdenes operativas comisionadas a tu perfil.
              </p>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Elemento: {currentUser.employeeCode || currentUser.displayName}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myTasks.map((t) => (
              <div 
                key={t.id} 
                className={`bg-slate-900 border rounded-xl p-4 space-y-3 transition ${
                  t.status === 'COMPLETADA' ? 'border-emerald-800/40 opacity-75' :
                  t.status === 'EN_PROGRESO' ? 'border-amber-700/60 shadow-lg shadow-amber-950/20' :
                  'border-slate-800'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    t.priority === 'URGENTE' ? 'bg-rose-950 text-rose-300 border border-rose-800/60' :
                    t.priority === 'NORMAL' ? 'bg-blue-950 text-blue-300 border border-blue-800/60' :
                    'bg-slate-800 text-slate-300'
                  }`}>
                    {t.priority}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    t.status === 'COMPLETADA' ? 'bg-emerald-950 text-emerald-300' :
                    t.status === 'EN_PROGRESO' ? 'bg-amber-950 text-amber-300' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {t.status}
                  </span>
                </div>

                <div>
                  <h4 className="font-bold text-white text-base">{t.title}</h4>
                  <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3 text-slate-500" /> {t.postLocation || 'Puesto Central'}
                  </p>
                </div>

                <p className="text-xs text-slate-300 bg-slate-950/70 p-2.5 rounded-lg border border-slate-800 leading-relaxed">
                  {t.description || 'Sin instrucciones adicionales.'}
                </p>

                {t.dueDate && (
                  <div className="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Fecha límite:</span>
                    <strong className="text-amber-400 font-mono">{t.dueDate}</strong>
                  </div>
                )}

                {t.completionNotes && (
                  <div className="p-2 bg-emerald-950/30 border border-emerald-800/40 rounded text-xs text-emerald-300">
                    <strong>Informe de ejecución:</strong> {t.completionNotes}
                  </div>
                )}

                {/* Status action buttons */}
                {t.status !== 'COMPLETADA' && (
                  <div className="pt-2 border-t border-slate-800 flex gap-2">
                    {t.status === 'PENDIENTE' && (
                      <button
                        onClick={() => handleStartTask(t)}
                        className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                      >
                        <PlayCircle className="w-3.5 h-3.5" /> Iniciar Tarea
                      </button>
                    )}

                    <button
                      onClick={() => setCompletingTask(t)}
                      className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Marcar Completada
                    </button>
                  </div>
                )}
              </div>
            ))}

            {myTasks.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl space-y-2">
                <CheckCircle2 className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="font-semibold text-sm text-slate-400">No tienes tareas ni consignas pendientes asignadas.</p>
                <p className="text-xs text-slate-500">
                  La administración te comisionará consignas específicas para tu puesto de vigilancia cuando sea necesario.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: TURN CONTROL & ATTENDANCE */}
      {activeTab === 'turn' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Start Shift Card */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <h3 className="font-bold text-white text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-400" />
              Pase de Lista / Marcar Turno
            </h3>

            {currentAttendance ? (
              <div className="p-4 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-center space-y-3">
                <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
                <p className="text-sm font-medium text-emerald-300">
                  Actualmente te encuentras cubriendo servicio.
                </p>
                <div className="text-xs text-slate-400">
                  Ubicación: <strong>{currentAttendance.postLocation}</strong>
                </div>
                <button
                  onClick={handleEndShift}
                  className="w-full py-2 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-sm font-semibold transition"
                >
                  Registrar Salida de Turno (Check-Out)
                </button>
              </div>
            ) : (
              <form onSubmit={handleStartShift} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Puesto / Caseta a Cubrir
                  </label>
                  <select
                    value={checkInPost}
                    onChange={(e) => setCheckInPost(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    {posts.length > 0 ? (
                      posts.map((p) => (
                        <option key={p.id} value={p.name}>
                          {p.name} - {p.client}
                        </option>
                      ))
                    ) : (
                      <option value="Caseta General">Caseta General</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Tipo de Turno
                  </label>
                  <select
                    value={shiftType}
                    onChange={(e) => setShiftType(e.target.value as ShiftType)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="MATUTINO_12H">Matutino (12 Horas: 07:00 - 19:00)</option>
                    <option value="NOCTURNO_12H">Nocturno (12 Horas: 19:00 - 07:00)</option>
                    <option value="24X24">Jornada 24 x 24</option>
                    <option value="JORNADA_8H">Turno Ordinario 8 Horas</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Observaciones de Entrega de Guardia
                  </label>
                  <textarea
                    rows={2}
                    value={checkInNotes}
                    onChange={(e) => setCheckInNotes(e.target.value)}
                    placeholder="Recibo caseta sin novedades, equipo de radio completo..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submittingCheckIn}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold shadow-md transition flex items-center justify-center gap-2"
                >
                  <CheckSquare className="w-4 h-4" /> Marcar Entrada al Turno
                </button>
              </form>
            )}
          </div>

          {/* Attendance History */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-5 rounded-2xl space-y-4">
            <h3 className="font-bold text-white text-base flex items-center justify-between">
              <span>Mi Historial de Coberturas</span>
              <span className="text-xs font-normal text-slate-400">Pases de lista registrados</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="bg-slate-950 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="px-3 py-2.5">Puesto</th>
                    <th className="px-3 py-2.5">Entrada</th>
                    <th className="px-3 py-2.5">Salida</th>
                    <th className="px-3 py-2.5">Turno</th>
                    <th className="px-3 py-2.5">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {attendances.slice(0, 8).map((a) => (
                    <tr key={a.id} className="hover:bg-slate-800/30">
                      <td className="px-3 py-2.5 text-xs font-medium text-white">{a.postLocation}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-slate-400">
                        {new Date(a.checkInTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-slate-400">
                        {a.checkOutTime 
                          ? new Date(a.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-300">{a.shift}</td>
                      <td className="px-3 py-2.5">
                        <span className={`px-2 py-0.5 rounded text-xs ${
                          a.status === 'EN_TURNO'
                            ? 'bg-emerald-950 text-emerald-400 font-semibold'
                            : 'bg-slate-800 text-slate-400'
                        }`}>
                          {a.status === 'EN_TURNO' ? 'En Turno' : 'Completado'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {attendances.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                        Aún no tienes registros de asistencia en el sistema.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: INCIDENTS BITACORA */}
      {activeTab === 'incidents' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {incidents.map((inc) => (
              <div key={inc.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <span className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                    inc.severity === 'CRITICA'
                      ? 'bg-red-950 text-red-400 border border-red-800'
                      : inc.severity === 'ALTA'
                      ? 'bg-orange-950 text-orange-400 border border-orange-800'
                      : inc.severity === 'MEDIA'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800'
                      : 'bg-blue-950 text-blue-300 border border-blue-800'
                  }`}>
                    {inc.severity}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {new Date(inc.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>

                <div>
                  <h4 className="font-bold text-white text-sm">{inc.title}</h4>
                  <p className="text-xs text-blue-400 mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {inc.postLocation}
                  </p>
                </div>

                <p className="text-xs text-slate-300 bg-slate-950 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed">
                  {inc.description}
                </p>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                  <span>Reportó: <strong className="text-slate-300">{inc.reportedByName}</strong></span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    inc.status === 'ABIERTO' ? 'bg-rose-950 text-rose-300' : 'bg-emerald-950 text-emerald-300'
                  }`}>
                    {inc.status}
                  </span>
                </div>
              </div>
            ))}
            {incidents.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                Sin novedades reportadas en la bitácora. Presiona "Reportar Novedad / Incidente" para generar una entrada.
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: COMPLETE TASK */}
      {completingTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Finalizar Consigna Operativa</h3>
              <button onClick={() => setCompletingTask(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleFinishTask} className="p-5 space-y-4">
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <div className="font-bold text-white text-sm">{completingTask.title}</div>
                <div className="text-xs text-slate-400 mt-1">{completingTask.description}</div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Reporte de Cumplimiento / Novedades Observadas
                </label>
                <textarea
                  rows={3}
                  required
                  value={completionNotes}
                  onChange={(e) => setCompletionNotes(e.target.value)}
                  placeholder="Se revisaron cerraduras y candados, todo en orden sin novedades..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCompletingTask(null)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-semibold transition flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" /> Confirmar Tarea Completada
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: NEW INCIDENT */}
      {showIncidentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertOctagon className="w-5 h-5 text-red-500" />
                Registrar Novedad en Bitácora Operativa
              </h3>
              <button onClick={() => setShowIncidentModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleCreateIncident} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Título del Suceso / Novedad *
                </label>
                <input
                  type="text"
                  required
                  value={incidentForm.title}
                  onChange={(e) => setIncidentForm({ ...incidentForm, title: e.target.value })}
                  placeholder="Intrusión perimetral, portón averiado, rondín sin novedad..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Severidad / Prioridad
                  </label>
                  <select
                    value={incidentForm.severity}
                    onChange={(e) => setIncidentForm({ ...incidentForm, severity: e.target.value as IncidentSeverity })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="BAJA">BAJA (Novedad de rutina / Rondín)</option>
                    <option value="MEDIA">MEDIA (Incumplimiento menor)</option>
                    <option value="ALTA">ALTA (Falla de equipo / Acceso no autorizado)</option>
                    <option value="CRITICA">CRÍTICA (Emergencia / Robo / Intrusión)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                    Ubicación / Puesto
                  </label>
                  <input
                    type="text"
                    required
                    value={incidentForm.postLocation}
                    onChange={(e) => setIncidentForm({ ...incidentForm, postLocation: e.target.value })}
                    placeholder="Torre 3 / Caseta Principal"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Detalle y Descripción de los Hechos *
                </label>
                <textarea
                  rows={4}
                  required
                  value={incidentForm.description}
                  onChange={(e) => setIncidentForm({ ...incidentForm, description: e.target.value })}
                  placeholder="Describa hora exacta, personas involucradas, medidas tomadas y situación actual..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowIncidentModal(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-semibold transition flex items-center gap-2"
                >
                  <Send className="w-4 h-4" /> Enviar Reporte a Central
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
