import React, { useState, useEffect, useRef } from 'react';
import { 
  Coffee, Award, Sparkles, Check, Smartphone, Store, Plus, 
  RefreshCw, Star, QrCode, Search, UserCheck, ArrowRight, 
  Lock, KeyRound, LogOut, Camera, X, Phone, Hash
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from './supabaseClient';

const PIN_CAJA_CORRECTO = "Brunde1865";
const META_SELLOS = 8;
const PREMIO_TEXTO = "Café de Especialidad o Postre a elección";

// =========================================================================
// UTILIDADES DE FORMATO EN TIEMPO REAL
// =========================================================================

// Limpia el RUT dejando solo números y K
const limpiarRut = (valor) => {
  if (!valor) return '';
  return valor.toString().replace(/[^0-9kK]/g, '').toUpperCase();
};

// Formatea en tiempo real: XX.XXX.XXX-X
const formatearRutEnVivo = (valor) => {
  const limpio = limpiarRut(valor);
  if (!limpio) return '';
  const recortado = limpio.slice(0, 9);
  if (recortado.length === 1) return recortado;

  const cuerpo = recortado.slice(0, -1);
  const dv = recortado.slice(-1);
  const cuerpoConPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpoConPuntos}-${dv}`;
};

// Extrae los 8 dígitos móviles tras el +56 9
const extraer8DigitosCelular = (valor) => {
  if (!valor) return '';
  let soloNumeros = valor.toString().replace(/\D/g, '');
  if (soloNumeros.startsWith('569')) soloNumeros = soloNumeros.slice(3);
  else if (soloNumeros.startsWith('56')) soloNumeros = soloNumeros.slice(2);
  else if (soloNumeros.startsWith('9') && soloNumeros.length > 8) soloNumeros = soloNumeros.slice(1);
  return soloNumeros.slice(0, 8);
};

// Formatea celular en tiempo real: XXXX XXXX
const formatear8DigitosEnVivo = (valor) => {
  const d = extraer8DigitosCelular(valor);
  if (!d) return '';
  if (d.length <= 4) return d;
  return `${d.slice(0, 4)} ${d.slice(4)}`;
};

export default function App() {
  const [vista, setVista] = useState('cliente'); // 'cliente' | 'consulta' | 'registro' | 'caja'
  const [mostrarQR, setMostrarQR] = useState(false);

  // 1. Sesión del cliente activo
  const [clienteActual, setClienteActual] = useState(null);

  // 2. Consulta de tarjeta (Una sola ranura)
  const [metodoConsulta, setMetodoConsulta] = useState('rut'); // 'rut' | 'celular'
  const [valorRanuraConsulta, setValorRanuraConsulta] = useState("");
  const [mensajeConsulta, setMensajeConsulta] = useState("");
  const [cargandoConsulta, setCargandoConsulta] = useState(false);

  // 3. Formulario de registro (Nuevo cliente)
  const [formRegistro, setFormRegistro] = useState({ nombre: "", rut: "", celular: "" });
  const [mensajeRegistro, setMensajeRegistro] = useState("");
  const [cargandoRegistro, setCargandoRegistro] = useState(false);

  // 4. Módulo de Caja (Una sola ranura)
  const [cajaAutenticada, setCajaAutenticada] = useState(false);
  const [pinIngresado, setPinIngresado] = useState("");
  const [errorPin, setErrorPin] = useState("");
  const [metodoCaja, setMetodoCaja] = useState('rut'); // 'rut' | 'celular'
  const [valorRanuraCaja, setValorRanuraCaja] = useState("");
  const [clienteCaja, setClienteCaja] = useState(null);
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
      setVista('consulta');
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
        setVista('consulta');
      }
    } catch {
      localStorage.removeItem('brundeis_cliente_id');
      setClienteActual(null);
      setVista('consulta');
    }
  };

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
    setValorRanuraConsulta("");
    setVista('consulta');
  };

  // =========================================================================
  // 1. CONSULTA DE TARJETA (UNA SOLA RANURA ADAPTABLE)
  // =========================================================================
  const handleCambioMetodoConsulta = (metodo) => {
    setMetodoConsulta(metodo);
    setValorRanuraConsulta("");
    setMensajeConsulta("");
  };

  const handleInputRanuraConsulta = (e) => {
    const raw = e.target.value;
    if (metodoConsulta === 'rut') {
      setValorRanuraConsulta(formatearRutEnVivo(raw));
    } else {
      setValorRanuraConsulta(formatear8DigitosEnVivo(raw));
    }
  };

  const consultarTarjeta = async (e) => {
    e.preventDefault();
    setMensajeConsulta("");

    if (!valorRanuraConsulta.trim()) {
      setMensajeConsulta(`Ingresa un ${metodoConsulta === 'rut' ? 'RUT' : 'número celular'}.`);
      return;
    }

    setCargandoConsulta(true);

    try {
      let data = null;

      if (metodoConsulta === 'rut') {
        const rutFormateado = formatearRutEnVivo(valorRanuraConsulta);
        const rutLimpio = limpiarRut(valorRanuraConsulta);

        const res = await supabase
          .from('clientes')
          .select('*')
          .or(`rut.eq.${rutFormateado},rut.eq.${rutLimpio}`)
          .limit(1)
          .maybeSingle();
        data = res.data;
      } else {
        const cel8 = extraer8DigitosCelular(valorRanuraConsulta);
        if (cel8.length !== 8) {
          setMensajeConsulta("El número celular debe tener 8 dígitos.");
          setCargandoConsulta(false);
          return;
        }

        const res = await supabase
          .from('clientes')
          .select('*')
          .ilike('telefono', `%${cel8}%`)
          .limit(1)
          .maybeSingle();
        data = res.data;
      }

      if (!data) {
        setMensajeConsulta(`No encontramos ninguna tarjeta con ese ${metodoConsulta === 'rut' ? 'RUT' : 'celular'}.`);
      } else {
        localStorage.setItem('brundeis_cliente_id', data.id);
        setClienteActual(data);
        setValorRanuraConsulta("");
        setVista('cliente');
      }
    } catch {
      setMensajeConsulta("Error de conexión al consultar la base de datos.");
    } finally {
      setCargandoConsulta(false);
    }
  };

  // =========================================================================
  // 2. REGISTRO DE NUEVO CLIENTE
  // =========================================================================
  const registrarNuevoCliente = async (e) => {
    e.preventDefault();
    setMensajeRegistro("");

    const nombre = formRegistro.nombre.trim();
    const rutFormateado = formatearRutEnVivo(formRegistro.rut);
    const cel8 = extraer8DigitosCelular(formRegistro.celular);
    const celularGuardado = `+56 9 ${cel8.length > 4 ? `${cel8.slice(0, 4)}${cel8.slice(4)}` : cel8}`;

    if (!nombre) {
      setMensajeRegistro("Ingresa tu nombre completo.");
      return;
    }
    if (limpiarRut(rutFormateado).length < 7) {
      setMensajeRegistro("Ingresa un RUT válido.");
      return;
    }
    if (cel8.length !== 8) {
      setMensajeRegistro("Ingresa los 8 dígitos de tu celular (+56 9).");
      return;
    }

    setCargandoRegistro(true);

    try {
      const rutLimpio = limpiarRut(rutFormateado);
      const { data: existente } = await supabase
        .from('clientes')
        .select('id')
        .or(`rut.eq.${rutFormateado},rut.eq.${rutLimpio},telefono.ilike.%${cel8}%`)
        .limit(1)
        .maybeSingle();

      if (existente) {
        setMensajeRegistro("Este RUT o celular ya tiene una tarjeta. Búscate directamente en la pantalla anterior.");
        setCargandoRegistro(false);
        return;
      }

      const { data, error } = await supabase
        .from('clientes')
        .insert([
          {
            nombre: nombre,
            rut: rutFormateado,
            telefono: celularGuardado,
            sellos: 1, // Sello de bienvenida automático
            tarjetas_completadas: 0,
          },
        ])
        .select()
        .single();

      if (error) {
        setMensajeRegistro("Error al registrar en la base de datos.");
      } else if (data) {
        localStorage.setItem('brundeis_cliente_id', data.id);
        setClienteActual(data);
        setFormRegistro({ nombre: "", rut: "", celular: "" });
        setVista('cliente');
      }
    } catch {
      setMensajeRegistro("Error de conexión al guardar.");
    } finally {
      setCargandoRegistro(false);
    }
  };

  // =========================================================================
  // 3. CAJA (UNA SOLA RANURA ADAPTABLE + CÁMARA QR)
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

  const handleCambioMetodoCaja = (metodo) => {
    setMetodoCaja(metodo);
    setValorRanuraCaja("");
    setMensajeCaja({ texto: "", tipo: "" });
  };

  const handleInputRanuraCaja = (e) => {
    const raw = e.target.value;
    if (metodoCaja === 'rut') {
      setValorRanuraCaja(formatearRutEnVivo(raw));
    } else {
      setValorRanuraCaja(formatear8DigitosEnVivo(raw));
    }
  };

  const buscarClienteEnCaja = async (e) => {
    if (e) e.preventDefault();
    if (!valorRanuraCaja.trim()) return;

    setCargandoCaja(true);
    setMensajeCaja({ texto: "", tipo: "" });

    try {
      let data = null;

      if (metodoCaja === 'rut') {
        const rutFormateado = formatearRutEnVivo(valorRanuraCaja);
        const rutLimpio = limpiarRut(valorRanuraCaja);

        const res = await supabase
          .from('clientes')
          .select('*')
          .or(`rut.eq.${rutFormateado},rut.eq.${rutLimpio}`)
          .limit(1)
          .maybeSingle();
        data = res.data;
      } else {
        const cel8 = extraer8DigitosCelular(valorRanuraCaja);
        if (cel8.length !== 8) {
          setMensajeCaja({ texto: "Ingresa los 8 dígitos del celular.", tipo: "error" });
          setCargandoCaja(false);
          return;
        }

        const res = await supabase
          .from('clientes')
          .select('*')
          .ilike('telefono', `%${cel8}%`)
          .limit(1)
          .maybeSingle();
        data = res.data;
      }

      if (!data) {
        setClienteCaja(null);
        setMensajeCaja({ texto: "No se encontró ningún cliente registrado.", tipo: "error" });
      } else {
        setClienteCaja(data);
        setMensajeCaja({ texto: "Cliente identificado correctamente.", tipo: "exito" });
        setValorRanuraCaja("");
      }
    } catch {
      setMensajeCaja({ texto: "Error al consultar la base de datos.", tipo: "error" });
    } finally {
      setCargandoCaja(false);
    }
  };

  const identificarPorQR = async (qrDecodificado) => {
    setCargandoCaja(true);
    setMensajeCaja({ texto: "", tipo: "" });

    try {
      const limpio = qrDecodificado.trim();
      let data = null;

      if (limpio.startsWith('BRUNDEIS:')) {
        const idCliente = limpio.replace('BRUNDEIS:', '');
        const res = await supabase.from('clientes').select('*').eq('id', idCliente).maybeSingle();
        data = res.data;
      } else {
        const res = await supabase
          .from('clientes')
          .select('*')
          .or(`rut.ilike.%${limpio}%,telefono.ilike.%${limpio}%`)
          .limit(1)
          .maybeSingle();
        data = res.data;
      }

      if (!data) {
        setClienteCaja(null);
        setMensajeCaja({ texto: "Código QR no válido o cliente no registrado.", tipo: "error" });
      } else {
        setClienteCaja(data);
        setMensajeCaja({ texto: "Cliente identificado por QR.", tipo: "exito" });
      }
    } catch {
      setMensajeCaja({ texto: "Error al leer el código QR.", tipo: "error" });
    } finally {
      setCargandoCaja(false);
    }
  };

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
            identificarPorQR(decodedText);
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
    setValorRanuraCaja("");
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

      {/* Contenedor central */}
      <div className="relative z-10 w-full flex flex-col items-center">
        
        {/* Selector de navegación superior */}
        <div className="flex bg-[#1E1815]/95 backdrop-blur-md border border-[#4A3B32] p-1.5 rounded-2xl mb-6 shadow-2xl">
          <button
            onClick={() => setVista(clienteActual ? 'cliente' : 'consulta')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all ${
              vista === 'cliente' || vista === 'consulta' || vista === 'registro'
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
        {/* 1. CONSULTA: DOS OPCIONES ARRIBA Y UNA SOLA RANURA DE ENTRADA    */}
        {/* ================================================================= */}
        {vista === 'consulta' && !clienteActual && (
          <div className="w-full max-w-sm bg-[#1A1411]/92 backdrop-blur-xl border border-[#4A3B32] rounded-[32px] p-6 shadow-2xl space-y-5">
            <div className="border-b border-[#332822] pb-3 text-center">
              <span className="text-[10px] font-bold tracking-[0.2em] text-[#D99B52] uppercase">
                Club Brundeis
              </span>
              <h2 className="text-xl font-black text-[#F5EDE2] mt-0.5">Consulta tu Tarjeta</h2>
              <p className="text-xs text-[#A89A90] mt-1">
                Elige el método y escribe en la ranura
              </p>
            </div>

            {/* Selector de 2 opciones */}
            <div className="grid grid-cols-2 bg-[#14100E] p-1 rounded-xl border border-[#3E3029]">
              <button
                type="button"
                onClick={() => handleCambioMetodoConsulta('rut')}
                className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
                  metodoConsulta === 'rut'
                    ? 'bg-[#C98A42] text-[#14100E] font-bold shadow'
                    : 'text-[#A89A90] hover:text-[#F5EDE2]'
                }`}
              >
                <Hash className="w-3.5 h-3.5" />
                Buscar por RUT
              </button>
              <button
                type="button"
                onClick={() => handleCambioMetodoConsulta('celular')}
                className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
                  metodoConsulta === 'celular'
                    ? 'bg-[#C98A42] text-[#14100E] font-bold shadow'
                    : 'text-[#A89A90] hover:text-[#F5EDE2]'
                }`}
              >
                <Phone className="w-3.5 h-3.5" />
                Buscar por Celular
              </button>
            </div>

            {/* FORMULARIO CON UNA SOLA RANURA */}
            <form onSubmit={consultarTarjeta} className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-[#A89A90] uppercase tracking-wider">
                    {metodoConsulta === 'rut' ? 'RUT del Cliente' : 'Celular (Chile)'}
                  </label>
                  <span className="text-[10px] text-[#A89A90]">
                    {metodoConsulta === 'rut' ? 'Formato automático' : '+56 9 fijo'}
                  </span>
                </div>

                <div className="relative flex items-center">
                  {metodoConsulta === 'celular' && (
                    <span className="absolute left-4 text-sm font-mono text-[#D99B52] pointer-events-none">
                      +56 9
                    </span>
                  )}
                  <input
                    type={metodoConsulta === 'rut' ? 'text' : 'tel'}
                    maxLength={metodoConsulta === 'rut' ? 12 : 9}
                    placeholder={metodoConsulta === 'rut' ? 'Ej: 22.232.223-4' : '1234 5678'}
                    autoFocus
                    required
                    value={valorRanuraConsulta}
                    onChange={handleInputRanuraConsulta}
                    className={`w-full bg-[#14100E] border border-[#3E3029] rounded-xl py-3.5 text-base font-mono text-[#F5EDE2] focus:outline-none focus:border-[#C98A42] transition tracking-wider ${
                      metodoConsulta === 'rut' ? 'px-4 text-center' : 'pl-20 pr-4'
                    }`}
                  />
                </div>
              </div>

              {mensajeConsulta && (
                <p className="text-xs text-[#E57373] text-center font-medium">{mensajeConsulta}</p>
              )}

              <button
                type="submit"
                disabled={cargandoConsulta}
                className="w-full py-4 bg-gradient-to-r from-[#B3762E] to-[#D99B52] hover:brightness-110 text-[#14100E] font-bold rounded-2xl flex items-center justify-center gap-2 text-sm shadow-lg shadow-[#C98A42]/25 transition"
              >
                <Search className="w-4 h-4 stroke-[2.5]" />
                <span>{cargandoConsulta ? "Buscando..." : "Ver mi Tarjeta"}</span>
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
        {/* 2. REGISTRO NUEVO CLIENTE (NOMBRE + RUT + CELULAR)                */}
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
                  placeholder="Ej: Rosa Castillo"
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
                  <span className="text-[10px] text-[#A89A90]">Automático</span>
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

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-[#A89A90] uppercase tracking-wider">
                    Celular (Chile) *
                  </label>
                  <span className="text-[10px] text-[#A89A90]">+56 9</span>
                </div>
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-sm font-mono text-[#D99B52] pointer-events-none">
                    +56 9
                  </span>
                  <input
                    type="tel"
                    required
                    maxLength={9}
                    placeholder="1234 5678"
                    value={formRegistro.celular}
                    onChange={(e) => {
                      const d = formatear8DigitosEnVivo(e.target.value);
                      setFormRegistro(prev => ({ ...prev, celular: d }));
                    }}
                    className="w-full bg-[#14100E] border border-[#3E3029] rounded-xl pl-20 pr-4 py-3 text-sm font-mono text-[#F5EDE2] focus:outline-none focus:border-[#C98A42] transition tracking-wider"
                  />
                </div>
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
                onClick={() => setVista('consulta')}
                className="text-xs text-[#D99B52] hover:underline font-medium"
              >
                ¿Ya tienes tarjeta? Consulta con tu RUT o Celular
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 3. TARJETA DIGITAL (VISTA CLIENTE)                                */}
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

            {/* Ficha titular */}
            <div className="flex justify-between items-center bg-[#241D19]/90 border border-[#3E3029] rounded-2xl p-3.5 px-4 shadow-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#A89A90] font-semibold">Titular</p>
                <p className="text-base font-bold text-[#F5EDE2]">{clienteActual.nombre}</p>
                <div className="flex flex-col text-[11px] font-mono mt-0.5 space-y-0.5">
                  <span className="text-[#D99B52]">RUT: {formatearRutEnVivo(clienteActual.rut)}</span>
                  <span className="text-[#A89A90] text-[10px]">{clienteActual.telefono}</span>
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
                  {formatearRutEnVivo(clienteActual.rut)}
                </div>
              </div>
            )}

            {/* Sellos */}
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
                Consultar otra cuenta / Salir
              </button>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* 4. TERMINAL DE CAJA (DOS OPCIONES ARRIBA Y UNA RANURA)            */}
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
                    <p className="text-xs text-[#A89A90]">Buscar o escanear cliente</p>
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

                {/* Botón de Escáner de Cámara */}
                {!clienteCaja && !escaneandoQR && (
                  <button
                    onClick={iniciarEscanerCamara}
                    className="w-full py-3 bg-[#2A201B] hover:bg-[#342822] border border-[#C98A42]/40 rounded-xl text-[#D99B52] font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition"
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

                {/* CAJA: SELECTOR CON 2 OPCIONES Y UNA SOLA RANURA */}
                {!clienteCaja && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 bg-[#14100E] p-1 rounded-xl border border-[#3E3029]">
                      <button
                        type="button"
                        onClick={() => handleCambioMetodoCaja('rut')}
                        className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
                          metodoCaja === 'rut'
                            ? 'bg-[#C98A42] text-[#14100E] font-bold shadow'
                            : 'text-[#A89A90] hover:text-[#F5EDE2]'
                        }`}
                      >
                        <Hash className="w-3.5 h-3.5" />
                        Opción A: RUT
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCambioMetodoCaja('celular')}
                        className={`py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition ${
                          metodoCaja === 'celular'
                            ? 'bg-[#C98A42] text-[#14100E] font-bold shadow'
                            : 'text-[#A89A90] hover:text-[#F5EDE2]'
                        }`}
                      >
                        <Phone className="w-3.5 h-3.5" />
                        Opción B: Celular
                      </button>
                    </div>

                    <form onSubmit={buscarClienteEnCaja} className="space-y-2">
                      <div className="flex justify-between items-center mb-0.5">
                        <label className="text-xs font-semibold text-[#A89A90] uppercase tracking-wider block">
                          {metodoCaja === 'rut' ? 'RUT del Cliente' : 'Celular (Chile)'}
                        </label>
                        <span className="text-[10px] text-[#A89A90]">
                          {metodoCaja === 'rut' ? 'Autoformato' : '+56 9 fijo'}
                        </span>
                      </div>

                      <div className="flex gap-2">
                        <div className="relative flex-1 flex items-center">
                          {metodoCaja === 'celular' && (
                            <span className="absolute left-3 text-xs font-mono text-[#D99B52] pointer-events-none">
                              +56 9
                            </span>
                          )}
                          <input
                            type={metodoCaja === 'rut' ? 'text' : 'tel'}
                            maxLength={metodoCaja === 'rut' ? 12 : 9}
                            placeholder={metodoCaja === 'rut' ? 'Ej: 22.232.223-4' : '1234 5678'}
                            value={valorRanuraCaja}
                            onChange={handleInputRanuraCaja}
                            className={`w-full bg-[#14100E] border border-[#3E3029] rounded-xl py-3 text-sm font-mono text-[#F5EDE2] focus:outline-none focus:border-[#C98A42] transition tracking-wider ${
                              metodoCaja === 'rut' ? 'px-4' : 'pl-16 pr-3'
                            }`}
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={cargandoCaja || !valorRanuraCaja}
                          className="bg-[#241D19] border border-[#4A3B32] hover:bg-[#2F241F] text-[#D99B52] px-4 rounded-xl flex items-center justify-center transition"
                        >
                          <Search className="w-4 h-4" />
                        </button>
                      </div>
                    </form>
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

                      <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-[#332822]">
                        <div>
                          <span className="text-[#8C7E75] block text-[10px] uppercase font-semibold">RUT</span>
                          <span className="font-mono text-[#D99B52] font-bold">{formatearRutEnVivo(clienteCaja.rut)}</span>
                        </div>
                        <div>
                          <span className="text-[#8C7E75] block text-[10px] uppercase font-semibold">Celular</span>
                          <span className="font-mono text-[#A89A90]">{clienteCaja.telefono}</span>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-2 border-t border-[#332822] text-xs">
                        <span className="text-[#A89A90]">Sellos acumulados:</span>
                        <span className="text-[#D99B52] font-black text-sm">{clienteCaja.sellos} / {META_SELLOS}</span>
                      </div>
                    </div>

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
                    Ningún cliente seleccionado.<br />Elige RUT o Celular arriba, o escanea el QR.
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