import React, { useState, useEffect, useRef } from 'react';
import { 
  Coffee, Award, Sparkles, Check, Smartphone, Store, Plus, 
  RefreshCw, Star, QrCode, Search, UserCheck, UserPlus, ArrowRight, 
  Lock, KeyRound, LogOut, Camera, X, LogIn, User
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from './supabaseClient';

const PIN_CAJA_CORRECTO = "Brunde1865";
const META_SELLOS = 8;
const PREMIO_TEXTO = "Café de Especialidad o Postre a elección";

// --- UTILIDADES DE FORMATO ---
const formatearRut = (valor) => {
  if (!valor) return '';
  const limpio = valor.replace(/[^0-9kK]/g, '').toUpperCase();
  if (limpio.length === 0) return '';
  if (limpio.length === 1) return limpio;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  const cuerpoFormateado = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpoFormateado}-${dv}`;
};

const formatearCelular = (valor) => {
  if (!valor) return '';
  let soloNumeros = valor.replace(/\D/g, '');
  if (soloNumeros.startsWith('569')) soloNumeros = soloNumeros.slice(3);
  else if (soloNumeros.startsWith('56')) soloNumeros = soloNumeros.slice(2);
  else if (soloNumeros.startsWith('9') && soloNumeros.length > 8) soloNumeros = soloNumeros.slice(1);

  const digitos = soloNumeros.slice(0, 8);
  if (digitos.length === 0) return '';
  if (digitos.length <= 4) return `+56 9 ${digitos}`;
  return `+56 9 ${digitos.slice(0, 4)} ${digitos.slice(4)}`;
};

export default function App() {
  const [vista, setVista] = useState('cliente'); // 'cliente' | 'registro' | 'login' | 'caja'
  const [mostrarQR, setMostrarQR] = useState(false);

  // 1. SESIÓN INDIVIDUAL DEL CLIENTE (Inicia en null)
  const [clienteActual, setClienteActual] = useState(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);

  // 2. ESTADOS DE CAJA (Independientes, inicia vacía)
  const [cajaAutenticada, setCajaAutenticada] = useState(false);
  const [pinIngresado, setPinIngresado] = useState("");
  const [errorPin, setErrorPin] = useState("");
  const [clienteCaja, setClienteCaja] = useState(null); // Vacío por defecto
  const [inputBusquedaCaja, setInputBusquedaCaja] = useState("");
  const [cargandoCaja, setCargandoCaja] = useState(false);
  const [mensajeCaja, setMensajeCaja] = useState({ texto: "", tipo: "" });
  const [escaneandoQR, setEscaneandoQR] = useState(false);
  const scannerRef = useRef(null);

  // 3. FORMULARIOS DE REGISTRO E INICIO DE SESIÓN
  const [formRegistro, setFormRegistro] = useState({ nombre: "", rut: "", telefono: "" });
  const [mensajeRegistro, setMensajeRegistro] = useState("");
  const [cargandoRegistro, setCargandoRegistro] = useState(false);

  const [inputLogin, setInputLogin] = useState("");
  const [mensajeLogin, setMensajeLogin] = useState("");
  const [cargandoLogin, setCargandoLogin] = useState(false);

  // =========================================================================
  // GESTIÓN DE SESIÓN DEL CLIENTE (localStorage)
  // =========================================================================
  useEffect(() => {
    const sesionId = localStorage.getItem('brundeis_cliente_id');
    if (sesionId) {
      cargarClientePorId(sesionId);
    } else {
      setCargandoSesion(false);
      setVista('registro'); // Si es nuevo visitante, directo al registro
    }
  }, []);

  const cargarClientePorId = async (id) => {
    try {
      setCargandoSesion(true);
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('id', id)
        .single();

      if (data && !error) {
        setClienteActual(data);
        setVista('cliente');
      } else {
        localStorage.removeItem('brundeis_cliente_id');
        setClienteActual(null);
        setVista('registro');
      }
    } catch {
      localStorage.removeItem('brundeis_cliente_id');
      setClienteActual(null);
      setVista('registro');
    } finally {
      setCargandoSesion(false);
    }
  };

  // Suscripción Realtime solo para el cliente autenticado
  useEffect(() => {
    if (!clienteActual?.id) return;

    const canal = supabase
      .channel(`cliente-${clienteActual.id}`)
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'clientes', 
          filter: `id=eq.${clienteActual.id}` 
        },
        (payload) => {
          if (payload.new) {
            setClienteActual(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(canal);
    };
  }, [clienteActual?.id]);

  // Cerrar sesión en el dispositivo cliente
  const cerrarSesionCliente = () => {
    localStorage.removeItem('brundeis_cliente_id');
    setClienteActual(null);
    setVista('registro');
  };

  // =========================================================================
  // ACCIONES DE REGISTRO E INICIO DE SESIÓN
  // =========================================================================
  const registrarNuevoCliente = async (e) => {
    e.preventDefault();
    if (!formRegistro.nombre.trim()) {
      setMensajeRegistro("Ingresa tu nombre completo.");
      return;
    }
    if (!formRegistro.rut.trim() && !formRegistro.telefono.trim()) {
      setMensajeRegistro("Ingresa al menos tu RUT o número de celular.");
      return;
    }

    setCargandoRegistro(true);
    setMensajeRegistro("");

    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert([
          {
            nombre: formRegistro.nombre.trim(),
            rut: formRegistro.rut.trim() || null,
            telefono: formRegistro.telefono.trim() || null,
            sellos: 1, // 1er sello de bienvenida automático
            tarjetas_completadas: 0,
          },
        ])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          setMensajeRegistro("Este RUT o teléfono ya tiene una tarjeta. Inicia sesión abajo.");
        } else {
          setMensajeRegistro("No se pudo crear la tarjeta. Revisa los datos ingresados.");
        }
      } else if (data) {
        localStorage.setItem('brundeis_cliente_id', data.id);
        setClienteActual(data);
        setFormRegistro({ nombre: "", rut: "", telefono: "" });
        setVista('cliente');
      }
    } catch {
      setMensajeRegistro("Error de conexión al registrar.");
    } finally {
      setCargandoRegistro(false);
    }
  };

  const iniciarSesionCliente = async (e) => {
    e.preventDefault();
    if (!inputLogin.trim()) return;

    setCargandoLogin(true);
    setMensajeLogin("");

    try {
      const criterio = inputLogin.trim();
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .or(`rut.ilike.%${criterio}%,telefono.ilike.%${criterio}%`)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        setMensajeLogin("No encontramos ninguna tarjeta con ese RUT o teléfono.");
      } else {
        localStorage.setItem('brundeis_cliente_id', data.id);
        setClienteActual(data);
        setInputLogin("");
        setVista('cliente');
      }
    } catch {
      setMensajeLogin("Error al buscar la tarjeta.");
    } finally {
      setCargandoLogin(false);
    }
  };

  // =========================================================================
  // CAJA / TERMINAL DE BARRA
  // =========================================================================
  const handleVerificarPin = (e) => {
    e.preventDefault();
    if (pinIngresado === PIN_CAJA_CORRECTO) {
      setCajaAutenticada(true);
      setErrorPin("");
      setPinIngresado("");
    } else {
      setErrorPin("Contraseña incorrecta.");
      setPinIngresado("");
    }
  };

  const buscarClienteEnCaja = async (termino) => {
    if (!termino) return;
    setCargandoCaja(true);
    setMensajeCaja({ texto: "", tipo: "" });

    try {
      const limpio = termino.trim();
      let query = supabase.from('clientes').select('*');

      // Si viene con prefijo BRUNDEIS: (desde el QR)
      if (limpio.startsWith('BRUNDEIS:')) {
        const idCliente = limpio.replace('BRUNDEIS:', '');
        query = query.eq('id', idCliente);
      } else {
        query = query.or(`rut.ilike.%${limpio}%,telefono.ilike.%${limpio}%`);
      }

      const { data, error } = await query.limit(1).maybeSingle();

      if (error || !data) {
        setClienteCaja(null);
        setMensajeCaja({ texto: "Cliente no registrado o código QR no válido.", tipo: "error" });
      } else {
        setClienteCaja(data);
        setMensajeCaja({ texto: "Cliente identificado exitosamente.", tipo: "exito" });
        setInputBusquedaCaja("");
      }
    } catch {
      setMensajeCaja({ texto: "Error al consultar la base de datos.", tipo: "error" });
    } finally {
      setCargandoCaja(false);
    }
  };

  // Control de escaneo por cámara en caja
  const iniciarEscanerCamara = () => {
    setEscaneandoQR(true);
    setMensajeCaja({ texto: "", tipo: "" });

    setTimeout(() => {
      try {
        const html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;

        html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          (decodedText) => {
            detenerEscanerCamara();
            buscarClienteEnCaja(decodedText);
          },
          () => {} // Ignorar errores por frame
        ).catch(() => {
          setMensajeCaja({ texto: "No se pudo acceder a la cámara del dispositivo.", tipo: "error" });
          setEscaneandoQR(false);
        });
      } catch {
        setEscaneandoQR(false);
      }
    }, 250);
  };

  const detenerEscanerCamara = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().then(() => {
        scannerRef.current.clear();
        scannerRef.current = null;
      }).catch(() => {});
    }
    setEscaneandoQR(false);
  };

  const sumarSelloCaja = async () => {
    if (!clienteCaja || clienteCaja.sellos >= META_SELLOS) return;
    const nuevosSellos = clienteCaja.sellos + 1;
    setCargandoCaja(true);

    try {
      const { error } = await supabase
        .from('clientes')
        .update({ sellos: nuevosSellos, updated_at: new Date() })
        .eq('id', clienteCaja.id);

      if (!error) {
        setClienteCaja(prev => ({ ...prev, sellos: nuevosSellos }));
        setMensajeCaja({ texto: `¡Sello acreditado! (${nuevosSellos}/${META_SELLOS})`, tipo: "exito" });
      } else {
        setMensajeCaja({ texto: "Error al guardar el sello.", tipo: "error" });
      }
    } finally {
      setCargandoCaja(false);
    }
  };

  const canjearPremioCaja = async () => {
    if (!clienteCaja) return;
    setCargandoCaja(true);
    const nuevasCompletadas = (clienteCaja.tarjetas_completadas || 0) + 1;

    try {
      const { error } = await supabase
        .from('clientes')
        .update({
          sellos: 1, // Reinicia con sello de cortesía
          tarjetas_completadas: nuevasCompletadas,
          updated_at: new Date()
        })
        .eq('id', clienteCaja.id);

      if (!error) {
        setClienteCaja(prev => ({
          ...prev,
          sellos: 1,
          tarjetas_completadas: nuevasCompletadas,
        }));
        setMensajeCaja({ texto: "¡Premio canjeado! Nueva tarjeta iniciada.", tipo: "exito" });
      } else {
        setMensajeCaja({ texto: "Error al procesar el canje.", tipo: "error" });
      }
    } finally {
      setCargandoCaja(false);
    }
  };

  const limpiarClienteCaja = () => {
    setClienteCaja(null);
    setInputBusquedaCaja("");
    setMensajeCaja({ texto: "", tipo: "" });
    if (escaneandoQR) detenerEscanerCamara();
  };

  // =========================================================================
  // RENDERIZADO
  // =========================================================================
  return (
    <div className="relative min-h-screen bg-[#0E0B09] text-[#F5EDE2] flex flex-col items-center justify-start p-4 font-sans select-none overflow-x-hidden">
      
      {/* Fondo del local */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center filter blur-[1px] opacity-85 brightness-95 pointer-events-none"
        style={{ backgroundImage: "url('/fondo.JPG')" }}
      />
      <div className="fixed inset-0 z-0 bg-black/50 pointer-events-none" />

      {/* Contenedor principal */}
      <div className="relative z-10 w-full flex flex-col items-center">
        
        {/* Selector de Navegación Superior */}
        <div className="flex bg-[#1E1815]/95 backdrop-blur-md border border-[#4A3B32] p-1.5 rounded-2xl mb-6 shadow-2xl">
          <button
            onClick={() => setVista(clienteActual ? 'cliente' : 'registro')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
              vista === 'cliente' || vista === 'registro' || vista === 'login'
                ? 'bg-[#C98A42] text-[#14100E] shadow-md shadow-[#C98A42]/30 font-bold'
                : 'text-[#A89A90] hover:text-[#F5EDE2]'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            {clienteActual ? 'Mi Tarjeta' : 'Registrarse'}
          </button>
          
          <button
            onClick={() => {
              if (escaneandoQR) detenerEscanerCamara();
              setVista('caja');
            }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
              vista === 'caja'
                ? 'bg-[#C98A42] text-[#14100E] shadow-md shadow-[#C98A42]/30 font-bold'
                : 'text-[#A89A90] hover:text-[#F5EDE2]'
            }`}
          >
            <Store className="w-3.5 h-3.5" />
            Caja
          </button>
        </div>

        {/* ================================================================= */}
        {/* VISTA 1: TARJETA DEL CLIENTE AUTENTICADO                          */}
        {/* ================================================================= */}
        {vista === 'cliente' && clienteActual && (
          <div className="w-full max-w-sm bg-[#1A1411]/92 backdrop-blur-xl border border-[#4A3B32] rounded-[32px] p-6 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#C98A42]/20 rounded-full blur-3xl pointer-events-none" />

            {/* Cabecera */}
            <div className="flex items-center justify-between border-b border-[#332822] pb-4">
              <div>
                <span className="text-[10px] font-bold tracking-[0.2em] text-[#D99B52] uppercase">
                  Club de Fidelización
                </span>
                <h1 className="text-2xl font-black tracking-wider text-[#F5EDE2] mt-0.5">
                  BRUNDEIS
                </h1>
                <p className="text-[11px] text-[#A89A90] font-medium tracking-wide">
                  Cafetería & Cocina
                </p>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-[#261E1A] border border-[#4A3B32] flex items-center justify-center text-[#D99B52] shadow-inner">
                <Coffee className="w-6 h-6 stroke-[2]" />
              </div>
            </div>

            {/* Datos Personales del Cliente */}
            <div className="flex justify-between items-center bg-[#241D19]/90 border border-[#3E3029] rounded-2xl p-3.5 px-4 shadow-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#A89A90] font-semibold">Titular</p>
                <p className="text-base font-bold text-[#F5EDE2]">{clienteActual.nombre}</p>
                <div className="flex flex-col text-[11px] font-mono mt-0.5 space-y-0.5">
                  {clienteActual.rut && <span className="text-[#D99B52]">RUT: {clienteActual.rut}</span>}
                  {clienteActual.telefono && <span className="text-[#A89A90] text-[10px]">{clienteActual.telefono}</span>}
                </div>
              </div>
              <button
                onClick={() => setMostrarQR(!mostrarQR)}
                className="flex items-center gap-1.5 bg-[#171210] hover:bg-[#2D231E] border border-[#4A3B32] text-[#D99B52] px-3 py-2 rounded-xl text-xs font-semibold transition"
              >
                <QrCode className="w-4 h-4" />
                <span>{mostrarQR ? 'Ocultar' : 'Mi QR'}</span>
              </button>
            </div>

            {/* Despliegue de Código QR Seguro con identificador único */}
            {mostrarQR && (
              <div className="bg-[#14100E] border border-[#4A3B32] rounded-2xl p-5 flex flex-col items-center text-center space-y-3 shadow-inner">
                <p className="text-xs text-[#A89A90]">Muestra este código en la barra para que el cajero lo escanee:</p>
                <div className="bg-white p-3 rounded-2xl shadow-lg">
                  <QRCodeSVG 
                    value={`BRUNDEIS:${clienteActual.id}`}
                    size={160} 
                    bgColor="#FFFFFF"
                    fgColor="#120E0C"
                    level="M"
                  />
                </div>
                <div className="text-[11px] font-mono text-[#D99B52]">
                  {clienteActual.rut ? `RUT: ${clienteActual.rut}` : clienteActual.nombre}
                </div>
              </div>
            )}

            {/* Grilla de Sellos del Cliente */}
            <div className="bg-[#14100E]/95 border border-[#382B24] rounded-2xl p-5 shadow-inner">
              <div className="grid grid-cols-4 gap-3 place-items-center">
                {Array.from({ length: META_SELLOS }).map((_, index) => {
                  const estaSellado = index < clienteActual.sellos;
                  const esUltimo = index === META_SELLOS - 1;

                  return (
                    <div
                      key={index}
                      className={`relative w-14 h-14 rounded-2xl flex flex-col items-center justify-center transition-all duration-300 ${
                        estaSellado
                          ? 'bg-gradient-to-br from-[#D99B52] to-[#B3762E] text-[#14100E] shadow-lg shadow-[#C98A42]/30 scale-100'
                          : 'bg-[#211A16] border border-dashed border-[#42332B] text-[#6E5D53]'
                      }`}
                    >
                      {estaSellado ? (
                        esUltimo ? (
                          <Sparkles className="w-6 h-6 stroke-[2.2] animate-pulse" />
                        ) : (
                          <Check className="w-6 h-6 stroke-[3]" />
                        )
                      ) : esUltimo ? (
                        <Star className="w-5 h-5 text-[#A89A90] stroke-[1.8]" />
                      ) : (
                        <span className="text-xs font-bold font-mono tracking-tighter">{index + 1}</span>
                      )}

                      {esUltimo && !estaSellado && (
                        <span className="absolute -bottom-1 text-[8px] font-bold tracking-wider uppercase text-[#D99B52] bg-[#14100E] px-1.5 py-0.2 rounded-full border border-[#42332B]">
                          Premio
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Barra de Progreso */}
              <div className="mt-5 space-y-2">
                <div className="flex justify-between text-xs font-medium text-[#A89A90]">
                  <span>Progreso de visitas</span>
                  <span className="text-[#D99B52] font-bold">{clienteActual.sellos} de {META_SELLOS} sellos</span>
                </div>
                <div className="w-full bg-[#231B17] h-2.5 rounded-full overflow-hidden p-0.5 border border-[#3E3029]">
                  <div
                    className="bg-gradient-to-r from-[#B3762E] to-[#D99B52] h-full rounded-full transition-all duration-500 shadow-sm"
                    style={{ width: `${(clienteActual.sellos / META_SELLOS) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Recompensa */}
            <div className="bg-[#241D19]/90 border border-[#4A3B32] rounded-2xl p-4 flex items-start gap-3.5 shadow-md">
              <div className="p-2.5 bg-[#C98A42]/20 border border-[#C98A42]/40 rounded-xl text-[#D99B52] mt-0.5">
                <Award className="w-5 h-5 stroke-[2]" />
              </div>
              <div>
                <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#D99B52]">Recompensa Activa</h4>
                <p className="text-sm font-semibold text-[#F5EDE2] mt-0.5 leading-snug">{PREMIO_TEXTO}</p>
                <p className="text-xs text-[#A89A90] mt-1">
                  {clienteActual.sellos >= META_SELLOS
                    ? "¡Meta alcanzada! Presenta esta pantalla en caja para canjear tu premio."
                    : `Acumula ${META_SELLOS - clienteActual.sellos} visitas más para desbloquearlo.`}
                </p>
              </div>
            </div>

            {/* Cerrar sesión en el teléfono */}
            <div className="text-center pt-2">
              <button
                onClick={cerrarSesionCliente}
                className="text-xs text-[#8C7E75] hover:text-[#E57373] transition flex items-center justify-center gap-1 mx-auto"
              >
                <LogOut className="w-3.5 h-3.5" />
                Salir de mi cuenta / Cambiar de cliente
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* VISTA 2: FORMULARIO DE REGISTRO PARA NUEVOS CLIENTES             */}
        {/* ================================================================= */}
        {vista === 'registro' && (
          <div className="w-full max-w-sm bg-[#1A1411]/92 backdrop-blur-xl border border-[#4A3B32] rounded-[32px] p-6 shadow-2xl space-y-5">
            <div className="border-b border-[#332822] pb-3 text-center">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#D99B52] uppercase">
                Bienvenido
              </span>
              <h2 className="text-xl font-black text-[#F5EDE2] mt-0.5">Club Brundeis</h2>
              <p className="text-xs text-[#A89A90] mt-1">
                Regístrate y recibe tu <strong className="text-[#D99B52]">primer sello gratis</strong> de bienvenida.
              </p>
            </div>

            <form onSubmit={registrarNuevoCliente} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#A89A90] uppercase tracking-wider block mb-1">
                  Tu Nombre *
                </label>
                <input
                  type="text"
                  placeholder="Ej: Constanza Morales"
                  required
                  value={formRegistro.nombre}
                  onChange={(e) => setFormRegistro({ ...formRegistro, nombre: e.target.value })}
                  className="w-full bg-[#14100E] border border-[#3E3029] rounded-xl px-4 py-3 text-sm text-[#F5EDE2] focus:outline-none focus:border-[#C98A42] transition"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-[#A89A90] uppercase tracking-wider">
                    RUT
                  </label>
                  <span className="text-[10px] text-[#A89A90]">Automático</span>
                </div>
                <input
                  type="text"
                  maxLength={12}
                  placeholder="Ej: 18.234.567-8"
                  value={formRegistro.rut}
                  onChange={(e) => setFormRegistro(prev => ({ ...prev, rut: formatearRut(e.target.value) }))}
                  className="w-full bg-[#14100E] border border-[#3E3029] rounded-xl px-4 py-3 text-sm font-mono text-[#F5EDE2] focus:outline-none focus:border-[#C98A42] transition tracking-wider"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-[#A89A90] uppercase tracking-wider">
                    Celular
                  </label>
                  <span className="text-[10px] text-[#A89A90]">+56 9</span>
                </div>
                <input
                  type="tel"
                  maxLength={17}
                  placeholder="+56 9 1234 5678"
                  value={formRegistro.telefono}
                  onChange={(e) => setFormRegistro(prev => ({ ...prev, telefono: formatearCelular(e.target.value) }))}
                  className="w-full bg-[#14100E] border border-[#3E3029] rounded-xl px-4 py-3 text-sm font-mono text-[#F5EDE2] focus:outline-none focus:border-[#C98A42] transition tracking-wider"
                />
              </div>

              {mensajeRegistro && (
                <p className="text-xs text-[#E57373] text-center font-medium">{mensajeRegistro}</p>
              )}

              <button
                type="submit"
                disabled={cargandoRegistro}
                className="w-full py-4 bg-gradient-to-r from-[#B3762E] to-[#D99B52] hover:brightness-110 text-[#14100E] font-bold rounded-2xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-[#C98A42]/25 transition"
              >
                <span>{cargandoRegistro ? "Creando tarjeta..." : "Crear mi Tarjeta Digital"}</span>
                <ArrowRight className="w-4 h-4 stroke-[2.5]" />
              </button>
            </form>

            <div className="border-t border-[#2C221D] pt-3 text-center">
              <button
                onClick={() => setVista('login')}
                className="text-xs text-[#D99B52] hover:underline font-medium"
              >
                ¿Ya tienes tarjeta registrada? Ingresa aquí
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* VISTA 3: INICIO DE SESIÓN PARA CLIENTES EXISTENTES                */}
        {/* ================================================================= */}
        {vista === 'login' && (
          <div className="w-full max-w-sm bg-[#1A1411]/92 backdrop-blur-xl border border-[#4A3B32] rounded-[32px] p-6 shadow-2xl space-y-5">
            <div className="border-b border-[#332822] pb-3 text-center">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#D99B52] uppercase">
                Club Brundeis
              </span>
              <h2 className="text-xl font-black text-[#F5EDE2] mt-0.5">Ver mi Tarjeta</h2>
              <p className="text-xs text-[#A89A90] mt-1">
                Ingresa con tu RUT o Celular registrado
              </p>
            </div>

            <form onSubmit={iniciarSesionCliente} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#A89A90] uppercase tracking-wider block mb-1">
                  RUT o Celular
                </label>
                <input
                  type="text"
                  placeholder="Ej: 18.234.567-8 ó 912345678"
                  required
                  value={inputLogin}
                  onChange={(e) => setInputLogin(e.target.value)}
                  className="w-full bg-[#14100E] border border-[#3E3029] rounded-xl px-4 py-3 text-sm font-mono text-[#F5EDE2] focus:outline-none focus:border-[#C98A42] transition"
                />
              </div>

              {mensajeLogin && (
                <p className="text-xs text-[#E57373] text-center font-medium">{mensajeLogin}</p>
              )}

              <button
                type="submit"
                disabled={cargandoLogin}
                className="w-full py-4 bg-gradient-to-r from-[#B3762E] to-[#D99B52] hover:brightness-110 text-[#14100E] font-bold rounded-2xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-[#C98A42]/25 transition"
              >
                <LogIn className="w-4 h-4 stroke-[2.5]" />
                <span>{cargandoLogin ? "Buscando..." : "Abrir mi Tarjeta"}</span>
              </button>
            </form>

            <div className="border-t border-[#2C221D] pt-3 text-center">
              <button
                onClick={() => setVista('registro')}
                className="text-xs text-[#A89A90] hover:text-[#F5EDE2] font-medium"
              >
                ← Volver al formulario de registro
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* VISTA 4: TERMINAL DE CAJA (Inicia protegida y limpia)             */}
        {/* ================================================================= */}
        {vista === 'caja' && (
          <div className="w-full max-w-sm bg-[#1A1411]/92 backdrop-blur-xl border border-[#4A3B32] rounded-[32px] p-6 shadow-2xl space-y-6">
            
            {/* Si no está autenticada, pide PIN */}
            {!cajaAutenticada ? (
              <form onSubmit={handleVerificarPin} className="space-y-5 text-center">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-[#261E1A] border border-[#4A3B32] flex items-center justify-center text-[#D99B52] shadow-inner mb-2">
                  <Lock className="w-6 h-6 stroke-[2]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#F5EDE2]">Acceso Restringido</h2>
                  <p className="text-xs text-[#A89A90] mt-1">Ingresa la clave de barra para operar la caja</p>
                </div>

                <div>
                  <input
                    type="password"
                    autoFocus
                    placeholder="Contraseña"
                    value={pinIngresado}
                    onChange={(e) => setPinIngresado(e.target.value)}
                    className="w-full text-center tracking-wider text-lg font-mono bg-[#14100E] border border-[#3E3029] rounded-2xl py-3 px-4 text-[#F5EDE2] focus:outline-none focus:border-[#C98A42] transition"
                  />
                  {errorPin && (
                    <p className="text-xs text-[#E57373] font-medium mt-2">{errorPin}</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-gradient-to-r from-[#B3762E] to-[#D99B52] hover:brightness-110 text-[#14100E] font-bold rounded-2xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-[#C98A42]/25 transition"
                >
                  <KeyRound className="w-4 h-4 stroke-[2.5]" />
                  Desbloquear Caja
                </button>
              </form>
            ) : (
              /* Terminal Desbloqueada */
              <div className="space-y-5">
                <div className="border-b border-[#332822] pb-3 flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold text-[#F5EDE2]">Terminal Barra</h2>
                    <p className="text-xs text-[#A89A90]">Escanear o buscar cliente</p>
                  </div>
                  <button
                    onClick={() => {
                      if (escaneandoQR) detenerEscanerCamara();
                      setCajaAutenticada(false);
                    }}
                    title="Bloquear caja"
                    className="text-[#A89A90] hover:text-[#E57373] p-1.5 rounded-lg border border-[#3E3029] bg-[#14100E]"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>

                {/* BOTÓN Y VISOR DE ESCÁNER DE CÁMARA */}
                {!clienteCaja && !escaneandoQR && (
                  <button
                    onClick={iniciarEscanerCamara}
                    className="w-full py-3.5 bg-[#2A201B] hover:bg-[#342822] border border-[#C98A42]/40 rounded-2xl text-[#D99B52] font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition"
                  >
                    <Camera className="w-4 h-4" />
                    Escanear Código QR con Cámara
                  </button>
                )}

                {escaneandoQR && (
                  <div className="bg-[#14100E] border border-[#4A3B32] rounded-2xl p-4 text-center space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-[#A89A90] font-medium">Apunta al código QR del cliente</span>
                      <button 
                        onClick={detenerEscanerCamara} 
                        className="text-[#E57373] p-1 rounded hover:bg-[#231A15]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    {/* Contenedor del escáner */}
                    <div id="reader" className="w-full rounded-xl overflow-hidden bg-black aspect-square" />
                  </div>
                )}

                {/* BUSCADOR MANUAL POR RUT O TELÉFONO */}
                {!clienteCaja && (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[#A89A90] uppercase tracking-wider block">
                      O buscar manualmente
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="RUT o Celular del cliente"
                        value={inputBusquedaCaja}
                        onChange={(e) => setInputBusquedaCaja(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && buscarClienteEnCaja(inputBusquedaCaja)}
                        className="flex-1 bg-[#14100E] border border-[#3E3029] rounded-xl px-4 py-3 text-sm font-mono text-[#F5EDE2] focus:outline-none focus:border-[#C98A42] transition"
                      />
                      <button
                        onClick={() => buscarClienteEnCaja(inputBusquedaCaja)}
                        disabled={cargandoCaja || !inputBusquedaCaja}
                        className="bg-[#241D19] border border-[#4A3B32] hover:bg-[#2F241F] text-[#D99B52] px-4 rounded-xl flex items-center justify-center transition"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {mensajeCaja.texto && (
                  <p className={`text-xs text-center font-medium ${mensajeCaja.tipo === 'error' ? 'text-[#E57373]' : 'text-[#D99B52]'}`}>
                    {mensajeCaja.texto}
                  </p>
                )}

                {/* CLIENTE IDENTIFICADO EN CAJA */}
                {clienteCaja ? (
                  <div className="space-y-4">
                    <div className="bg-[#241D19] border border-[#4A3B32] rounded-2xl p-4 space-y-2.5 shadow-sm relative">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] text-[#A89A90] uppercase font-bold tracking-wider">Cliente Identificado</span>
                          <h3 className="text-base font-bold text-[#F5EDE2] flex items-center gap-1.5 mt-0.5">
                            <UserCheck className="w-4 h-4 text-[#D99B52]" />
                            {clienteCaja.nombre}
                          </h3>
                        </div>
                        <button
                          onClick={limpiarClienteCaja}
                          title="Quitar cliente y atender a otro"
                          className="text-xs text-[#A89A90] hover:text-[#E57373] bg-[#14100E] border border-[#3E3029] px-2.5 py-1 rounded-lg transition"
                        >
                          Cambiar
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-[#332822]">
                        <div>
                          <span className="text-[#8C7E75] block text-[10px]">RUT</span>
                          <span className="font-mono text-[#D99B52]">{clienteCaja.rut || 'No indicado'}</span>
                        </div>
                        <div>
                          <span className="text-[#8C7E75] block text-[10px]">Celular</span>
                          <span className="font-mono text-[#A89A90]">{clienteCaja.telefono || 'No indicado'}</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-1 border-t border-[#332822] text-xs">
                        <span className="text-[#A89A90]">Sellos acumulados:</span>
                        <span className="text-[#D99B52] font-black text-sm">{clienteCaja.sellos} / {META_SELLOS}</span>
                      </div>
                    </div>

                    {/* BOTONES DE ACREDITACIÓN / CANJE */}
                    <div className="space-y-2.5">
                      <button
                        onClick={sumarSelloCaja}
                        disabled={clienteCaja.sellos >= META_SELLOS || cargandoCaja}
                        className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 text-sm tracking-wide transition-all ${
                          clienteCaja.sellos >= META_SELLOS || cargandoCaja
                            ? 'bg-[#241D19] text-[#6E5D53] cursor-not-allowed border border-[#382B24]'
                            : 'bg-gradient-to-r from-[#B3762E] to-[#D99B52] hover:brightness-110 text-[#14100E] shadow-lg shadow-[#C98A42]/25 active:scale-98'
                        }`}
                      >
                        <Plus className="w-5 h-5 stroke-[2.5]" />
                        {cargandoCaja ? "Guardando..." : "Acreditar Visita (+1 Sello)"}
                      </button>

                      {clienteCaja.sellos >= META_SELLOS && (
                        <button
                          onClick={canjearPremioCaja}
                          disabled={cargandoCaja}
                          className="w-full py-3.5 bg-[#241D19] hover:bg-[#2C231E] border border-[#C98A42]/50 rounded-2xl font-semibold flex items-center justify-center gap-2 text-xs text-[#F5EDE2] transition"
                        >
                          <RefreshCw className="w-4 h-4 text-[#D99B52]" />
                          Canjear Premio y Abrir Nueva Tarjeta
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-xs text-[#8C7E75] border border-dashed border-[#382B24] rounded-2xl">
                    Ningún cliente seleccionado.<br />Escanea un código QR o ingresa su RUT arriba para comenzar.
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}