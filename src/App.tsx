import React, { useState, useEffect } from 'react';
import { 
  Shield, Lock, LogOut, Users, UserCheck, Radio, 
  AlertTriangle, KeyRound, Building, CheckCircle2, ChevronRight, Download
} from 'lucide-react';
import { 
  signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, getDoc, setDoc, onSnapshot, collection, getDocs 
} from 'firebase/firestore';
import { auth, googleProvider, db } from './firebase';
import { UserProfile, UserRole } from './types';
import { AdminPanel } from './components/AdminPanel';
import { RHPanel } from './components/RHPanel';
import { OperativoPanel } from './components/OperativoPanel';

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [unauthorizedEmail, setUnauthorizedEmail] = useState<string | null>(null);

  // Active view tab for roles with multiple access (e.g. Admin can supervise all 3)
  const [currentView, setCurrentView] = useState<'ADMIN' | 'RH' | 'OPERATIVO'>('OPERATIVO');

  // PWA install prompt state
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  useEffect(() => {
    // Catch PWA beforeinstallprompt event
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    // Track authentication state
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setErrorNotice(null);
      setUnauthorizedEmail(null);

      if (user) {
        setFirebaseUser(user);
        const userEmail = (user.email || '').toLowerCase();

        try {
          // Check if there is an authorization profile created for this user
          // First check by direct UID
          let userDocRef = doc(db, 'users', user.uid);
          let snap = await getDoc(userDocRef);

          // If not found by UID, search by email (since Admin pre-registers elements with email)
          if (!snap.exists()) {
            const pseudoUid = 'usr_' + userEmail.replace(/[^a-zA-Z0-9]/g, '_');
            const pseudoRef = doc(db, 'users', pseudoUid);
            const pseudoSnap = await getDoc(pseudoRef);

            if (pseudoSnap.exists()) {
              // Found the pre-authorization by Admin! Migrate/link to real auth UID
              const data = pseudoSnap.data() as UserProfile;
              const authorizedProfile: UserProfile = {
                ...data,
                uid: user.uid,
                displayName: user.displayName || data.displayName || 'Personal de Seguridad',
              };
              await setDoc(userDocRef, authorizedProfile);
              setUserProfile(authorizedProfile);
              setDefaultViewForRole(authorizedProfile.role);
            } else {
              // SPECIAL BOOTSTRAP: If it's the master administrator email (lopzcecy@gmail.com)
              // or first setup, auto-provision initial master ADMIN profile
              if (userEmail === 'lopzcecy@gmail.com') {
                const adminProfile: UserProfile = {
                  uid: user.uid,
                  email: userEmail,
                  displayName: user.displayName || 'Director General (Admin)',
                  role: 'ADMIN',
                  employeeCode: 'DIR-001',
                  assignedPost: 'Dirección Central',
                  status: 'ACTIVO',
                  createdAt: new Date().toISOString(),
                };
                await setDoc(userDocRef, adminProfile);
                setUserProfile(adminProfile);
                setDefaultViewForRole('ADMIN');
              } else {
                // USER HAS NOT BEEN PRE-AUTHORIZED BY ADMINISTRATION!
                // As requested: "en el que solo se le sea dado cuando la administracion le cree su perfil a los elementos"
                setUnauthorizedEmail(userEmail);
                setUserProfile(null);
              }
            }
          } else {
            const profile = snap.data() as UserProfile;
            if (profile.status !== 'ACTIVO') {
              setErrorNotice('Tu cuenta se encuentra inactiva o suspendida por la administración.');
              setUserProfile(null);
            } else {
              setUserProfile(profile);
              setDefaultViewForRole(profile.role);
            }
          }
        } catch (err: any) {
          console.error('Error fetching user profile:', err);
          setErrorNotice('Error al verificar credenciales con la base de datos de seguridad.');
        }
      } else {
        setFirebaseUser(null);
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => {
      unsubscribe();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const setDefaultViewForRole = (role: UserRole) => {
    if (role === 'ADMIN') setCurrentView('ADMIN');
    else if (role === 'RH') setCurrentView('RH');
    else setCurrentView('OPERATIVO');
  };

  const handleGoogleLogin = async () => {
    setErrorNotice(null);
    setUnauthorizedEmail(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error('Login error:', err);
      setErrorNotice(err.message || 'Error al iniciar sesión con Google.');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setFirebaseUser(null);
    setUserProfile(null);
    setUnauthorizedEmail(null);
  };

  const handleInstallClick = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  // 1. Loading screen
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400 text-sm font-medium tracking-wide">
          Verificando credenciales del sistema de seguridad...
        </p>
      </div>
    );
  }

  // 2. Unauthenticated screen or Unauthorized (Access Denied because Admin hasn't created profile)
  if (!firebaseUser || unauthorizedEmail || !userProfile) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-8">
        {/* Top bar */}
        <div className="flex items-center justify-between max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xs uppercase tracking-widest text-blue-400 font-bold">Plataforma PWA</span>
              <h2 className="text-lg font-bold text-white tracking-tight">SegurControl</h2>
            </div>
          </div>

          {installPrompt && (
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white rounded-lg border border-slate-700 transition"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" /> Instalar App
            </button>
          )}
        </div>

        {/* Center Card */}
        <div className="max-w-md w-full mx-auto my-12 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-36 h-36 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

          <div className="text-center space-y-2 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700 mx-auto flex items-center justify-center text-blue-400 mb-3 shadow-inner">
              <Lock className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Control de Acceso Restringido
            </h1>
            <p className="text-sm text-slate-400">
              Sistema corporativo de seguridad privada con módulos segregados por rol.
            </p>
          </div>

          {/* If user logged in with a Google email NOT registered by Admin yet */}
          {unauthorizedEmail ? (
            <div className="space-y-4">
              <div className="p-4 bg-amber-950/40 border border-amber-800/50 rounded-xl text-amber-200 text-xs leading-relaxed space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-400 text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Perfil No Dado de Alta
                </div>
                <p>
                  El correo <strong className="text-white font-mono">{unauthorizedEmail}</strong> no ha sido autorizado previamente por la <strong>Administración</strong>.
                </p>
                <p className="text-slate-400">
                  Por norma de seguridad interna, un elemento solo puede ingresar cuando la administración registre su perfil con su rol asignado (Operativo, RH o Administrativo).
                </p>
              </div>

              <button
                onClick={handleLogout}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-semibold transition border border-slate-700 flex items-center justify-center gap-2"
              >
                <LogOut className="w-4 h-4" /> Probar con otra cuenta
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {errorNotice && (
                <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-xl text-red-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorNotice}</span>
                </div>
              )}

              <div className="space-y-3">
                <button
                  id="btn-login-google"
                  onClick={handleGoogleLogin}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-600/25 transition flex items-center justify-center gap-3"
                >
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12.24 10.285V14.4h6.806c-.275 1.765-2.056 5.174-6.806 5.174-4.095 0-7.439-3.389-7.439-7.574s3.344-7.574 7.439-7.574c2.33 0 3.891.989 4.785 1.849l3.254-3.138C18.189 1.186 15.479 0 12.24 0c-6.635 0-12 5.365-12 12s5.365 12 12 12c6.926 0 11.52-4.869 11.52-11.726 0-.788-.085-1.39-.189-1.989H12.24z"/>
                  </svg>
                  <span>Iniciar Sesión con Google</span>
                </button>
              </div>

              {/* Informative breakdown of segregated areas */}
              <div className="mt-6 pt-5 border-t border-slate-800/80 space-y-2.5 text-xs text-slate-400">
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
                  Estructura de Áreas Divididas
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0"></div>
                  <div>
                    <strong className="text-slate-200">Administración:</strong> Solo Dirección General. Asigna roles, contraseñas, altas y puestos.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0"></div>
                  <div>
                    <strong className="text-slate-200">Recursos Humanos (RH):</strong> Expedientes confidenciales, exámenes toxicológicos y licencias de armas.
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0"></div>
                  <div>
                    <strong className="text-slate-200">Área Operativa:</strong> Personal de guardia, control de turnos y bitácora de novedades en caseta.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-slate-600 max-w-md mx-auto">
          SegurControl PWA © {new Date().getFullYear()} — Protocolo de confidencialidad y control de accesos activo.
        </div>
      </div>
    );
  }

  // 3. Authenticated Screen with strict role views
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white tracking-tight text-base">SegurControl</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-blue-400 border border-slate-700">
                  PWA
                </span>
              </div>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                Sistema Operativo y Administrativo
              </span>
            </div>
          </div>

          {/* Role Badges & Navigation Switcher (Admin can inspect other areas, but RH only RH, Operativo only Operativo) */}
          <div className="flex items-center gap-3">
            {userProfile.role === 'ADMIN' && (
              <div className="hidden md:flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setCurrentView('ADMIN')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                    currentView === 'ADMIN'
                      ? 'bg-red-950 text-red-300 border border-red-800/80 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Panel Admin
                </button>
                <button
                  onClick={() => setCurrentView('RH')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                    currentView === 'RH'
                      ? 'bg-amber-950 text-amber-300 border border-amber-800/80 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Módulo RH
                </button>
                <button
                  onClick={() => setCurrentView('OPERATIVO')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                    currentView === 'OPERATIVO'
                      ? 'bg-blue-950 text-blue-300 border border-blue-800/80 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Operaciones
                </button>
              </div>
            )}

            {/* Current user pill */}
            <div className="flex items-center gap-2.5 bg-slate-800/60 border border-slate-700/60 pl-3 pr-2 py-1.5 rounded-xl">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-white leading-tight">
                  {userProfile.displayName}
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  {userProfile.role === 'ADMIN'
                    ? 'DIRECCIÓN GENERAL'
                    : userProfile.role === 'RH'
                    ? 'RECURSOS HUMANOS'
                    : `OPERATIVO (${userProfile.employeeCode || 'GUARDIA'})`}
                </div>
              </div>

              <button
                id="btn-logout"
                title="Cerrar Sesión"
                onClick={handleLogout}
                className="p-1.5 hover:bg-slate-700 text-slate-400 hover:text-rose-400 rounded-lg transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation tab for Admin */}
        {userProfile.role === 'ADMIN' && (
          <div className="flex md:hidden border-t border-slate-800/80 bg-slate-950 px-2 py-1.5 gap-1 justify-around text-xs">
            <button
              onClick={() => setCurrentView('ADMIN')}
              className={`flex-1 py-1.5 text-center font-medium rounded ${
                currentView === 'ADMIN' ? 'bg-red-950 text-red-300' : 'text-slate-400'
              }`}
            >
              Admin
            </button>
            <button
              onClick={() => setCurrentView('RH')}
              className={`flex-1 py-1.5 text-center font-medium rounded ${
                currentView === 'RH' ? 'bg-amber-950 text-amber-300' : 'text-slate-400'
              }`}
            >
              RH
            </button>
            <button
              onClick={() => setCurrentView('OPERATIVO')}
              className={`flex-1 py-1.5 text-center font-medium rounded ${
                currentView === 'OPERATIVO' ? 'bg-blue-950 text-blue-300' : 'text-slate-400'
              }`}
            >
              Operaciones
            </button>
          </div>
        )}
      </header>

      {/* Main Content Render with Role Boundaries */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
        {/* Strictly enforce role division */}
        {userProfile.role === 'OPERATIVO' && (
          <OperativoPanel currentUser={userProfile} />
        )}

        {userProfile.role === 'RH' && (
          <RHPanel currentUser={userProfile} />
        )}

        {userProfile.role === 'ADMIN' && (
          <>
            {currentView === 'ADMIN' && <AdminPanel currentUser={userProfile} />}
            {currentView === 'RH' && <RHPanel currentUser={userProfile} />}
            {currentView === 'OPERATIVO' && <OperativoPanel currentUser={userProfile} />}
          </>
        )}
      </main>
    </div>
  );
}
