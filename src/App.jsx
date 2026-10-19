import React, { useState, useEffect, useRef } from 'react';
import { 
  Coffee, Award, Sparkles, Check, Smartphone, Store, Plus, 
  RefreshCw, Star, QrCode, Search, UserCheck, ArrowRight, 
  Lock, KeyRound, LogOut, Camera, X, LogIn, UserPlus
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from './supabaseClient';

const PIN_CAJA_CORRECTO = "Brunde1865";
const META_SELLOS = 8;
const PREMIO_TEXTO = "Café de Especialidad o Postre a elección";

// =========================================================================
// UTILIDADES DE RUT CHILENO (FORMATO Y VALIDACIÓN OFICIAL MÓDULO 11)
// =========================================================================

// Limpia el RUT dejando solo dígitos y K mayúscula
const limpiarRut = (valor) => {
  if (!valor) return '';
  return valor.toString().replace(/[^0-9kK]/g, '').toUpperCase();
};

// Formatea en tiempo real mientras el usuario escribe o pega
const formatearRutEnVivo = (valor) => {
  const limpio = limpiarRut(valor);
  if (!limpio) return '';
  
  // Limitar a 9 caracteres (ej: 22.232.223-4 o 9.123.456-7)
  const recortado = limpio.slice(0, 9);
  if (recortado.length === 1) return recortado;

  const cuerpo = recortado.slice(0, -1);
  const dv = recortado.slice(-1);

  // Inserción de puntos de miles
  const cuerpoConPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpoConPuntos}-${dv}`;
};

// Validación flexible: solo exige que tenga cuerpo y guion con su dígito verificador
const validarRutChileno = (rutFormateado) => {
  const limpio = limpiarRut(rutFormateado);
  // Permite cualquier RUT entre 7 y 9 caracteres (desde 1 millón hasta 99 millones)
  return limpio.length >= 7 && limpio.length <= 9;
};

  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);

  let suma = 0;
  let multiplo = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo.charAt(i), 10) * multiplo;
    multiplo = multiplo < 7 ? multiplo + 1 : 2;
  }

  const resto = 11 - (suma % 11);
  let dvEsperado = '';
  if (resto === 11) dvEsperado = '0';
  else if (resto === 10) dvEsperado = 'K';
  else dvEsperado = resto.toString();

  return dv === dvEsperado;

export default function App() {
  const [vista, setVista] = useState('cliente'); // 'cliente' | 'consulta_rut' | 'registro' | 'caja'
  const [mostrarQR, setMostrarQR] = useState(false);

  // 1. Cliente activo
  const [clienteActual, setClienteActual] = useState(null);

  // 2. Consulta de cliente por RUT
  const [inputRutCliente, setInputRutCliente] = useState("");
  const [mensajeConsultaCliente, setMensajeConsultaCliente] = useState("");
  const [cargandoConsultaCliente, setCargandoConsultaCliente] = useState(false);

  // 3. Registro nuevo cliente
  const [formRegistro, setFormRegistro] = useState({ nombre: "", rut: "" });
  const [mensajeRegistro, setMensajeRegistro] = useState("");
  const [cargandoRegistro, setCargandoRegistro] = useState(false);

  // 4. Terminal de Caja
  const [cajaAutenticada, setCajaAutenticada] = useState(false);
  const [pinIngresado, setPinIngresado] = useState("");
  const [errorPin, setErrorPin] = useState("");
  const [clienteCaja, setClienteCaja] = useState(null);
  const [inputRutCaja, setInputRutCaja] = useState("");
  const [cargandoCaja, setCargandoCaja] = useState(false);
  const [mensajeCaja, setMensajeCaja] = useState({ texto: "", tipo: "" });
  const [escaneandoQR, setEscaneandoQR] = useState(false);
  const scannerRef = useRef(null);

  // =========================================================================
  // GESTIÓN DE SESIÓN LOCAL
  // =========================================================================
  useEffect(() => {
    const sesionId = localStorage.getItem('brundeis_cliente_id');
    if (sesionId) {
      cargarClientePorId(sesionId);
    } else {
      setVista('consulta_rut');
    }
  }, []);

  const cargarClientePorId = async (id) => {
    try {
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
        setVista('consulta_rut');
      }
    } catch {
      localStorage.removeItem('brundeis_cliente_id');
      setClienteActual(null);
      setVista('consulta_rut');
    }
  };

  // Suscripción Realtime para la tarjeta activa
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

  const cerrarSesionCliente = () => {
    localStorage.removeItem('brundeis_cliente_id');
    setClienteActual(null);
    setInputRutCliente("");
    setVista('consulta_rut');
  };

  // =========================================================================
  // 1. CONSULTA DE CLIENTE POR RUT (PANTALLA CLIENTE)
  // =========================================================================
  const consultarTarjetaCliente = async (e) => {
    e.preventDefault();
    setMensajeConsultaCliente("");

    const rutFormateado = inputRutCliente.trim();
    const rutLimpio = limpiarRut(rutFormateado);

    if (!validarRutChileno(rutFormateado)) {
      setMensajeConsultaCliente("El RUT ingresado no es válido.");
      return;
    }

    setCargandoConsultaCliente(true);

    try {
      // Búsqueda flexible: encuentra el RUT formateado o limpio en la BD
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .or(`rut.eq.${rutFormateado},rut.eq.${rutLimpio}`)
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        setMensajeConsultaCliente("No se encontró ninguna tarjeta asociada a este RUT.");
      } else {
        localStorage.setItem('brundeis_cliente_id', data.id);
        setClienteActual(data);
        setInputRutCliente("");
        setVista('cliente');
      }
    } catch {
      setMensajeConsultaCliente("Error de conexión al consultar la tarjeta.");
    } finally {
      setCargandoConsultaCliente(false);
    }
  };

  // =========================================================================
  // 2. REGISTRO DE NUEVO CLIENTE
  // =========================================================================
  const registrarNuevoCliente = async (e) => {
    e.preventDefault();
    setMensajeRegistro("");

    if (!formRegistro.nombre.trim()) {
      setMensajeRegistro("Ingresa tu nombre completo.");
      return;
    }

    const rutFormateado = formRegistro.rut.trim();
    if (!validarRutChileno(rutFormateado)) {
      setMensajeRegistro("El RUT ingresado no es válido.");
      return;
    }

    setCargandoRegistro(true);

    try {
      const { data, error } = await supabase
        .from('clientes')
        .insert([
          {
            nombre: formRegistro.nombre.trim(),
            rut: rutFormateado,
            sellos: 1, // Sello de bienvenida automático
            tarjetas_completadas: 0,
          },
        ])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          setMensajeRegistro("Este RUT ya se encuentra registrado. Ingresa directamente.");
        } else {
          setMensajeRegistro("Error al crear la tarjeta. Intenta nuevamente.");
        }
      } else if (data) {
        localStorage.setItem('brundeis_cliente_id', data.id);
        setClienteActual(data);
        setFormRegistro({ nombre: "", rut: "" });
        setVista('cliente');
      }
    } catch {
      setMensajeRegistro("Error al conectar con la base de datos.");
    } finally {
      setCargandoRegistro(false);
    }
  };

  // =========================================================================
  // 3. CAJA / TERMINAL DE BARRA (BÚSQUEDA EXCLUSIVA POR RUT Y QR)
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
      let data = null;
      let error = null;

      // Si viene por escaneo QR
      if (limpio.startsWith('BRUNDEIS:')) {
        const idCliente = limpio.replace('BRUNDEIS:', '');
        const res = await supabase.from('clientes').select('*').eq('id', idCliente).maybeSingle();
        data = res.data;
        error = res.error;
      } else {
        // Búsqueda manual por RUT
        const rutFormateado = formatearRutEnVivo(limpio);
        const rutLimpio = limpiarRut(limpio);

        if (!validarRutChileno(rutFormateado)) {
          setClienteCaja(null);
          setMensajeCaja({ texto: "El RUT ingresado no es válido.", tipo: "error" });
          setCargandoCaja(false);
          return;
        }

        const res = await supabase
          .from('clientes')
          .select('*')
          .or(`rut.eq.${rutFormateado},rut.eq.${rutLimpio}`)
          .limit(1)
          .maybeSingle();

        data = res.data;
        error = res.error;
      }

      if (error || !data) {
        setClienteCaja(null);
        setMensajeCaja({ texto: "No se encontró ningún cliente registrado con este RUT.", tipo: "error" });
      } else {
        setClienteCaja(data);
        setMensajeCaja({ texto: "Cliente identificado correctamente.", tipo: "exito" });
        setInputRutCaja("");
      }
    } catch {
      setMensajeCaja({ texto: "Error al consultar la base de datos.", tipo: "error" });
    } finally {
      setCargandoCaja(false);
    }
  };

  // Escáner de cámara en caja
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
          () => {}
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
        setMensajeCaja({ texto: "Error al registrar el sello.", tipo: "error" });
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
          sellos: 1,
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
    setInputRutCaja("");
    setMensajeCaja({ texto: "", tipo: "" });
    if (escaneandoQR) detenerEscanerCamara();
  };

  return (
    <div className="relative min-h-screen bg-[#0E0B09] text-[#F5EDE2] flex flex-col items-center justify-start p-4 font-sans select-none overflow-x-hidden">
      
      {/* Fondo visual */}
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
            onClick={() => setVista(clienteActual ? 'cliente' : 'consulta_rut')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
              vista === 'cliente' || vista === 'consulta_rut' || vista === 'registro'
                ? 'bg-[#C98A42] text-[#14100E] shadow-md shadow-[#C98A42]/30 font-bold'
                : 'text-[#A89A90] hover:text-[#F5EDE2]'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            {clienteActual ? 'Mi Tarjeta' : 'Consultar Tarjeta'}
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
        {/* 1. CONSULTA DIRECTA DE TARJETA POR RUT (CLIENTE)                 */}
        {/* ================================================================= */}
        {vista === 'consulta_rut' && !clienteActual && (
          <div className="w-full max-w-sm bg-[#1A1411]/92 backdrop-blur-xl border border-[#4A3B32] rounded-[32px] p-6 shadow-2xl space-y-5">
            <div className="border-b border-[#332822] pb-3 text-center">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#D99B52] uppercase">
                Club Brundeis
              </span>
              <h2 className="text-xl font-black text-[#F5EDE2] mt-0.5">Consulta tu Tarjeta</h2>
              <p className="text-xs text-[#A89A90] mt-1">
                Ingresa únicamente tu RUT para ver tus sellos
              </p>
            </div>

            <form onSubmit={consultarTarjetaCliente} className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-[#A89A90] uppercase tracking-wider">
                    RUT
                  </label>
                  <span className="text-[10px] text-[#A89A90]">Formato automático</span>
                </div>
                <input
                  type="text"
                  maxLength={12}
                  placeholder="Ej: 22.232.223-4"
                  autoFocus
                  required
                  value={inputRutCliente}
                  onChange={(e) => setInputRutCliente(formatearRutEnVivo(e.target.value))}
                  className="w-full bg-[#14100E] border border-[#3E3029] rounded-xl px-4 py-3.5 text-base font-mono text-[#F5EDE2] focus:outline-none focus:border-[#C98A42] transition tracking-wider text-center"
                />
              </div>

              {mensajeConsultaCliente && (
                <p className="text-xs text-[#E57373] text-center font-medium">{mensajeConsultaCliente}</p>
              )}

              <button
                type="submit"
                disabled={cargandoConsultaCliente || !inputRutCliente}
                className="w-full py-4 bg-gradient-to-r from-[#B3762E] to-[#D99B52] hover:brightness-110 text-[#14100E] font-bold rounded-2xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-[#C98A42]/25 transition"
              >
                <LogIn className="w-4 h-4 stroke-[2.5]" />
                <span>{cargandoConsultaCliente ? "Consultando..." : "Ver mi Tarjeta"}</span>
              </button>
            </form>

            <div className="border-t border-[#2C221D] pt-3 text-center">
              <button
                onClick={() => setVista('registro')}
                className="text-xs text-[#D99B52] hover:underline font-medium"
              >
                ¿No tienes tarjeta aún? Regístrate aquí
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 2. REGISTRO DE NUEVO CLIENTE                                      */}
        {/* ================================================================= */}
        {vista === 'registro' && !clienteActual && (
          <div className="w-full max-w-sm bg-[#1A1411]/92 backdrop-blur-xl border border-[#4A3B32] rounded-[32px] p-6 shadow-2xl space-y-5">
            <div className="border-b border-[#332822] pb-3 text-center">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#D99B52] uppercase">
                Bienvenido
              </span>
              <h2 className="text-xl font-black text-[#F5EDE2] mt-0.5">Club Brundeis</h2>
              <p className="text-xs text-[#A89A90] mt-1">
                Regístrate y recibe tu <strong className="text-[#D99B52]">primer sello gratis</strong>.
              </p>
            </div>

            <form onSubmit={registrarNuevoCliente} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#A89A90] uppercase tracking-wider block mb-1">
                  Tu Nombre Completo *
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
                    RUT *
                  </label>
                  <span className="text-[10px] text-[#A89A90]">Formato automático</span>
                </div>
                <input
                  type="text"
                  required
                  maxLength={12}
                  placeholder="Ej: 22.232.223-4"
                  value={formRegistro.rut}
                  onChange={(e) => setFormRegistro(prev => ({ ...prev, rut: formatearRutEnVivo(e.target.value) }))}
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
                onClick={() => setVista('consulta_rut')}
                className="text-xs text-[#D99B52] hover:underline font-medium"
              >
                ¿Ya tienes tarjeta? Consulta con tu RUT
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 3. VISUALIZACIÓN DE TARJETA DE FIDELIZACIÓN                       */}
        {/* ================================================================= */}
        {vista === 'cliente' && clienteActual && (
          <div className="w-full max-w-sm bg-[#1A1411]/92 backdrop-blur-xl border border-[#4A3B32] rounded-[32px] p-6 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#C98A42]/20 rounded-full blur-3xl pointer-events-none" />

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

            {/* Datos Personales */}
            <div className="flex justify-between items-center bg-[#241D19]/90 border border-[#3E3029] rounded-2xl p-3.5 px-4 shadow-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#A89A90] font-semibold">Titular</p>
                <p className="text-base font-bold text-[#F5EDE2]">{clienteActual.nombre}</p>
                <span className="text-[11px] font-mono text-[#D99B52] mt-0.5 block">
                  RUT: {formatearRutEnVivo(clienteActual.rut)}
                </span>
              </div>
              <button
                onClick={() => setMostrarQR(!mostrarQR)}
                className="flex items-center gap-1.5 bg-[#171210] hover:bg-[#2D231E] border border-[#4A3B32] text-[#D99B52] px-3 py-2 rounded-xl text-xs font-semibold transition"
              >
                <QrCode className="w-4 h-4" />
                <span>{mostrarQR ? 'Ocultar' : 'Mi QR'}</span>
              </button>
            </div>

            {/* QR Dinámico */}
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
                  RUT: {formatearRutEnVivo(clienteActual.rut)}
                </div>
              </div>
            )}

            {/* Grilla de Sellos */}
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

            <div className="text-center pt-2">
              <button
                onClick={cerrarSesionCliente}
                className="text-xs text-[#8C7E75] hover:text-[#E57373] transition flex items-center justify-center gap-1 mx-auto"
              >
                <LogOut className="w-3.5 h-3.5" />
                Consultar otro RUT
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 4. TERMINAL DE CAJA (BÚSQUEDA EXCLUSIVA POR RUT Y QR)             */}
        {/* ================================================================= */}
        {vista === 'caja' && (
          <div className="w-full max-w-sm bg-[#1A1411]/92 backdrop-blur-xl border border-[#4A3B32] rounded-[32px] p-6 shadow-2xl space-y-6">
            
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
              <div className="space-y-5">
                <div className="border-b border-[#332822] pb-3 flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-bold text-[#F5EDE2]">Terminal Barra</h2>
                    <p className="text-xs text-[#A89A90]">Identificación por RUT o QR</p>
                  </div>
                  <button
                    onClick={() => {
                      if (escaneandoQR) detenerEscanerCamara();
                      setCajaAutenticada(false);
                    }}
                    title="Bloquear caja"
                    className="text-[#A89A90] hover:text-[#E57373] p-1.5 rounded-lg border border-[#3E3029] bg-[#14100E]"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Botón Escáner Cámara */}
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
                    <div id="reader" className="w-full rounded-xl overflow-hidden bg-black aspect-square" />
                  </div>
                )}

                {/* Búsqueda manual por RUT con autoformato en tiempo real */}
                {!clienteCaja && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-[#A89A90] uppercase tracking-wider block">
                        RUT del Cliente
                      </label>
                      <span className="text-[10px] text-[#A89A90]">Autoformato</span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={12}
                        placeholder="Ej: 22.232.223-4"
                        value={inputRutCaja}
                        onChange={(e) => setInputRutCaja(formatearRutEnVivo(e.target.value))}
                        onKeyDown={(e) => e.key === 'Enter' && buscarClienteEnCaja(inputRutCaja)}
                        className="flex-1 bg-[#14100E] border border-[#3E3029] rounded-xl px-4 py-3 text-sm font-mono text-[#F5EDE2] focus:outline-none focus:border-[#C98A42] transition tracking-wider"
                      />
                      <button
                        onClick={() => buscarClienteEnCaja(inputRutCaja)}
                        disabled={cargandoCaja || !inputRutCaja}
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

                {/* Cliente identificado en caja */}
                {clienteCaja ? (
                  <div className="space-y-4">
                    <div className="bg-[#241D19] border border-[#4A3B32] rounded-2xl p-4 space-y-2.5 shadow-sm">
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

                      <div className="pt-2 border-t border-[#332822]">
                        <span className="text-[#8C7E75] block text-[10px] uppercase font-semibold">RUT del Titular</span>
                        <span className="font-mono text-[#D99B52] text-sm font-bold">
                          {formatearRutEnVivo(clienteCaja.rut)}
                        </span>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-[#332822] text-xs">
                        <span className="text-[#A89A90]">Sellos acumulados:</span>
                        <span className="text-[#D99B52] font-black text-sm">{clienteCaja.sellos} / {META_SELLOS}</span>
                      </div>
                    </div>

                    {/* Botones de acreditación y canje */}
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
                    Ningún cliente seleccionado.<br />Escanea un código QR o ingresa el RUT arriba para comenzar.
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