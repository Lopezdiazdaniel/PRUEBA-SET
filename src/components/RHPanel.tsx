import React, { useState, useEffect } from 'react';
import { 
  FileText, UserCheck, AlertTriangle, ShieldCheck, 
  Plus, Search, CheckCircle2, XCircle, Clock, Award, Phone, Calendar
} from 'lucide-react';
import { 
  collection, doc, setDoc, onSnapshot, query, getDocs 
} from 'firebase/firestore';
import { db } from '../firebase';
import { RHRecord, UserProfile } from '../types';
import { logActivity } from '../utils/audit';

interface RHPanelProps {
  currentUser: UserProfile;
}

export const RHPanel: React.FC<RHPanelProps> = ({ currentUser }) => {
  const [records, setRecords] = useState<RHRecord[]>([]);
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'APROBADO' | 'PENDIENTE' | 'RECHAZADO'>('ALL');

  // Modal for new/edit RH record
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<RHRecord | null>(null);
  const [formData, setFormData] = useState({
    employeeUid: '',
    employeeName: '',
    curp: '',
    nss: '',
    contractType: 'Tiempo Indeterminado (Planta)',
    antidopingStatus: 'APROBADO' as 'APROBADO' | 'PENDIENTE' | 'RECHAZADO',
    antidopingDate: new Date().toISOString().split('T')[0],
    psicometricoStatus: 'APTO' as 'APTO' | 'NO_APTO' | 'EN_EVALUACION',
    licenciaArmas: 'CUIP-Vigente',
    emergencyContact: '',
    salaryBase: '$12,500 MXN / Mes',
    observations: 'Documentación en regla, carta de no antecedentes penales validada.',
  });

  useEffect(() => {
    // Listen to RH records
    const unsubRH = onSnapshot(collection(db, 'rh_records'), (snapshot) => {
      const list: RHRecord[] = [];
      snapshot.forEach((d) => list.push(d.data() as RHRecord));
      setRecords(list);
      setLoading(false);
    });

    // Listen to all users to pair them with RH files
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const uList: UserProfile[] = [];
      snapshot.forEach((d) => uList.push(d.data() as UserProfile));
      setEmployees(uList);
    });

    return () => {
      unsubRH();
      unsubUsers();
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employeeUid) return;

    const matchedUser = employees.find(e => e.uid === formData.employeeUid);
    const empName = matchedUser ? matchedUser.displayName : formData.employeeName;

    const recordId = editingRecord ? editingRecord.id : 'rh_' + formData.employeeUid;
    const ref = doc(db, 'rh_records', recordId);

    const recordPayload: RHRecord = {
      id: recordId,
      employeeUid: formData.employeeUid,
      employeeName: empName,
      curp: formData.curp,
      nss: formData.nss,
      contractType: formData.contractType,
      antidopingStatus: formData.antidopingStatus,
      antidopingDate: formData.antidopingDate,
      psicometricoStatus: formData.psicometricoStatus,
      licenciaArmas: formData.licenciaArmas,
      emergencyContact: formData.emergencyContact,
      salaryBase: formData.salaryBase,
      observations: formData.observations,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.displayName || currentUser.email,
    };

    await setDoc(ref, recordPayload);

    await logActivity(
      'EXPEDIENTE_RH_ACTUALIZADO',
      `Expediente actualizado para el elemento: ${empName}. Antidoping: [${formData.antidopingStatus}], Psicométrico: [${formData.psicometricoStatus}].`,
      currentUser.uid,
      currentUser.displayName || currentUser.email,
      matchedUser?.email
    );

    setShowModal(false);
    setEditingRecord(null);
  };

  const filteredRecords = records.filter((r) => {
    const matchesSearch = 
      r.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.curp?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.nss?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (statusFilter === 'ALL') return matchesSearch;
    return matchesSearch && r.antidopingStatus === statusFilter;
  });

  return (
    <div className="space-y-6" id="rh-panel-container">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/50">
              <ShieldCheck className="w-3 h-3" /> Área Confidencial: Recursos Humanos
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight mt-1">
            Gestión de Personal y Expedientes de Seguridad
          </h1>
          <p className="text-sm text-slate-400">
            Control de exámenes toxicológicos (antidoping), pruebas psicométricas, licencias de armas y contratos.
          </p>
        </div>

        <button
          id="btn-new-rh-record"
          onClick={() => {
            setEditingRecord(null);
            setFormData({
              employeeUid: employees[0]?.uid || '',
              employeeName: employees[0]?.displayName || '',
              curp: '',
              nss: '',
              contractType: 'Tiempo Indeterminado (Planta)',
              antidopingStatus: 'APROBADO',
              antidopingDate: new Date().toISOString().split('T')[0],
              psicometricoStatus: 'APTO',
              licenciaArmas: 'CUIP-Vigente',
              emergencyContact: '',
              salaryBase: '$12,500 MXN / Mes',
              observations: '',
            });
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium shadow-md transition"
        >
          <Plus className="w-4 h-4" /> Registrar Expediente RH
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="text-xs font-medium text-slate-400 flex items-center justify-between">
            <span>EXPEDIENTES ACTIVOS</span>
            <FileText className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">{records.length}</p>
          <p className="text-xs text-slate-400 mt-1">De {employees.length} elementos en plantilla</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="text-xs font-medium text-slate-400 flex items-center justify-between">
            <span>ANTIDOPING APROBADOS</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">
            {records.filter(r => r.antidopingStatus === 'APROBADO').length}
          </p>
          <p className="text-xs text-emerald-400 mt-1">Cumplen norma de seguridad</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <div className="text-xs font-medium text-slate-400 flex items-center justify-between">
            <span>PRUEBAS PENDIENTES</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-white mt-2">
            {records.filter(r => r.antidopingStatus === 'PENDIENTE' || r.psicometricoStatus === 'EN_EVALUACION').length}
          </p>
          <p className="text-xs text-amber-400 mt-1">Requieren atención de RH</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por empleado, CURP o NSS..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-slate-950 p-1 border border-slate-800 rounded-lg text-xs">
          {(['ALL', 'APROBADO', 'PENDIENTE', 'RECHAZADO'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1 rounded font-medium transition ${
                statusFilter === st
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {st === 'ALL' ? 'Todos' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Records table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/50">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950/80 text-xs uppercase tracking-wider text-slate-400 border-b border-slate-800">
            <tr>
              <th className="px-4 py-3.5">Elemento</th>
              <th className="px-4 py-3.5">Identificación (CURP / NSS)</th>
              <th className="px-4 py-3.5">Antidoping</th>
              <th className="px-4 py-3.5">Psicométrico</th>
              <th className="px-4 py-3.5">CUIP / Licencia</th>
              <th className="px-4 py-3.5">Contacto Urgencias</th>
              <th className="px-4 py-3.5 text-right">Detalle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No hay expedientes que coincidan con la búsqueda.
                </td>
              </tr>
            ) : (
              filteredRecords.map((rec) => (
                <tr key={rec.id} className="hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3.5">
                    <div className="font-semibold text-white">{rec.employeeName}</div>
                    <div className="text-xs text-slate-400 font-mono">Tipo: {rec.contractType}</div>
                  </td>
                  <td className="px-4 py-3.5 text-xs font-mono">
                    <div className="text-slate-200">CURP: {rec.curp || 'N/D'}</div>
                    <div className="text-slate-400">NSS: {rec.nss || 'N/D'}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      rec.antidopingStatus === 'APROBADO'
                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/50'
                        : rec.antidopingStatus === 'PENDIENTE'
                        ? 'bg-amber-950/80 text-amber-300 border border-amber-800/50'
                        : 'bg-red-950/80 text-red-400 border border-red-800/50'
                    }`}>
                      {rec.antidopingStatus}
                    </span>
                    {rec.antidopingDate && (
                      <div className="text-[10px] text-slate-500 mt-0.5">{rec.antidopingDate}</div>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                      rec.psicometricoStatus === 'APTO'
                        ? 'text-emerald-400 bg-emerald-950/50'
                        : rec.psicometricoStatus === 'EN_EVALUACION'
                        ? 'text-amber-300 bg-amber-950/50'
                        : 'text-rose-400 bg-rose-950/50'
                    }`}>
                      {rec.psicometricoStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-300">
                    {rec.licenciaArmas || 'No aplica'}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-400">
                    {rec.emergencyContact || 'No registrado'}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      onClick={() => {
                        setEditingRecord(rec);
                        setFormData({
                          employeeUid: rec.employeeUid,
                          employeeName: rec.employeeName,
                          curp: rec.curp || '',
                          nss: rec.nss || '',
                          contractType: rec.contractType || 'Tiempo Indeterminado (Planta)',
                          antidopingStatus: rec.antidopingStatus || 'APROBADO',
                          antidopingDate: rec.antidopingDate || new Date().toISOString().split('T')[0],
                          psicometricoStatus: rec.psicometricoStatus || 'APTO',
                          licenciaArmas: rec.licenciaArmas || '',
                          emergencyContact: rec.emergencyContact || '',
                          salaryBase: rec.salaryBase || '',
                          observations: rec.observations || '',
                        });
                        setShowModal(true);
                      }}
                      className="px-2.5 py-1 text-xs font-medium text-amber-300 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/50 rounded transition"
                    >
                      Editar Expediente
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal create/edit record */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {editingRecord ? 'Actualizar Expediente RH' : 'Registrar Nuevo Expediente Laboral'}
                </h3>
                <p className="text-xs text-slate-400">Datos protegidos con acceso restringido para RH y Administración.</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">
                  Elemento / Guardia *
                </label>
                <select
                  disabled={!!editingRecord}
                  value={formData.employeeUid}
                  onChange={(e) => {
                    const selected = employees.find(emp => emp.uid === e.target.value);
                    setFormData({
                      ...formData,
                      employeeUid: e.target.value,
                      employeeName: selected ? selected.displayName : '',
                    });
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">Seleccione a un elemento registrado...</option>
                  {employees.map((emp) => (
                    <option key={emp.uid} value={emp.uid}>
                      {emp.displayName} ({emp.employeeCode || emp.email}) - {emp.role}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">CURP</label>
                  <input
                    type="text"
                    value={formData.curp}
                    onChange={(e) => setFormData({ ...formData, curp: e.target.value.toUpperCase() })}
                    placeholder="ABCD900101HDFRRN01"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">NSS (Seguro Social)</label>
                  <input
                    type="text"
                    value={formData.nss}
                    onChange={(e) => setFormData({ ...formData, nss: e.target.value })}
                    placeholder="12345678901"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Examen Antidoping</label>
                  <select
                    value={formData.antidopingStatus}
                    onChange={(e) => setFormData({ ...formData, antidopingStatus: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="APROBADO">APROBADO (Negativo)</option>
                    <option value="PENDIENTE">PENDIENTE DE APLICAR</option>
                    <option value="RECHAZADO">RECHAZADO (Positivo)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Fecha de Antidoping</label>
                  <input
                    type="date"
                    value={formData.antidopingDate}
                    onChange={(e) => setFormData({ ...formData, antidopingDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Examen Psicométrico</label>
                  <select
                    value={formData.psicometricoStatus}
                    onChange={(e) => setFormData({ ...formData, psicometricoStatus: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="APTO">APTO PARA SERVICIO</option>
                    <option value="EN_EVALUACION">EN EVALUACIÓN</option>
                    <option value="NO_APTO">NO APTO</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Licencia / Porte Armas (CUIP)</label>
                  <input
                    type="text"
                    value={formData.licenciaArmas}
                    onChange={(e) => setFormData({ ...formData, licenciaArmas: e.target.value })}
                    placeholder="CUIP-8921-SEDENA"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Contacto de Emergencia</label>
                  <input
                    type="text"
                    value={formData.emergencyContact}
                    onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                    placeholder="Esposa: 55-9876-5432"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Salario Base Registrado</label>
                  <input
                    type="text"
                    value={formData.salaryBase}
                    onChange={(e) => setFormData({ ...formData, salaryBase: e.target.value })}
                    placeholder="$12,000 MXN / Mes"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase mb-1">Observaciones de RH</label>
                <textarea
                  rows={2}
                  value={formData.observations}
                  onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                  placeholder="Anotaciones médicas, referencias laborales verificadas..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-semibold transition"
                >
                  Guardar Expediente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
